import type { Run, RunDetail, RunResult, RunSummary, Rule } from '@/lib/api';

/** Исход выполнения проверки с учётом нарушений правил. */
export type RunOutcome =
  | 'pending'
  | 'running'
  | 'success'
  | 'with_errors'
  | 'failed';

/**
 * Классификация запуска:
 * - success — завершился, нарушений правил нет
 * - with_errors — завершился, есть нарушенные правила
 * - failed — сам запуск поломался (crash / ошибка движка)
 */
export function getRunOutcome(
  status: Run['status'],
  summary: RunSummary | null | undefined
): RunOutcome {
  if (status === 'pending') return 'pending';
  if (status === 'running') return 'running';
  if (status === 'failed') return 'failed';
  // status === 'success': движок отработал; смотрим на summary.failed
  if ((summary?.failed ?? 0) > 0) return 'with_errors';
  return 'success';
}

export function getRunOutcomeFromRun(run: Pick<Run, 'status' | 'summary_json'>): RunOutcome {
  return getRunOutcome(run.status, run.summary_json);
}

export interface DashboardStatistics {
  totalRuns: number;
  /** Завершились без нарушенных правил */
  successfulRuns: number;
  /** Завершились, но есть нарушенные правила */
  runsWithErrors: number;
  /** Сам запуск поломался (status=failed) */
  failedRuns: number;
  runningRuns: number;
  pendingRuns: number;
  successRate: number;
  totalRulesChecked: number;
  totalRulesPassed: number;
  totalRulesFailed: number;
  totalErrorsFound: number;
}

export interface DashboardError {
  id: string;
  type: 'run' | 'rule';
  title: string;
  description: string;
  runId: number;
  failedCount?: number;
  createdAt: string;
}

export interface ColumnResult {
  columnName: string;
  rulesTotal: number;
  rulesPassed: number;
  rulesFailed: number;
  totalErrors: number;
  ruleNames: string[];
  status: 'ok' | 'warning' | 'error';
}

export interface DashboardData {
  statistics: DashboardStatistics;
  errors: DashboardError[];
  columnResults: ColumnResult[];
  history: Run[];
  latestRunId: number | null;
}

function emptyStatistics(): DashboardStatistics {
  return {
    totalRuns: 0,
    successfulRuns: 0,
    runsWithErrors: 0,
    failedRuns: 0,
    runningRuns: 0,
    pendingRuns: 0,
    successRate: 0,
    totalRulesChecked: 0,
    totalRulesPassed: 0,
    totalRulesFailed: 0,
    totalErrorsFound: 0,
  };
}

export function buildDashboardData(
  runs: Run[],
  rules: Rule[],
  latestRunDetail: RunDetail | null
): DashboardData {
  const history = [...runs].sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
  );

  if (history.length === 0) {
    return {
      statistics: emptyStatistics(),
      errors: [],
      columnResults: [],
      history: [],
      latestRunId: null,
    };
  }

  let successfulRuns = 0;
  let runsWithErrors = 0;
  let failedRuns = 0;
  let runningRuns = 0;
  let pendingRuns = 0;

  for (const run of history) {
    switch (getRunOutcomeFromRun(run)) {
      case 'success':
        successfulRuns += 1;
        break;
      case 'with_errors':
        runsWithErrors += 1;
        break;
      case 'failed':
        failedRuns += 1;
        break;
      case 'running':
        runningRuns += 1;
        break;
      case 'pending':
        pendingRuns += 1;
        break;
    }
  }

  const totalRulesChecked = history.reduce(
    (sum, run) => sum + (run.summary_json?.total_rules ?? 0),
    0
  );
  const totalRulesPassed = history.reduce(
    (sum, run) => sum + (run.summary_json?.passed ?? 0),
    0
  );
  const totalRulesFailed = history.reduce(
    (sum, run) => sum + (run.summary_json?.failed ?? 0),
    0
  );

  // Успешность — доля запусков без нарушений среди завершённых
  const completedRuns = successfulRuns + runsWithErrors + failedRuns;

  const statistics: DashboardStatistics = {
    totalRuns: history.length,
    successfulRuns,
    runsWithErrors,
    failedRuns,
    runningRuns,
    pendingRuns,
    successRate:
      completedRuns > 0
        ? Math.round((successfulRuns / completedRuns) * 100)
        : 0,
    totalRulesChecked,
    totalRulesPassed,
    totalRulesFailed,
    totalErrorsFound: latestRunDetail
      ? latestRunDetail.results.reduce((sum, r) => sum + r.failed_count, 0)
      : 0,
  };

  const errors = buildErrors(history, latestRunDetail, rules);
  const columnResults = buildColumnResults(latestRunDetail, rules);

  const latestRunId =
    latestRunDetail?.id ??
    history.find((r) => r.status === 'success')?.id ??
    history[0]?.id ??
    null;

  return {
    statistics,
    errors,
    columnResults,
    history,
    latestRunId,
  };
}

