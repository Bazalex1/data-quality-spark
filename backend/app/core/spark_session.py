from pyspark.sql import SparkSession

from app.core.config import settings

_spark: SparkSession | None = None


def get_spark_session() -> SparkSession:
    global _spark
    if _spark is None:
        _spark = (
            SparkSession.builder.appName(settings.APP_NAME)
            .master(settings.SPARK_MASTER)
            .getOrCreate()
        )
    return _spark