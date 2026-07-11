"""Экспорт результатов запуска DQ-проверок: JSON, CSV, HTML, PDF."""

from __future__ import annotations

import csv
import html
import io
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session, joinedload
from sqlalchemy.orm.attributes import flag_modified

from app.models.rule import Rule
from app.models.run import Run

REPORTS_DIR = Path(os.environ.get("DQ_REPORTS_DIR", "/data/reports"))
SUPPORTED_FORMATS = ("json", "csv", "html", "pdf")


class ExportError(Exception):
    pass


def _load_run_bundle(db: Session, run_id: int) -> tuple[Run, list[Rule], dict[int, Rule]]:
    run = (
        db.query(Run)
        .options(joinedload(Run.results))
        .filter(Run.id == run_id)
        .first()
    )
    if not run:
        raise ExportError("Run not found")

    rules = db.query(Rule).filter(Rule.dataset_id == run.dataset_id).all()
    rules_map = {r.id: r for r in rules}
    return run, rules, rules_map


def _result_rows(run: Run, rules_map: dict[int, Rule]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for result in run.results:
        rule = rules_map.get(result.rule_id)
        rows.append(
            {
                "result_id": result.id,
                "rule_id": result.rule_id,
                "rule_name": rule.rule_name if rule else None,
                "rule_type": rule.rule_type if rule else None,
                "column_name": rule.column_name if rule else None,
                "severity": rule.severity if rule else None,
                "passed": result.passed,
                "failed_count": result.failed_count,
                "details_json": result.details_json,
            }
        )
    return rows


def build_export_payload(run: Run, rules_map: dict[int, Rule]) -> dict[str, Any]:
    summary = run.summary_json or {}
    rows = _result_rows(run, rules_map)
    total = len(rows)
    passed = sum(1 for r in rows if r["passed"])
    failed = total - passed
    return {
        "report_type": "data_quality_protocol",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "run": {
            "id": run.id,
            "dataset_id": run.dataset_id,
            "status": run.status,
            "started_at": run.started_at.isoformat() if run.started_at else None,
            "finished_at": run.finished_at.isoformat() if run.finished_at else None,
            "summary_json": summary,
        },
        "statistics": {
            "total_rules": summary.get("total_rules", total),
            "passed": summary.get("passed", passed),
            "failed": summary.get("failed", failed),
            "success_rate_percent": round((passed / total * 100.0), 2) if total else None,
        },
        "results": rows,
    }


def export_as_json(payload: dict[str, Any]) -> tuple[bytes, str, str]:
    content = json.dumps(payload, ensure_ascii=False, indent=2, default=str)
    return content.encode("utf-8"), "application/json", "json"


def export_as_csv(payload: dict[str, Any]) -> tuple[bytes, str, str]:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "run_id",
            "rule_id",
            "rule_name",
            "rule_type",
            "column_name",
            "severity",
            "passed",
            "failed_count",
            "details_json",
        ]
    )
    run_id = payload["run"]["id"]
    for row in payload["results"]:
        writer.writerow(
            [
                run_id,
                row["rule_id"],
                row["rule_name"] or "",
                row["rule_type"] or "",
                row["column_name"] or "",
                row["severity"] or "",
                row["passed"],
                row["failed_count"],
                json.dumps(row["details_json"], ensure_ascii=False, default=str)
                if row["details_json"] is not None
                else "",
            ]
        )
    return buffer.getvalue().encode("utf-8"), "text/csv; charset=utf-8", "csv"


