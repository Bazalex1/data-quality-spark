from __future__ import annotations

import json
import logging
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from typing import Any

logger = logging.getLogger(__name__)

# --- Конфигурация ---

API_URL = os.environ.get("DATA_QUALITY_API_URL", "http://localhost:8000/api/v1")
DATASET_ID = int(os.environ.get("DATASET_ID", "1"))
POLL_INTERVAL_SEC = float(os.environ.get("POLL_INTERVAL_SEC", "2"))
POLL_TIMEOUT_SEC = float(os.environ.get("POLL_TIMEOUT_SEC", "120"))

TERMINAL_STATUSES = frozenset({"success", "failed"})


class DataQualityAPIError(RuntimeError):
    """Ошибка при обращении к API сервиса качества данных."""


class CriticalQualityFailure(Exception):
    """Провалено хотя бы одно critical-правило."""


def _build_http_opener() -> urllib.request.OpenerDirector:
    use_system_proxy = os.environ.get("DATA_QUALITY_USE_SYSTEM_PROXY", "").lower() in (
        "1",
        "true",
        "yes",
    )
    if use_system_proxy:
        return urllib.request.build_opener()
    return urllib.request.build_opener(urllib.request.ProxyHandler({}))


_HTTP_OPENER = _build_http_opener()


def _request(
    method: str,
    path: str,
    *,
    body: dict[str, Any] | None = None,
    base_url: str = API_URL,
) -> Any:
    url = f"{base_url.rstrip('/')}{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    try:
        with _HTTP_OPENER.open(req, timeout=60) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise DataQualityAPIError(
            f"{method} {path} → HTTP {exc.code}: {detail}"
        ) from exc
    except urllib.error.URLError as exc:
        raise DataQualityAPIError(
            f"{method} {path} → не удалось подключиться к {base_url}: {exc.reason}"
        ) from exc


def create_run(dataset_id: int, *, base_url: str = API_URL) -> dict[str, Any]:
    return _request(
        "POST", "/runs/", body={"dataset_id": dataset_id}, base_url=base_url
    )


def execute_run(run_id: int, *, base_url: str = API_URL) -> dict[str, Any]:
    return _request("POST", f"/runs/{run_id}/execute", base_url=base_url)


def get_run(run_id: int, *, base_url: str = API_URL) -> dict[str, Any]:
    return _request("GET", f"/runs/{run_id}", base_url=base_url)


def get_rules(dataset_id: int, *, base_url: str = API_URL) -> list[dict[str, Any]]:
    url = f"/rules/?dataset_id={dataset_id}"
    result = _request("GET", url, base_url=base_url)
    return result if isinstance(result, list) else []


def wait_for_run_completion(
    run_id: int,
    *,
    base_url: str = API_URL,
    poll_interval: float = POLL_INTERVAL_SEC,
    timeout: float = POLL_TIMEOUT_SEC,
) -> dict[str, Any]:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        run = get_run(run_id, base_url=base_url)
        status = run.get("status", "unknown")
        logger.info("Run %s: status=%s", run_id, status)
        if status in TERMINAL_STATUSES:
            return run
        time.sleep(poll_interval)
    raise TimeoutError(
        f"Run {run_id} не завершился за {timeout} с (последний статус: {status})"
    )


# --- Задачи пайплайна ---


def write_data_to_silver(**_context: Any) -> None:
    """
    Заглушка этапа записи данных в silver-слой.
    В реальном пайплайне здесь Spark / dbt / COPY INTO и т.п.
    """
    logger.info("write_data_to_silver: данные записаны в silver (заглушка)")


def trigger_data_quality_check(
    dataset_id: int = DATASET_ID,
    *,
    base_url: str = API_URL,
    **context: Any,
) -> dict[str, Any]:
    """
    Создаёт Run, запускает проверку и дожидается результата.
    В Airflow кладёт run_detail в XCom для следующей задачи.
    """
    logger.info("Создание run для dataset_id=%s", dataset_id)
    run = create_run(dataset_id, base_url=base_url)
    run_id = run["id"]
    logger.info("Run создан: id=%s", run_id)

    execute_run(run_id, base_url=base_url)
    logger.info("Проверка качества запущена для run %s", run_id)

    run_detail = wait_for_run_completion(run_id, base_url=base_url)
    logger.info(
        "Run %s завершён: status=%s, summary=%s",
        run_id,
        run_detail.get("status"),
        run_detail.get("summary_json"),
    )

    ti = context.get("ti")
    if ti is not None:
        ti.xcom_push(key="run_id", value=run_id)
        ti.xcom_push(key="run_detail", value=run_detail)

    return run_detail


