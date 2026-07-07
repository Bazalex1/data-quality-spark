'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import StatusBadge from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { ButtonLink } from '@/components/ui/button-link';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
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
  createRun,
  executeRun,
  getDatasets,
  getRuns,
  type Run,
  type RunStatus,
} from '@/lib/api';
import { getErrorMessage } from '@/lib/errors';

const STATUS_FILTERS: { value: RunStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'pending', label: 'Ожидание' },
  { value: 'running', label: 'Выполняется' },
  { value: 'success', label: 'Успешно' },
  { value: 'failed', label: 'Ошибка' },
];

export default function RunsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<RunStatus | 'all'>('all');
  const [executingId, setExecutingId] = useState<number | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedDatasetId, setSelectedDatasetId] = useState('');

  const { data: datasets, isLoading: datasetsLoading } = useQuery({
    queryKey: ['datasets'],
    queryFn: () => getDatasets(),
    enabled: createDialogOpen,
  });

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

  const createMutation = useMutation({
    mutationFn: (datasetId: number) => createRun(datasetId),
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: ['runs'] });
      setCreateDialogOpen(false);
      setSelectedDatasetId('');
      router.push(`/runs/${run.id}`);
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
        <Button onClick={() => setCreateDialogOpen(true)}>+ Новый запуск</Button>
      </div>

      <Dialog
        open={createDialogOpen}
        onClose={() => {
          if (!createMutation.isPending) {
            setCreateDialogOpen(false);
            setSelectedDatasetId('');
          }
        }}
        title="Новый запуск"
        description="Выберите датасет и создайте новую проверку качества"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="new-run-dataset"
              className="text-sm font-medium text-foreground"
            >
              Датасет
            </label>
            <FormSelect
              id="new-run-dataset"
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

          {createMutation.error ? (
            <p className="text-sm text-destructive">
              {getErrorMessage(createMutation.error)}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
              disabled={createMutation.isPending}
            >
              Отмена
            </Button>
            <Button
              onClick={() => {
                if (!selectedDatasetId) return;
                createMutation.mutate(Number(selectedDatasetId));
              }}
              disabled={
                !selectedDatasetId ||
                createMutation.isPending ||
                datasetsLoading
              }
            >
              {createMutation.isPending ? 'Создание...' : 'Создать запуск'}
            </Button>
          </div>
        </div>
      </Dialog>

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