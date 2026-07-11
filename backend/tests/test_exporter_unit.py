from app.services.exporter import (
    SUPPORTED_FORMATS,
    build_export_payload,
    export_as_csv,
    export_as_html,
    export_as_json,
    export_as_pdf,
)


class _FakeRule:
    def __init__(self, rule_id: int):
        self.id = rule_id
        self.rule_name = f"rule_{rule_id}"
        self.rule_type = "not_null"
        self.column_name = "id"
        self.severity = "warning"


class _FakeResult:
    def __init__(self, rule_id: int, passed: bool):
        self.id = rule_id
        self.rule_id = rule_id
        self.passed = passed
        self.failed_count = 0 if passed else 2
        self.details_json = {"sample_bad_rows": []}


class _FakeRun:
    def __init__(self):
        self.id = 1
        self.dataset_id = 10
        self.status = "success"
        self.started_at = None
        self.finished_at = None
        self.summary_json = {"total_rules": 2, "passed": 1, "failed": 1}
        self.results = [_FakeResult(1, True), _FakeResult(2, False)]


def test_supported_formats():
    assert set(SUPPORTED_FORMATS) == {"json", "csv", "html", "pdf"}


def test_export_payload_and_formats():
    run = _FakeRun()
    rules_map = {1: _FakeRule(1), 2: _FakeRule(2)}
    payload = build_export_payload(run, rules_map)

    assert payload["run"]["id"] == 1
    assert payload["statistics"]["failed"] == 1
    assert len(payload["results"]) == 2

    json_bytes, json_type, json_ext = export_as_json(payload)
    assert json_ext == "json"
    assert b"data_quality_protocol" in json_bytes
    assert "json" in json_type

    csv_bytes, csv_type, csv_ext = export_as_csv(payload)
    assert csv_ext == "csv"
    assert b"rule_name" in csv_bytes
    assert "csv" in csv_type

    html_bytes, html_type, html_ext = export_as_html(payload)
    assert html_ext == "html"
    html_text = html_bytes.decode("utf-8").lower()
    assert "run" in html_text or "protocol" in html_text or "quality" in html_text
    assert "html" in html_type

    # Кириллица в payload
    payload["results"][0]["rule_name"] = "Проверка email не пустой"
    pdf_bytes, pdf_type, pdf_ext = export_as_pdf(payload)
    assert pdf_ext == "pdf"
    assert pdf_bytes.startswith(b"%PDF")
    assert pdf_type == "application/pdf"
    # Имя шрифта/unicode-контент не должны падать; проверяем, что PDF непустой
    assert len(pdf_bytes) > 500