def check_quality_result(
    dataset_id: int = DATASET_ID,
    *,
    base_url: str = API_URL,
    run_detail: dict[str, Any] | None = None,
    **context: Any,
) -> None:
    """
    Анализирует результаты проверки.
    Если есть failed-результат с severity=critical → падает.
    Иначе успех (с предупреждением, если есть failed warning-правила).
    """
    if run_detail is None:
        ti = context.get("ti")
        if ti is not None:
            run_detail = ti.xcom_pull(
                task_ids="trigger_data_quality_check", key="run_detail"
            )
        if run_detail is None:
            run_id = (
                ti.xcom_pull(task_ids="trigger_data_quality_check", key="run_id")
                if ti
                else None
            )
            if run_id is not None:
                run_detail = get_run(int(run_id), base_url=base_url)

    if run_detail is None:
        raise ValueError(
            "Нет данных run_detail — сначала выполните trigger_data_quality_check"
        )

    results: list[dict[str, Any]] = run_detail.get("results") or []
    rules = get_rules(dataset_id, base_url=base_url)
    severity_by_rule_id = {r["id"]: r.get("severity", "warning") for r in rules}
    rule_name_by_id = {r["id"]: r.get("rule_name", f"rule#{r['id']}") for r in rules}

    critical_failures: list[str] = []
    warning_failures: list[str] = []

    for result in results:
        if result.get("passed", True):
            continue
        rule_id = result["rule_id"]
        severity = severity_by_rule_id.get(rule_id, "warning")
        name = rule_name_by_id.get(rule_id, str(rule_id))
        failed_count = result.get("failed_count", 0)
        line = f"{name} (rule_id={rule_id}, failed_count={failed_count})"
        if severity == "critical":
            critical_failures.append(line)
        else:
            warning_failures.append(line)

    if critical_failures:
        message = "Критические нарушения качества данных:\n" + "\n".join(
            f"  - {f}" for f in critical_failures
        )
        logger.error(message)
        raise CriticalQualityFailure(message)

    if warning_failures:
        logger.warning(
            "Проверка завершена с предупреждениями (non-critical):\n%s",
            "\n".join(f"  - {f}" for f in warning_failures),
        )
    else:
        logger.info("Все правила пройдены успешно.")

    if run_detail.get("status") == "failed":
        logger.warning(
            "Run status=failed, но критических правил не обнаружено — DAG завершается успешно."
        )


def run_pipeline_demo(
    dataset_id: int = DATASET_ID,
    *,
    base_url: str = API_URL,
) -> None:
    """Последовательный запуск без Airflow (для демонстрации)."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    logger.info("=== Демо-пайплайн качества данных (без Airflow) ===")
    logger.info("API: %s, dataset_id: %s", base_url, dataset_id)

    write_data_to_silver()
    run_detail = trigger_data_quality_check(dataset_id=dataset_id, base_url=base_url)
    check_quality_result(
        dataset_id=dataset_id,
        base_url=base_url,
        run_detail=run_detail,
    )
    logger.info("=== Пайплайн завершён успешно ===")


# --- Определение Airflow DAG ---

try:
    from airflow import DAG
    from airflow.exceptions import AirflowException
    from airflow.operators.python import PythonOperator

    default_args = {
        "owner": "data-platform",
        "depends_on_past": False,
        "email_on_failure": False,
        "email_on_retry": False,
        "retries": 1,
        "retry_delay": timedelta(minutes=2),
    }

    def _check_quality_result_task(**context: Any) -> None:
        try:
            check_quality_result(dataset_id=DATASET_ID, base_url=API_URL, **context)
        except CriticalQualityFailure as exc:
            raise AirflowException(str(exc)) from exc

    with DAG(
        dag_id="data_quality_check_dag",
        default_args=default_args,
        description="Проверка качества данных через data-quality-spark API",
        schedule=None,
        start_date=datetime(2024, 1, 1),
        catchup=False,
        tags=["data-quality", "silver"],
    ) as dag:
        task_write_silver = PythonOperator(
            task_id="write_data_to_silver",
            python_callable=write_data_to_silver,
        )

        task_trigger_check = PythonOperator(
            task_id="trigger_data_quality_check",
            python_callable=trigger_data_quality_check,
            op_kwargs={"dataset_id": DATASET_ID, "base_url": API_URL},
        )

        task_check_result = PythonOperator(
            task_id="check_quality_result",
            python_callable=_check_quality_result_task,
        )

        task_write_silver >> task_trigger_check >> task_check_result

except ImportError:
    dag = None  # type: ignore[misc, assignment]


if __name__ == "__main__":
    try:
        run_pipeline_demo()
    except CriticalQualityFailure as exc:
        logger.error("Демо завершено с ошибкой качества данных (как и DAG в Airflow).")
        print(exc, file=sys.stderr)
        sys.exit(1)
    except (DataQualityAPIError, TimeoutError) as exc:
        logger.error("Ошибка при обращении к API: %s", exc)
        sys.exit(1)