function buildErrors(
  runs: Run[],
  latestRunDetail: RunDetail | null,
  rules: Rule[]
): DashboardError[] {
  const errors: DashboardError[] = [];
  const rulesMap = new Map(rules.map((r) => [r.id, r]));

  for (const run of runs) {
    if (getRunOutcomeFromRun(run) === 'failed') {
      const errorText =
        typeof run.summary_json?.error === 'string'
          ? run.summary_json.error
          : null;
      errors.push({
        id: `run-${run.id}`,
        type: 'run',
        title: `Запуск #${run.id} завершился неудачно`,
        description: errorText
          ? `Датасет #${run.dataset_id} · ${errorText}`
          : `Датасет #${run.dataset_id} · поломка выполнения`,
        runId: run.id,
        createdAt: run.finished_at ?? run.started_at,
      });
    }
  }

  if (latestRunDetail) {
    for (const result of latestRunDetail.results) {
      if (!result.passed || result.failed_count > 0) {
        const rule = rulesMap.get(result.rule_id);
        errors.push({
          id: `rule-${latestRunDetail.id}-${result.id}`,
          type: 'rule',
          title: rule?.rule_name ?? `Правило #${result.rule_id}`,
          description: [
            rule?.rule_type,
            rule?.column_name ? `колонка ${rule.column_name}` : null,
            `${result.failed_count} ошибок`,
          ]
            .filter(Boolean)
            .join(' · '),
          runId: latestRunDetail.id,
          failedCount: result.failed_count,
          createdAt: result.created_at,
        });
      }
    }
  }

  return errors
    .sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .slice(0, 10);
}

function buildColumnResults(
  latestRunDetail: RunDetail | null,
  rules: Rule[]
): ColumnResult[] {
  if (!latestRunDetail || latestRunDetail.results.length === 0) {
    return [];
  }

  const rulesMap = new Map(rules.map((r) => [r.id, r]));
  const byColumn = new Map<string, { results: RunResult[]; ruleNames: string[] }>();

  for (const result of latestRunDetail.results) {
    const rule = rulesMap.get(result.rule_id);
    const columnName = rule?.column_name ?? '— без колонки —';

    const existing = byColumn.get(columnName) ?? { results: [], ruleNames: [] };
    existing.results.push(result);
    if (rule?.rule_name) {
      existing.ruleNames.push(rule.rule_name);
    }
    byColumn.set(columnName, existing);
  }

  return Array.from(byColumn.entries())
    .map(([columnName, data]) => {
      const rulesPassed = data.results.filter((r) => r.passed).length;
      const rulesFailed = data.results.length - rulesPassed;
      const totalErrors = data.results.reduce((sum, r) => sum + r.failed_count, 0);

      return {
        columnName,
        rulesTotal: data.results.length,
        rulesPassed,
        rulesFailed,
        totalErrors,
        ruleNames: data.ruleNames,
        status:
          rulesFailed === 0
            ? 'ok'
            : rulesPassed === 0
              ? 'error'
              : 'warning',
      } satisfies ColumnResult;
    })
    .sort((a, b) => b.totalErrors - a.totalErrors);
}

export interface ChartSlice {
  name: string;
  value: number;
  fill: string;
}

export interface ColumnErrorChartItem {
  column: string;
  errors: number;
}

export function buildRunStatusChartData(
  statistics: DashboardStatistics
): ChartSlice[] {
  return [
    { name: 'Успешные', value: statistics.successfulRuns, fill: '#16a34a' },
    { name: 'С ошибками', value: statistics.runsWithErrors, fill: '#d97706' },
    { name: 'Неудачные', value: statistics.failedRuns, fill: '#dc2626' },
    { name: 'Выполняется', value: statistics.runningRuns, fill: '#2563eb' },
    { name: 'Ожидание', value: statistics.pendingRuns, fill: '#6b7280' },
  ].filter((item) => item.value > 0);
}

export function buildColumnErrorsChartData(
  columnResults: ColumnResult[]
): ColumnErrorChartItem[] {
  return columnResults
    .filter((col) => col.totalErrors > 0)
    .map((col) => ({
      column: col.columnName,
      errors: col.totalErrors,
    }))
    .slice(0, 8);
}

export function findLatestRunForDetails(runs: Run[]): Run | null {
  const sorted = [...runs].sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
  );

  return (
    sorted.find((r) => r.status === 'success' && (r.summary_json?.total_rules ?? 0) > 0) ??
    sorted.find((r) => r.summary_json && r.summary_json.total_rules! > 0) ??
    sorted[0] ??
    null
  );
}