from __future__ import annotations

import json
from typing import Any

import httpx
from sqlalchemy.orm import Session, joinedload

from app.core.config import get_settings
from app.models.result import Result
from app.models.run import Run
from app.models.rule import Rule

MAX_SAMPLE_ROWS = 25

SYSTEM_PROMPT = (
    "Ты — senior data quality engineer с 12-летним опытом. "
    "Отвечай только на русском языке. Используй markdown с секциями "
    "## Общая оценка, ## Главные проблемы, ## Что именно пошло не так, ## Рекомендации. "
    "Будь конкретным и опирайся только на предоставленные данные."
)

USER_PROMPT_TEMPLATE = """Тебе дают результаты автоматической проверки качества данных.
Проанализируй их и напиши понятный, честный и полезный отчёт на русском языке.

Структура отчёта (используй markdown):

## Общая оценка
(1-2 предложения)

## Главные проблемы
- ...

## Что именно пошло не так
(конкретно по правилам, где много ошибок)

## Рекомендации
- ...

Данные для анализа:
- Название датасета: {dataset_name}
- Общая статистика: {summary_json}
- Результаты проверок: {rules_results}
- Примеры проблемных записей: {sample_errors}

Будь конкретным. Не пиши общие фразы. Опирайся только на предоставленные данные."""


class OllamaUnavailableError(Exception):
    """Ollama недоступна или вернула ошибку."""


class RunNotReadyForAnalysisError(Exception):
    """Запуск ещё не завершён или не содержит результатов."""


def _serialize_rules_results(
    results: list[Result], rules_by_id: dict[int, Rule]
) -> list[dict[str, Any]]:
    payload: list[dict[str, Any]] = []
    for result in results:
        rule = rules_by_id.get(result.rule_id)
        payload.append(
            {
                "rule_id": result.rule_id,
                "rule_name": rule.rule_name if rule else f"rule#{result.rule_id}",
                "rule_type": rule.rule_type if rule else None,
                "column_name": rule.column_name if rule else None,
                "severity": rule.severity if rule else None,
                "passed": result.passed,
                "failed_count": result.failed_count,
            }
        )
    return payload


def _collect_sample_errors(
    results: list[Result], rules_by_id: dict[int, Rule]
) -> list[dict[str, Any]]:
    samples: list[dict[str, Any]] = []
    for result in results:
        if result.passed or not result.details_json:
            continue
        rule = rules_by_id.get(result.rule_id)
        rule_name = rule.rule_name if rule else f"rule#{result.rule_id}"
        bad_rows = result.details_json.get("sample_bad_rows") or []
        for row in bad_rows:
            if len(samples) >= MAX_SAMPLE_ROWS:
                return samples
            samples.append({"rule_name": rule_name, "row": row})
    return samples


def build_analysis_prompt(run: Run, rules_by_id: dict[int, Rule]) -> str:
    dataset_name = run.dataset.name if run.dataset else f"dataset#{run.dataset_id}"
    summary_json = json.dumps(run.summary_json or {}, ensure_ascii=False)
    rules_results = json.dumps(
        _serialize_rules_results(run.results, rules_by_id),
        ensure_ascii=False,
    )
    sample_errors = json.dumps(
        _collect_sample_errors(run.results, rules_by_id),
        ensure_ascii=False,
    )
    return USER_PROMPT_TEMPLATE.format(
        dataset_name=dataset_name,
        summary_json=summary_json,
        rules_results=rules_results,
        sample_errors=sample_errors,
    )


async def call_ollama(prompt: str) -> str:
    settings = get_settings()
    url = f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/chat"
    payload = {
        "model": settings.OLLAMA_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        "stream": False,
    }

    try:
        async with httpx.AsyncClient(
            timeout=settings.OLLAMA_TIMEOUT,
            trust_env=False,
        ) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            data = response.json()
    except httpx.ConnectError as exc:
        raise OllamaUnavailableError(
            f"Не удалось подключиться к Ollama ({settings.OLLAMA_BASE_URL}). "
            "Убедитесь, что Ollama запущена: ollama serve"
        ) from exc
    except httpx.TimeoutException as exc:
        raise OllamaUnavailableError(
            "Превышено время ожидания ответа от Ollama. Попробуйте позже или выберите более лёгкую модель."
        ) from exc
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text
        if exc.response.status_code == 404:
            raise OllamaUnavailableError(
                f"Модель '{settings.OLLAMA_MODEL}' не найдена в Ollama. "
                f"Выполните: ollama pull {settings.OLLAMA_MODEL}"
            ) from exc
        raise OllamaUnavailableError(
            f"Ollama вернула ошибку HTTP {exc.response.status_code}: {detail}"
        ) from exc

    message = data.get("message") or {}
    content = message.get("content", "").strip()
    if not content:
        raise OllamaUnavailableError("Ollama вернула пустой ответ.")
    return content


def load_run_for_analysis(db: Session, run_id: int) -> Run:
    run = (
        db.query(Run)
        .options(
            joinedload(Run.results),
            joinedload(Run.dataset),
        )
        .filter(Run.id == run_id)
        .first()
    )
    if not run:
        raise ValueError("Run not found")
    return run


def validate_run_for_analysis(run: Run) -> None:
    if run.status not in {"success", "failed"}:
        raise RunNotReadyForAnalysisError(
            "Анализ доступен только для завершённых запусков (success/failed)."
        )
    if not run.results:
        raise RunNotReadyForAnalysisError(
            "У запуска нет результатов проверок. Сначала выполните проверку качества."
        )


async def analyze_run(db: Session, run_id: int) -> tuple[str, bool]:
    """
    Возвращает (analysis_text, cached).
    Если анализ уже сохранён — возвращает кэш без вызова Ollama.
    """
    run = load_run_for_analysis(db, run_id)

    if run.llm_analysis:
        return run.llm_analysis, True

    validate_run_for_analysis(run)

    rule_ids = {r.rule_id for r in run.results}
    rules = db.query(Rule).filter(Rule.id.in_(rule_ids)).all()
    rules_by_id = {rule.id: rule for rule in rules}

    prompt = build_analysis_prompt(run, rules_by_id)
    analysis = await call_ollama(prompt)

    run.llm_analysis = analysis
    db.add(run)
    db.commit()
    db.refresh(run)

    return analysis, False


def get_cached_analysis(db: Session, run_id: int) -> str | None:
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        raise ValueError("Run not found")
    return run.llm_analysis