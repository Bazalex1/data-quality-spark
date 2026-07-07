from pyspark.sql import SparkSession
from pyspark.sql.functions import col
from sqlalchemy.orm import Session
from datetime import datetime
import json
import os
import re

from app.core.database import SessionLocal
from app.models.run import Run
from app.models.result import Result
from app.models.rule import Rule
from app.models.dataset import Dataset

COLUMN_LEVEL_RULES = {
    "not_null",
    "unique",
    "min_max",
    "not_equal",
    "not_zero",
    "regex_match",
    "accepted_values",
}

DATASET_LEVEL_RULES = {
    "row_count",
    "schema_match",
}


def get_spark_session() -> SparkSession:
    return (
        SparkSession.builder.appName("DataQualityEngine")
        .master("local[*]")
        .config("spark.sql.shuffle.partitions", "4")
        .getOrCreate()
    )


def run_quality_checks(run_id: int):
    db: Session = SessionLocal()
    spark = None
    run = None
    try:
        run = db.query(Run).filter(Run.id == run_id).first()
        if not run:
            return

        run.status = "running"
        db.commit()

        dataset = db.query(Dataset).filter(Dataset.id == run.dataset_id).first()
        if not dataset:
            run.status = "failed"
            db.commit()
            return

        config = dataset.source_config_json
        if isinstance(config, str):
            try:
                config = json.loads(config)
            except json.JSONDecodeError:
                config = {"path": config}

        file_path = config.get("path") if isinstance(config, dict) else None

        if not file_path or not os.path.exists(file_path):
            run.status = "failed"
            db.commit()
            return

        spark = get_spark_session()
        df = spark.read.option("header", True).csv(file_path)

        active_rules = (
            db.query(Rule)
            .filter(Rule.dataset_id == run.dataset_id, Rule.is_active == True)
            .all()
        )

        results_to_save = []
        passed_count = 0

        for rule in active_rules:
            passed, failed_count, details = execute_single_rule(df, rule)

            result = Result(
                run_id=run_id,
                rule_id=rule.id,
                passed=passed,
                failed_count=failed_count,
                details_json=details,
            )
            results_to_save.append(result)

            if passed:
                passed_count += 1

        db.add_all(results_to_save)

        run.status = "success"
        run.finished_at = datetime.utcnow()
        run.summary_json = {
            "total_rules": len(active_rules),
            "passed": passed_count,
            "failed": len(active_rules) - passed_count,
        }
        db.commit()

    except Exception as e:
        print(f"Error in execution: {e}")
        if run:
            run.status = "failed"
            run.finished_at = datetime.utcnow()
            db.commit()
    finally:
        db.close()
        if spark:
            spark.stop()


def is_column_level_rule(rule_type: str) -> bool:
    return rule_type.lower() in COLUMN_LEVEL_RULES


def is_dataset_level_rule(rule_type: str) -> bool:
    return rule_type.lower() in DATASET_LEVEL_RULES


def _column_exists(df, column: str) -> bool:
    return column in df.columns


def _sample_bad_rows(bad_df, failed_count: int) -> list:
    if failed_count <= 0:
        return []
    return bad_df.limit(5).toPandas().to_dict("records")


def _error_result(message: str):
    return False, 1, {"message": message, "sample_bad_rows": []}


def _require_column(df, column: str | None):
    if not column:
        return _error_result("Column name is required for column-level rule")
    if not _column_exists(df, column):
        return _error_result(f"Column '{column}' does not exist in dataset")
    return None


