import type { RunDetail, Rule } from '@/lib/api';

function downloadBlob(content: BlobPart, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportRunAsJson(run: RunDetail) {
  const payload = JSON.stringify(run, null, 2);
  downloadBlob(payload, `run-${run.id}.json`, 'application/json');
}

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportRunAsCsv(run: RunDetail, rulesMap: Map<number, Rule>) {
  const headers = [
    'run_id',
    'rule_id',
    'rule_name',
    'rule_type',
    'column_name',
    'passed',
    'failed_count',
    'severity',
  ];

  const rows = run.results.map((result) => {
    const rule = rulesMap.get(result.rule_id);
    return [
      run.id,
      result.rule_id,
      rule?.rule_name ?? '',
      rule?.rule_type ?? '',
      rule?.column_name ?? '',
      result.passed,
      result.failed_count,
      rule?.severity ?? '',
    ].map(escapeCsvValue);
  });

  const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
  downloadBlob(csv, `run-${run.id}.csv`, 'text/csv;charset=utf-8');
}