def export_as_html(payload: dict[str, Any]) -> tuple[bytes, str, str]:
    run = payload["run"]
    stats = payload["statistics"]
    rows_html = []
    for row in payload["results"]:
        status = "PASS" if row["passed"] else "FAIL"
        status_class = "pass" if row["passed"] else "fail"
        details = html.escape(
            json.dumps(row["details_json"], ensure_ascii=False, default=str)
            if row["details_json"] is not None
            else ""
        )
        rows_html.append(
            f"<tr class='{status_class}'>"
            f"<td>{html.escape(str(row['rule_id']))}</td>"
            f"<td>{html.escape(str(row['rule_name'] or ''))}</td>"
            f"<td>{html.escape(str(row['rule_type'] or ''))}</td>"
            f"<td>{html.escape(str(row['column_name'] or ''))}</td>"
            f"<td>{html.escape(str(row['severity'] or ''))}</td>"
            f"<td><strong>{status}</strong></td>"
            f"<td>{html.escape(str(row['failed_count']))}</td>"
            f"<td><code>{details}</code></td>"
            f"</tr>"
        )

    body = f"""<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>DQ Report — Run #{run['id']}</title>
  <style>
    body {{ font-family: Arial, sans-serif; margin: 24px; color: #111; }}
    h1, h2 {{ margin-bottom: 8px; }}
    .meta, .stats {{ margin-bottom: 20px; }}
    .stats span {{ display: inline-block; margin-right: 16px; padding: 6px 10px; background: #f3f4f6; border-radius: 6px; }}
    table {{ border-collapse: collapse; width: 100%; font-size: 14px; }}
    th, td {{ border: 1px solid #ddd; padding: 8px; vertical-align: top; text-align: left; }}
    th {{ background: #f9fafb; }}
    tr.fail {{ background: #fef2f2; }}
    tr.pass {{ background: #f0fdf4; }}
    code {{ white-space: pre-wrap; word-break: break-word; font-size: 12px; }}
  </style>
</head>
<body>
  <h1>Итоговый протокол проверки качества данных</h1>
  <div class="meta">
    <p><strong>Run ID:</strong> {run['id']}</p>
    <p><strong>Dataset ID:</strong> {run['dataset_id']}</p>
    <p><strong>Status:</strong> {html.escape(str(run['status']))}</p>
    <p><strong>Started:</strong> {html.escape(str(run['started_at'] or '—'))}</p>
    <p><strong>Finished:</strong> {html.escape(str(run['finished_at'] or '—'))}</p>
    <p><strong>Generated:</strong> {html.escape(str(payload['generated_at']))}</p>
  </div>
  <div class="stats">
    <span>Всего правил: {stats['total_rules']}</span>
    <span>Пройдено: {stats['passed']}</span>
    <span>Не пройдено: {stats['failed']}</span>
    <span>Успешность: {stats['success_rate_percent'] if stats['success_rate_percent'] is not None else '—'}%</span>
  </div>
  <h2>Результаты правил</h2>
  <table>
    <thead>
      <tr>
        <th>Rule ID</th>
        <th>Name</th>
        <th>Type</th>
        <th>Column</th>
        <th>Severity</th>
        <th>Passed</th>
        <th>Failed count</th>
        <th>Details</th>
      </tr>
    </thead>
    <tbody>
      {''.join(rows_html) if rows_html else '<tr><td colspan="8">Нет результатов</td></tr>'}
    </tbody>
  </table>
</body>
</html>
"""
    return body.encode("utf-8"), "text/html; charset=utf-8", "html"


def _find_cyrillic_font() -> Path:
    """
    Ищет TTF/OTF с кириллицей (Windows Arial / Linux DejaVu / bundled).
    """
    env_font = os.environ.get("DQ_PDF_FONT")
    candidates = [
        Path(env_font) if env_font else None,
        Path(__file__).resolve().parent.parent / "assets" / "fonts" / "DejaVuSans.ttf",
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        Path("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"),
        Path("/usr/share/fonts/truetype/freefont/FreeSans.ttf"),
        Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts" / "arial.ttf",
        Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts" / "Arial.ttf",
        Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts" / "segoeui.ttf",
        Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts" / "calibri.ttf",
    ]
    for path in candidates:
        if path and path.is_file():
            return path
    raise ExportError(
        "Не найден шрифт с поддержкой кириллицы для PDF. "
        "Установите fonts-dejavu-core (Linux/Docker) или задайте DQ_PDF_FONT=/path/to.ttf"
    )


