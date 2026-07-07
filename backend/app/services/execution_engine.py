from pyspark.sql import SparkSession
from pyspark.sql.functions import col
from sqlalchemy.orm import Session
from datetime import datetime
import json
import os

from app.core.database import SessionLocal
from app.models.run import Run
from app.models.result import Result
from app.models.rule import Rule
from app.models.dataset import Dataset


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

        # Получаем путь к файлу
        config = dataset.source_config_json
        if isinstance(config, str):
            try:
                config = json.loads(config)
            except:
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


def execute_single_rule(df, rule: Rule):
    """Выполняет одно правило и возвращает примеры проблемных строк"""
    rule_type = rule.rule_type.lower()
    column = rule.column_name
    params = rule.params_json or {}

    if rule_type == "not_null" and column:
        bad_df = df.filter(col(column).isNull())
        failed_count = bad_df.count()
        passed = failed_count == 0

        sample = (
            bad_df.limit(5).toPandas().to_dict("records") if failed_count > 0 else []
        )
        return (
            passed,
            failed_count,
            {"null_count": failed_count, "sample_bad_rows": sample},
        )

    elif rule_type == "unique" and column:
        duplicates = df.groupBy(column).count().filter("count > 1")
        failed_count = duplicates.count()
        passed = failed_count == 0

        sample = (
            duplicates.limit(5).toPandas().to_dict("records")
            if failed_count > 0
            else []
        )
        return (
            passed,
            failed_count,
            {"duplicate_count": failed_count, "sample_bad_rows": sample},
        )

    elif rule_type == "min_max" and column:
        min_val = params.get("min")
        max_val = params.get("max")
        if min_val is not None and max_val is not None:
            bad_df = df.filter((col(column) < min_val) | (col(column) > max_val))
            failed_count = bad_df.count()
            passed = failed_count == 0

            sample = (
                bad_df.limit(5).toPandas().to_dict("records")
                if failed_count > 0
                else []
            )
            return (
                passed,
                failed_count,
                {"out_of_range": failed_count, "sample_bad_rows": sample},
            )
        return True, 0, {}

    elif rule_type in ["not_equal", "not_zero"]:
        value = params.get("value")
        if value is not None:
            bad_df = df.filter(col(column) == value)
            failed_count = bad_df.count()
            passed = failed_count == 0

            sample = (
                bad_df.limit(5).toPandas().to_dict("records")
                if failed_count > 0
                else []
            )
            return (
                passed,
                failed_count,
                {
                    "failed_count": failed_count,
                    "expected_not_equal": value,
                    "sample_bad_rows": sample,
                },
            )

    return True, 0, {"message": f"Rule type '{rule_type}' not implemented"}
