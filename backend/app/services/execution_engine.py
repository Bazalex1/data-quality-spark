from pyspark.sql import SparkSession, DataFrame
from pyspark.sql.functions import col, current_timestamp, expr, max as spark_max, to_timestamp
from sqlalchemy.orm import Session
from datetime import datetime, timezone
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
    "freshness",
    "null_percent",
    "date_not_future",
}

DATASET_LEVEL_RULES = {
    "row_count",
    "schema_match",
    "custom_sql",
}

SUPPORTED_SPARK_FORMATS = {"csv", "parquet", "json", "orc"}


def get_spark_session() -> SparkSession:
    return (
        SparkSession.builder.appName("DataQualityEngine")
        .master("local[*]")
        .config("spark.sql.shuffle.partitions", "4")
        .config("spark.ui.enabled", "false")
        .getOrCreate()
    )


def parse_source_config(source_config_json) -> dict:
    """Нормализует source_config_json в dict с ключами path/format/options."""
    if source_config_json is None:
        return {}

    config = source_config_json
    if isinstance(config, str):
        try:
            config = json.loads(config)
        except json.JSONDecodeError:
            return {"path": config.strip()} if config.strip() else {}

    if not isinstance(config, dict):
        return {}

    return config


def resolve_read_format(source_type: str | None, config: dict) -> str:
    """Определяет формат чтения Spark по source_type и config.format."""
    explicit = (config.get("format") or "").strip().lower()
    if explicit:
        return explicit

    st = (source_type or "").strip().lower()
    if st in ("spark_df", "spark"):
        # Типичный артефакт Spark-пайплайна — parquet
        return "parquet"
    if st in ("csv", "file", "path", ""):
        return "csv"
    if st in SUPPORTED_SPARK_FORMATS:
        return st
    return "csv"


def load_dataset_dataframe(spark: SparkSession, dataset: Dataset) -> DataFrame:
    """
    Читает датасет через Spark.

    source_type:
      - path | file | csv  → CSV (или format из config)
      - spark_df | spark   → parquet по умолчанию (или format из config)
    source_config_json: {"path": "...", "format": "csv|parquet|json|orc", "options": {...}}
    """
    config = parse_source_config(dataset.source_config_json)
    file_path = config.get("path")
    if not file_path:
        raise FileNotFoundError("Dataset path is not configured in source_config_json")

    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Dataset file/path not found: {file_path}")

    fmt = resolve_read_format(dataset.source_type, config)
    options = config.get("options") if isinstance(config.get("options"), dict) else {}

    reader = spark.read
    for key, value in options.items():
        reader = reader.option(str(key), value)

    if fmt == "csv":
        return (
            reader.option("header", options.get("header", True))
            .option("inferSchema", options.get("inferSchema", True))
            .csv(file_path)
        )
    if fmt == "parquet":
        return reader.parquet(file_path)
    if fmt == "json":
        return reader.json(file_path)
    if fmt == "orc":
        return reader.orc(file_path)

    # Произвольный Spark format
    return reader.format(fmt).load(file_path)


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
            run.finished_at = datetime.now(timezone.utc)
            run.summary_json = {"error": "Dataset not found"}
            db.commit()
            return

        spark = get_spark_session()
        try:
            df = load_dataset_dataframe(spark, dataset)
        except FileNotFoundError as exc:
            run.status = "failed"
            run.finished_at = datetime.now(timezone.utc)
            run.summary_json = {"error": str(exc)}
            db.commit()
            return

        active_rules = (
            db.query(Rule)
            .filter(Rule.dataset_id == run.dataset_id, Rule.is_active == True)  # noqa: E712
            .all()
        )

        # Повторный execute не должен дублировать results
        db.query(Result).filter(Result.run_id == run_id).delete()

        results_to_save = []
        passed_count = 0

        for rule in active_rules:
            passed, failed_count, details = execute_single_rule(df, rule, spark=spark)

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
        run.finished_at = datetime.now(timezone.utc)
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
            run.finished_at = datetime.now(timezone.utc)
            run.summary_json = {"error": str(e)}
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