def export_as_pdf(payload: dict[str, Any]) -> tuple[bytes, str, str]:
    """PDF-отчёт с Unicode (кириллица) через fpdf2 + TTF-шрифт."""
    try:
        from fpdf import FPDF
    except ImportError as exc:
        raise ExportError(
            "Для PDF нужен пакет fpdf2. Установите: pip install fpdf2"
        ) from exc

    font_path = _find_cyrillic_font()
    run = payload["run"]
    stats = payload["statistics"]

    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.set_margins(left=15, top=15, right=15)
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    # Один regular TTF — без synthetic Bold (часть шрифтов ломает layout)
    pdf.add_font("ReportFont", fname=str(font_path))
    pdf.set_font("ReportFont", size=14)

    def write_line(text: str, size: int = 10, h: float = 6) -> None:
        pdf.set_font("ReportFont", size=size)
        # Явная ширина epw избегает FPDFException на multi_cell(0, ...)
        pdf.multi_cell(w=pdf.epw, h=h, text=text, new_x="LMARGIN", new_y="NEXT")

    write_line(
        f"Итоговый протокол проверки качества данных - Run #{run['id']}",
        size=14,
        h=8,
    )
    pdf.ln(2)

    success = stats["success_rate_percent"]
    success_text = f"{success}%" if success is not None else "-"
    meta_lines = [
        f"Dataset ID: {run['dataset_id']}",
        f"Статус: {run['status']}",
        f"Начало: {run['started_at'] or '-'}",
        f"Завершение: {run['finished_at'] or '-'}",
        f"Сформирован: {payload['generated_at']}",
        f"Всего правил: {stats['total_rules']}",
        f"Пройдено: {stats['passed']}",
        f"Не пройдено: {stats['failed']}",
        f"Успешность: {success_text}",
    ]
    for line in meta_lines:
        write_line(line, size=10, h=6)

    pdf.ln(3)
    write_line("Результаты правил", size=12, h=7)
    pdf.ln(1)

    if not payload["results"]:
        write_line("Нет результатов", size=10, h=6)
    else:
        for row in payload["results"]:
            status = "PASS" if row["passed"] else "FAIL"
            name = str(row["rule_name"] or f"Правило #{row['rule_id']}")
            rtype = str(row["rule_type"] or "?")
            column = str(row["column_name"] or "-")
            severity = str(row["severity"] or "-")
            line = (
                f"[{status}] {name} | type={rtype} | column={column} | "
                f"severity={severity} | failed_count={row['failed_count']}"
            )
            write_line(line, size=9, h=5)
            pdf.ln(1)

    content = pdf.output()
    if isinstance(content, (bytes, bytearray)):
        content_bytes = bytes(content)
    else:
        content_bytes = content.encode("latin-1")
    return content_bytes, "application/pdf", "pdf"


def save_report(content: bytes, run_id: int, ext: str) -> str:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    path = REPORTS_DIR / f"run_{run_id}.{ext}"
    path.write_bytes(content)
    return str(path)


def export_run(
    db: Session,
    run_id: int,
    fmt: str,
    *,
    persist: bool = True,
) -> tuple[bytes, str, str, str | None]:
    """
    Возвращает (content, media_type, extension, saved_path|None).
    """
    fmt = (fmt or "json").strip().lower()
    if fmt not in SUPPORTED_FORMATS:
        raise ExportError(
            f"Unsupported format '{fmt}'. Supported: {', '.join(SUPPORTED_FORMATS)}"
        )

    run, _rules, rules_map = _load_run_bundle(db, run_id)
    payload = build_export_payload(run, rules_map)

    if fmt == "json":
        content, media_type, ext = export_as_json(payload)
    elif fmt == "csv":
        content, media_type, ext = export_as_csv(payload)
    elif fmt == "html":
        content, media_type, ext = export_as_html(payload)
    else:
        content, media_type, ext = export_as_pdf(payload)

    saved_path = save_report(content, run_id, ext) if persist else None

    # Сохраняем путь к последнему отчёту в summary_json (не затирая остальное)
    if saved_path:
        summary = dict(run.summary_json or {})
        summary["report_path"] = saved_path
        summary["report_format"] = ext
        run.summary_json = summary
        flag_modified(run, "summary_json")
        db.commit()

    return content, media_type, ext, saved_path
