'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import StatusBadge from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { ButtonLink } from '@/components/ui/button-link';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { executeRun, getRuns, type Run, type RunStatus } from '@/lib/api';

const STATUS_FILTERS: { value: RunStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'pending', label: 'Ожидание' },
  { value: 'running', label: 'Выполняется' },
  { value: 'success', label: 'Успешно' },
  { value: 'failed', label: 'Ошибка' },
];

export default function RunsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<RunStatus | 'all'>('all');
  const [executingId, setExecutingId] = useState<number | null>(null);

  const { data: runs, isLoading, error } = useQuery({
    queryKey: ['runs'],
    queryFn: () => getRuns(),
    refetchInterval: (query) => {
      const hasRunning = query.state.data?.some((r) => r.status === 'running');
      return hasRunning ? 2000 : false;
    },
  });

  const executeMutation = useMutation({
    mutationFn: (runId: number) => executeRun(runId),
    onMutate: (runId) => setExecutingId(runId),
    onSettled: () => setExecutingId(null),
    onSuccess: (_, runId) => {
      queryClient.invalidateQueries({ queryKey: ['runs'] });
      queryClient.invalidateQueries({ queryKey: ['run', runId] });
    },
  });

  const filteredRuns = useMemo(() => {
    if (!runs) return [];
    if (statusFilter === 'all') return runs;
    return runs.filter((run) => run.status === statusFilter);
  }, [runs, statusFilter]);

  if (isLoading) return <div className="text-foreground">Загрузка запусков...</div>;
  if (error) return <div className="text-destructive">Ошибка загрузки данных</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <h1 className="text-2xl font-semibold">Запуски проверок</h1>
        <ButtonLink href="/">+ Новый запуск</ButtonLink>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((filter) => (
          <Button
            key={filter.value}
            variant={statusFilter === filter.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter(filter.value)}
          >
            {filter.label}
            {runs && filter.value !== 'all' && (
              <span className="ml-1.5 opacity-70">
                ({runs.filter((r) => r.status === filter.value).length})
              </span>
            )}
          </Button>
        ))}
      </div>

      <Card className="py-0">
        {filteredRuns.length === 0 ? (
          <div className="px-6 py-12 text-center text-foreground">
            {statusFilter === 'all'
              ? 'Запусков пока нет'
              : 'Нет запусков с выбранным статусом'}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Dataset ID</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Сводка</TableHead>
                <TableHead>Начало</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRuns.map((run) => (
                <RunRow
                  key={run.id}
                  run={run}
                  isExecuting={executingId === run.id}
                  onExecute={() => executeMutation.mutate(run.id)}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function RunRow({
  run,
  isExecuting,
  onExecute,
}: {
  run: Run;
  isExecuting: boolean;
  onExecute: () => void;
}) {
  const canExecute = run.status !== 'running' && !isExecuting;

  return (
    <TableRow>
      <TableCell className="font-mono">#{run.id}</TableCell>
      <TableCell>{run.dataset_id}</TableCell>
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
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onExecute}
            disabled={!canExecute}
          >
            {isExecuting || run.status === 'running' ? 'Запуск...' : 'Запустить'}
          </Button>
          <ButtonLink variant="link" size="sm" href={`/runs/${run.id}`}>
            Подробнее →
          </ButtonLink>
        </div>
      </TableCell>
    </TableRow>
  );
}