def execute_single_rule(df: DataFrame, rule: Rule, spark: SparkSession | None = None):
    """Выполняет одно правило и возвращает примеры проблемных строк."""
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

        bad_df = df.filter(col(column).isNull() | (~col(column).rlike(pattern)))
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

    if rule_type == "freshness":
        max_age_hours = params.get("max_age_hours")
        max_age_days = params.get("max_age_days")
        if max_age_hours is None and max_age_days is None:
            return _error_result(
                "Parameter 'max_age_hours' or 'max_age_days' is required for freshness rule"
            )

        try:
            hours = float(max_age_hours) if max_age_hours is not None else float(max_age_days) * 24
        except (TypeError, ValueError):
            return _error_result("max_age_hours / max_age_days must be numeric")

        if hours < 0:
            return _error_result("max_age must be non-negative")

        ts_col = to_timestamp(col(column))
        max_row = df.agg(spark_max(ts_col).alias("max_ts")).collect()[0]
        max_ts = max_row["max_ts"]
        if max_ts is None:
            return (
                False,
                1,
                {
                    "message": f"Column '{column}' has no parseable timestamps",
                    "max_age_hours": hours,
                    "sample_bad_rows": [],
                },
            )

        now = datetime.now(timezone.utc).replace(tzinfo=None)
        # Spark timestamp may be naive
        if getattr(max_ts, "tzinfo", None) is not None:
            max_ts_naive = max_ts.astimezone(timezone.utc).replace(tzinfo=None)
        else:
            max_ts_naive = max_ts

        age_hours = (now - max_ts_naive).total_seconds() / 3600.0
        passed = age_hours <= hours
        return (
            passed,
            0 if passed else 1,
            {
                "column": column,
                "max_timestamp": str(max_ts),
                "age_hours": round(age_hours, 4),
                "max_age_hours": hours,
                "sample_bad_rows": [],
            },
        )

    if rule_type == "null_percent":
        max_null_percent = params.get("max_null_percent")
        if max_null_percent is None:
            return _error_result(
                "Parameter 'max_null_percent' is required for null_percent rule"
            )
        try:
            threshold = float(max_null_percent)
        except (TypeError, ValueError):
            return _error_result("max_null_percent must be numeric")

        if threshold < 0 or threshold > 100:
            return _error_result("max_null_percent must be between 0 and 100")

        total_rows = df.count()
        null_count = df.filter(col(column).isNull() | (col(column) == "")).count()
        null_percent = (null_count / total_rows * 100.0) if total_rows > 0 else 0.0
        passed = null_percent <= threshold
        return (
            passed,
            0 if passed else null_count,
            {
                "column": column,
                "total_rows": total_rows,
                "null_count": null_count,
                "null_percent": round(null_percent, 4),
                "max_null_percent": threshold,
                "sample_bad_rows": [],
            },
        )

    if rule_type == "date_not_future":
        ts_col = to_timestamp(col(column))
        bad_df = df.filter(ts_col.isNotNull() & (ts_col > current_timestamp()))
        failed_count = bad_df.count()
        passed = failed_count == 0
        return (
            passed,
            failed_count,
            {
                "column": column,
                "future_count": failed_count,
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

    if rule_type == "custom_sql":
        # condition — Spark SQL expression: true для "плохих" строк
        condition = params.get("condition") or params.get("expression") or params.get("sql")
        if not condition or not str(condition).strip():
            return _error_result(
                "Parameter 'condition' is required for custom_sql "
                "(Spark SQL expression that is true for bad rows)"
            )

        condition = str(condition).strip()
        # Базовая защита от мульти-statement
        if ";" in condition:
            return _error_result("Semicolons are not allowed in custom_sql condition")

        try:
            bad_df = df.filter(expr(condition))
            failed_count = bad_df.count()
        except Exception as exc:
            return _error_result(f"Invalid custom_sql condition: {exc}")

        passed = failed_count == 0
        return (
            passed,
            failed_count,
            {
                "condition": condition,
                "failed_count": failed_count,
                "sample_bad_rows": _sample_bad_rows(bad_df, failed_count),
            },
        )

    return _error_result(f"Rule type '{rule_type}' is not implemented")
