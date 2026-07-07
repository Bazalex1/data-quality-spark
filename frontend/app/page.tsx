'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import StatusBadge from '@/components/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ButtonLink } from '@/components/ui/button-link';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { FormSelect } from '@/components/ui/form-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ColumnErrorsChart,
  RunStatusChart,
} from '@/components/dashboard-charts';
import {
  buildColumnErrorsChartData,
  buildDashboardData,
  buildRunStatusChartData,
  findLatestRunForDetails,
  type ColumnResult,
  type DashboardError,
} from '@/lib/dashboard-stats';
import { createRun, getDatasets, getRun, getRules, getRuns } from '@/lib/api';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');

  const { data: runs, isLoading: runsLoading, error: runsError } = useQuery({
    queryKey: ['runs'],
    queryFn: () => getRuns(),
    refetchInterval: (query) => {
      const hasRunning = query.state.data?.some((r) => r.status === 'running');
      return hasRunning ? 2000 : false;
    },
  });

  const { data: datasets, isLoading: datasetsLoading } = useQuery({
    queryKey: ['datasets'],
    queryFn: () => getDatasets(),
  });

  const { data: rules } = useQuery({
    queryKey: ['rules'],
    queryFn: () => getRules(),
  });

  const latestRunCandidate = useMemo(
    () => (runs ? findLatestRunForDetails(runs) : null),
    [runs]
  );

  const { data: latestRunDetail } = useQuery({
    queryKey: ['run', latestRunCandidate?.id],
    queryFn: () => getRun(latestRunCandidate!.id),
    enabled: !!latestRunCandidate?.id,
  });

  const dashboard = useMemo(
    () => buildDashboardData(runs ?? [], rules ?? [], latestRunDetail ?? null),
    [runs, rules, latestRunDetail]
  );

  const createMutation = useMutation({
    mutationFn: (datasetId: number) => createRun(datasetId),
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: ['runs'] });
      router.push(`/runs/${run.id}`);
    },
  });

  if (runsLoading) {
    return <div className="text-foreground">Загрузка...</div>;
  }

  if (runsError) {
    return <div className="text-destructive">Ошибка загрузки данных</div>;
  }

  const handleCreateRun = () => {
    if (!selectedDatasetId) return;
    createMutation.mutate(Number(selectedDatasetId));
  };

  const { statistics: stats } = dashboard;
  const runStatusChartData = buildRunStatusChartData(stats);
  const columnErrorsChartData = buildColumnErrorsChartData(
    dashboard.columnResults
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-semibold mb-1">Dashboard</h1>
          <p className="text-base text-foreground">
            Обзор проверок качества данных
          </p>
        </div>
        <ButtonLink variant="link" href="/runs">
          Все запуски →
        </ButtonLink>
      </div>

      {/* Статистика */}
      <section>
        <SectionTitle
          title="Статистика"
          description="Сводные показатели по всем запускам проверок"
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <KpiCard label="Всего запусков" value={stats.totalRuns} />
          <KpiCard
            label="Успешных"
            value={stats.successfulRuns}
            valueClassName="text-green-600"
          />
          <KpiCard
            label="С ошибками"
            value={stats.failedRuns}
            valueClassName="text-destructive"
          />
          <KpiCard
            label="Успешность"
            value={`${stats.successRate}%`}
            valueClassName="text-foreground"
          />
          <KpiCard
            label="Правил пройдено"
            value={`${stats.totalRulesPassed}/${stats.totalRulesChecked}`}
          />
          <KpiCard
            label="Ошибок в последнем запуске"
            value={stats.totalErrorsFound}
            valueClassName={
              stats.totalErrorsFound > 0 ? 'text-destructive' : 'text-green-600'
            }
          />
        </div>
      </section>

      <section>
        <SectionTitle
          title="Графики"
          description="Визуализация статусов запусков и ошибок по колонкам"
        />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <RunStatusChart data={runStatusChartData} />
          <ColumnErrorsChart
            data={columnErrorsChartData}
            latestRunId={dashboard.latestRunId}
          />
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Новый запуск</CardTitle>
          <CardDescription>
            Выберите датасет и создайте новую проверку качества
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Датасет
              </label>
              <FormSelect
                value={selectedDatasetId}
                onValueChange={setSelectedDatasetId}
                disabled={datasetsLoading || !datasets?.length}
                placeholder={
                  datasetsLoading ? 'Загрузка...' : 'Выберите датасет'
                }
                options={
                  datasets?.map((ds) => ({
                    value: String(ds.id),
                    label: `${ds.name} (#${ds.id})`,
                  })) ?? []
                }
              />
            </div>
            <Button
              onClick={handleCreateRun}
              disabled={
                !selectedDatasetId ||
                createMutation.isPending ||
                !datasets?.length
              }
            >
              {createMutation.isPending ? 'Создание...' : '+ Создать запуск'}
            </Button>
          </div>
          {!datasetsLoading && datasets?.length === 0 && (
            <p className="text-sm text-foreground mt-3">
              Нет доступных датасетов. Сначала создайте датасет.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Результаты по колонкам */}
        <section>
          <SectionTitle
            title="Результаты по колонкам"
            description={
              dashboard.latestRunId
                ? `На основе запуска #${dashboard.latestRunId}`
                : 'Нет данных для отображения'
            }
          />
          <Card className="py-0">
            {dashboard.columnResults.length === 0 ? (
              <CardContent className="py-10 text-center text-foreground">
                Запустите проверку, чтобы увидеть результаты по колонкам.
              </CardContent>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Колонка</TableHead>
                    <TableHead>Правила</TableHead>
                    <TableHead>Пройдено</TableHead>
                    <TableHead>Ошибок</TableHead>
                    <TableHead>Статус</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.columnResults.map((col) => (
                    <ColumnResultRow key={col.columnName} column={col} />
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </section>

        {/* Ошибки */}
        <section>
          <SectionTitle
            title="Ошибки"
            description="Проблемные запуски и нарушения правил"
          />
          <Card>
            <CardContent className="pt-0 space-y-3">
              {dashboard.errors.length === 0 ? (
                <p className="py-8 text-center text-foreground">
                  Ошибок не обнаружено
                </p>
              ) : (
                dashboard.errors.map((error) => (
                  <ErrorItem key={error.id} error={error} />
                ))
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      {/* История */}
      <section>
        <SectionTitle
          title="История запусков"
          description="Полный список проверок качества данных"
        />
        <Card className="py-0">
          {dashboard.history.length === 0 ? (
            <CardContent className="py-12 text-center text-foreground">
              Запусков пока нет. Создайте первый запуск выше.
            </CardContent>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Датасет</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Сводка</TableHead>
                  <TableHead>Начало</TableHead>
                  <TableHead>Завершение</TableHead>
                  <TableHead className="text-right">Действие</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.history.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="font-mono">#{run.id}</TableCell>
                    <TableCell>#{run.dataset_id}</TableCell>
                    <TableCell>
                      <StatusBadge status={run.status} />
                    </TableCell>
                    <TableCell>
                      {run.summary_json
                        ? `${run.summary_json.passed ?? 0}/${run.summary_json.total_rules ?? 0}`
                        : '—'}
                    </TableCell>
                    <TableCell>
                      {new Date(run.started_at).toLocaleString('ru-RU')}
                    </TableCell>
                    <TableCell>
                      {run.finished_at
                        ? new Date(run.finished_at).toLocaleString('ru-RU')
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <ButtonLink
                        variant="link"
                        size="sm"
                        href={`/runs/${run.id}`}
                      >
                        Подробнее →
                      </ButtonLink>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </section>
    </div>
  );
}

function SectionTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mb-4">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="text-sm text-foreground mt-0.5">{description}</p>
    </div>
  );
}

function KpiCard({
  label,
  value,
  valueClassName = 'text-foreground',
}: {
  label: string;
  value: number | string;
  valueClassName?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-0">
        <p className="text-sm text-foreground mb-2">{label}</p>
        <p className={cn('text-3xl font-semibold', valueClassName)}>{value}</p>
      </CardContent>
    </Card>
  );
}

function ColumnResultRow({ column }: { column: ColumnResult }) {
  const statusConfig = {
    ok: { label: 'OK', className: 'bg-green-100 text-green-700' },
    warning: { label: 'Частично', className: 'bg-amber-100 text-amber-800' },
    error: { label: 'Ошибки', className: 'bg-destructive/10 text-destructive' },
  }[column.status];

  return (
    <TableRow>
      <TableCell className="font-medium">{column.columnName}</TableCell>
      <TableCell>{column.rulesTotal}</TableCell>
      <TableCell>
        <span className="text-green-600">{column.rulesPassed}</span>
        {' / '}
        <span className="text-destructive">{column.rulesFailed}</span>
      </TableCell>
      <TableCell className="font-mono">{column.totalErrors}</TableCell>
      <TableCell>
        <Badge className={statusConfig.className}>{statusConfig.label}</Badge>
      </TableCell>
    </TableRow>
  );
}

function ErrorItem({ error }: { error: DashboardError }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Badge
            variant={error.type === 'run' ? 'destructive' : 'outline'}
            className="shrink-0"
          >
            {error.type === 'run' ? 'Запуск' : 'Правило'}
          </Badge>
          <p className="font-medium truncate">{error.title}</p>
        </div>
        <p className="text-sm text-foreground">{error.description}</p>
        <p className="text-xs text-foreground mt-1">
          {new Date(error.createdAt).toLocaleString('ru-RU')}
        </p>
      </div>
      <ButtonLink variant="outline" size="sm" href={`/runs/${error.runId}`}>
        Открыть
      </ButtonLink>
    </div>
  );
}