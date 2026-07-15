'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import RunLlmAnalysis from '@/components/run-llm-analysis';
import SampleBadRowsTable from '@/components/SampleBadRowsTable';
import StatusBadge from '@/components/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ButtonLink } from '@/components/ui/button-link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { executeRun, getRun, getRules, type ExportFormat } from '@/lib/api';
import { exportRunViaApi } from '@/lib/export-run';
import { getErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

function formatDate(date: string | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleString('ru-RU');
}

export default function RunDetailPage() {
  const params = useParams();
  const runId = Number(params.id);
  const queryClient = useQueryClient();
  const [expandedResults, setExpandedResults] = useState<Set<number>>(new Set());
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const {
    data: run,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['run', runId],
    queryFn: () => getRun(runId),
    enabled: !Number.isNaN(runId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'running' ? 2000 : false;
    },
  });

  const { data: rules } = useQuery({
    queryKey: ['rules', run?.dataset_id],
    queryFn: () => getRules(run!.dataset_id),
    enabled: !!run?.dataset_id,
  });

  const rulesMap = new Map(rules?.map((r) => [r.id, r]) ?? []);

  const executeMutation = useMutation({
    mutationFn: () => executeRun(runId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['run', runId] });
      queryClient.invalidateQueries({ queryKey: ['runs'] });
    },
  });

  const handleExport = async (format: ExportFormat) => {
    setExportError(null);
    setExportingFormat(format);
    try {
      await exportRunViaApi(runId, format);
    } catch (err) {
      setExportError(getErrorMessage(err));
    } finally {
      setExportingFormat(null);
    }
  };

  const toggleExpanded = (resultId: number) => {
    setExpandedResults((prev) => {
      const next = new Set(prev);
      if (next.has(resultId)) {
        next.delete(resultId);
      } else {
        next.add(resultId);
      }
      return next;
    });
  };

  if (Number.isNaN(runId)) {
    return <div className="text-destructive">Некорректный ID запуска</div>;
  }

  if (isLoading) {
    return <div className="text-foreground">Загрузка запуска...</div>;
  }

  if (error || !run) {
    return (
      <div>
        <p className="text-destructive mb-4">Запуск не найден или произошла ошибка</p>
        <ButtonLink variant="link" href="/runs">
          ← Назад к списку
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <ButtonLink variant="link" size="sm" href="/runs">
        ← Назад к списку
      </ButtonLink>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold mb-2">Запуск #{run.id}</h1>
          <StatusBadge status={run.status} summary={run.summary_json} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(['json', 'csv', 'html', 'pdf'] as ExportFormat[]).map((format) => (
            <Button
              key={format}
              variant="outline"
              onClick={() => handleExport(format)}
              disabled={
                !run.results.length ||
                exportingFormat !== null ||
                executeMutation.isPending
              }
            >
              {exportingFormat === format
                ? `Export ${format.toUpperCase()}...`
                : `Export ${format.toUpperCase()}`}
            </Button>
          ))}
          <Button
            onClick={() => executeMutation.mutate()}
            disabled={executeMutation.isPending || run.status === 'running'}
          >
            {executeMutation.isPending || run.status === 'running'
              ? 'Запуск...'
              : 'Перезапустить проверку'}
          </Button>
        </div>
      </div>

      {exportError && (
        <p className="text-sm text-destructive">Ошибка экспорта: {exportError}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <InfoCard label="Датасет" value={`#${run.dataset_id}`} />
        <InfoCard label="Начало" value={formatDate(run.started_at)} />
        <InfoCard label="Завершение" value={formatDate(run.finished_at)} />
        <InfoCard
          label="Сводка"
          value={
            run.summary_json
              ? `${run.summary_json.passed ?? 0} / ${run.summary_json.total_rules ?? 0} правил пройдено`
              : '—'
          }
        />
      </div>

      {run.summary_json && (
        <div className="grid grid-cols-3 gap-4">
          <SummaryStat
            label="Всего правил"
            value={run.summary_json.total_rules ?? 0}
          />
          <SummaryStat
            label="Пройдено"
            value={run.summary_json.passed ?? 0}
            className="text-green-600"
          />
          <SummaryStat
            label="Не пройдено"
            value={run.summary_json.failed ?? 0}
            className="text-destructive"
          />
        </div>
      )}

      <RunLlmAnalysis
        runId={run.id}
        status={run.status}
        hasResults={run.results.length > 0}
      />

      <div>
        <h2 className="text-lg font-semibold mb-4">Результаты правил</h2>

        {run.results.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-foreground">
              Результаты отсутствуют. Запустите проверку, чтобы получить результаты.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {run.results.map((result) => {
              const rule = rulesMap.get(result.rule_id);
              const badRows = result.details_json?.sample_bad_rows ?? [];
              const hasBadRows = badRows.length > 0;
              const isExpanded = expandedResults.has(result.id);

              return (
                <Card key={result.id} className="py-0">
                  <CardHeader className="border-b">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <Badge
                          className={cn(
                            'h-8 w-8 rounded-full p-0 text-sm',
                            result.passed
                              ? 'bg-green-100 text-green-700'
                              : 'bg-destructive/10 text-destructive'
                          )}
                        >
                          {result.passed ? '✓' : '✗'}
                        </Badge>
                        <div>
                          <CardTitle>
                            {rule?.rule_name ?? `Правило #${result.rule_id}`}
                          </CardTitle>
                          <p className="text-sm text-foreground mt-1">
                            {rule?.rule_type}
                            {rule?.column_name ? ` · ${rule.column_name}` : ''}
                            {' · '}
                            Ошибок: {result.failed_count}
                          </p>
                        </div>
                      </div>
                      {hasBadRows && (
                        <Button
                          variant="link"
                          size="sm"
                          onClick={() => toggleExpanded(result.id)}
                        >
                          {isExpanded
                            ? 'Скрыть проблемные строки'
                            : `Показать проблемные строки (${badRows.length})`}
                        </Button>
                      )}
                    </div>
                  </CardHeader>

                  {isExpanded && hasBadRows && (
                    <CardContent>
                      <p className="text-sm font-medium text-foreground mb-2">
                        Примеры проблемных строк
                      </p>
                      <SampleBadRowsTable rows={badRows} />
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-0">
        <p className="text-sm text-foreground mb-1">{label}</p>
        <p className="font-medium">{value}</p>
      </CardContent>
    </Card>
  );
}

function SummaryStat({
  label,
  value,
  className = '',
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-0 text-center">
        <p className="text-sm text-foreground mb-1">{label}</p>
        <p className={cn('text-2xl font-semibold', className)}>{value}</p>
      </CardContent>
    </Card>
  );
}