def execute_single_rule(df, rule: Rule):
    """Выполняет одно правило и возвращает примеры проблемных строк"""
    rule_type = rule.rule_type.lower()
    column = rule.column_name
    params = rule.params_json or {}

    if is_column_level_rule(rule_type):
        column_error = _require_column(df, column)
        if column_error:
            return column_error

    if rule_type == "not_null":
        bad_df = df.filter(col(column).isNull())
        failed_count = bad_df.count()
        passed = failed_count == 0
        return (
            passed,
            failed_count,
            {
                "null_count": failed_count,
                "sample_bad_rows": _sample_bad_rows(bad_df, failed_count),
            },
        )

    if rule_type == "unique":
        duplicates = df.groupBy(column).count().filter("count > 1")
        failed_count = duplicates.count()
        passed = failed_count == 0
        return (
            passed,
            failed_count,
            {
                "duplicate_count": failed_count,
                "sample_bad_rows": _sample_bad_rows(duplicates, failed_count),
            },
        )

    if rule_type == "min_max":
        min_val = params.get("min")
        max_val = params.get("max")
        if min_val is None or max_val is None:
            return _error_result("Parameters 'min' and 'max' are required for min_max rule")

        bad_df = df.filter((col(column) < min_val) | (col(column) > max_val))
        failed_count = bad_df.count()
        passed = failed_count == 0
        return (
            passed,
            failed_count,
            {
                "out_of_range": failed_count,
                "min": min_val,
                "max": max_val,
                "sample_bad_rows": _sample_bad_rows(bad_df, failed_count),
            },
        )

    if rule_type in ("not_equal", "not_zero"):
        value = params.get("value")
        if value is None:
            return _error_result("Parameter 'value' is required")

        bad_df = df.filter(col(column) == value)
        failed_count = bad_df.count()
        passed = failed_count == 0
        return (
            passed,
            failed_count,
            {
                "failed_count": failed_count,
                "expected_not_equal": value,
                "sample_bad_rows": _sample_bad_rows(bad_df, failed_count),
            },
        )

    if rule_type == "regex_match":
        pattern = params.get("pattern")
        if not pattern:
            return _error_result("Parameter 'pattern' is required for regex_match rule")

        try:
            re.compile(pattern)
        except re.error as exc:
            return _error_result(f"Invalid regex pattern: {exc}")

        bad_df = df.filter(
            col(column).isNull() | (~col(column).rlike(pattern))
        )
        failed_count = bad_df.count()
        passed = failed_count == 0
        return (
            passed,
            failed_count,
            {
                "pattern": pattern,
                "failed_count": failed_count,
                "sample_bad_rows": _sample_bad_rows(bad_df, failed_count),
            },
        )

    if rule_type == "accepted_values":
        values = params.get("values")
        if not isinstance(values, list) or len(values) == 0:
            return _error_result(
                "Parameter 'values' must be a non-empty array for accepted_values rule"
            )

        bad_df = df.filter(~col(column).isin(values))
        failed_count = bad_df.count()
        passed = failed_count == 0
        return (
            passed,
            failed_count,
            {
                "accepted_values": values,
                "failed_count": failed_count,
                "sample_bad_rows": _sample_bad_rows(bad_df, failed_count),
            },
        )

    if rule_type == "row_count":
        total_rows = df.count()
        min_rows = params.get("min_rows")
        max_rows = params.get("max_rows")

        if min_rows is None and max_rows is None:
            return _error_result(
                "At least one of 'min_rows' or 'max_rows' is required for row_count rule"
            )

        violations = []
        if min_rows is not None and total_rows < min_rows:
            violations.append(f"row count {total_rows} is below min_rows {min_rows}")
        if max_rows is not None and total_rows > max_rows:
            violations.append(f"row count {total_rows} exceeds max_rows {max_rows}")

        passed = len(violations) == 0
        failed_count = 0 if passed else 1

        return (
            passed,
            failed_count,
            {
                "total_rows": total_rows,
                "min_rows": min_rows,
                "max_rows": max_rows,
                "violations": violations,
                "sample_bad_rows": [],
            },
        )

    if rule_type == "schema_match":
        expected_columns = params.get("expected_columns")
        if not isinstance(expected_columns, list) or len(expected_columns) == 0:
            return _error_result(
                "Parameter 'expected_columns' must be a non-empty array for schema_match rule"
            )

        actual_columns = df.columns
        missing_columns = [
            expected_col
            for expected_col in expected_columns
            if expected_col not in actual_columns
        ]
        passed = len(missing_columns) == 0
        failed_count = len(missing_columns)

        return (
            passed,
            failed_count,
            {
                "expected_columns": expected_columns,
                "actual_columns": actual_columns,
                "missing_columns": missing_columns,
                "sample_bad_rows": [],
            },
        )

    return _error_result(f"Rule type '{rule_type}' is not implemented")