'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { RuleFormFields } from '@/components/rule-form-fields';
import { ToastBanner, type ToastState } from '@/components/toast-banner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { FormSelect } from '@/components/ui/form-select';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getErrorMessage } from '@/lib/errors';
import {
  createRule,
  deleteRule,
  getDatasets,
  getRules,
  updateRule,
  type Rule,
} from '@/lib/api';
import {
  buildRuleCreatePayload,
  buildRuleUpdatePayload,
  initialRuleFormState,
  ruleToFormState,
  validateRuleForm,
  type RuleFormState,
} from '@/lib/rule-form';
import { cn } from '@/lib/utils';

export default function RulesPage() {
  const queryClient = useQueryClient();
  const [datasetFilter, setDatasetFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [form, setForm] = useState<RuleFormState>(initialRuleFormState);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const { data: datasets } = useQuery({
    queryKey: ['datasets'],
    queryFn: () => getDatasets(),
  });

  const datasetFilterId =
    datasetFilter === 'all' ? undefined : Number(datasetFilter);

  const { data: rules, isLoading, error } = useQuery({
    queryKey: ['rules', datasetFilterId ?? 'all'],
    queryFn: () => getRules(datasetFilterId),
  });

  const datasetsMap = useMemo(
    () => new Map(datasets?.map((d) => [d.id, d]) ?? []),
    [datasets]
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['rules'] });
  };

  const createMutation = useMutation({
    mutationFn: createRule,
    onSuccess: () => {
      invalidate();
      closeDialog();
      setToast({ type: 'success', message: 'Правило успешно создано' });
    },
    onError: (err) => setFormError(getErrorMessage(err)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: ReturnType<typeof buildRuleUpdatePayload> }) =>
      updateRule(id, data),
    onSuccess: () => {
      invalidate();
      closeDialog();
      setToast({ type: 'success', message: 'Правило обновлено' });
    },
    onError: (err) => setFormError(getErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRule,
    onSuccess: () => {
      invalidate();
      setToast({ type: 'success', message: 'Правило удалено' });
    },
    onError: (err) =>
      setToast({ type: 'error', message: getErrorMessage(err) }),
  });

  const updateForm = <K extends keyof RuleFormState>(
    key: K,
    value: RuleFormState[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const openCreateDialog = () => {
    setEditingRule(null);
    setForm({
      ...initialRuleFormState,
      dataset_id:
        datasetFilter !== 'all' ? datasetFilter : initialRuleFormState.dataset_id,
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const openEditDialog = (rule: Rule) => {
    setEditingRule(rule);
    setForm(ruleToFormState(rule));
    setFormError(null);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingRule(null);
    setFormError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const validationError = validateRuleForm(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    if (editingRule) {
      updateMutation.mutate({
        id: editingRule.id,
        data: buildRuleUpdatePayload(form),
      });
    } else {
      createMutation.mutate(buildRuleCreatePayload(form));
    }
  };

  const handleDelete = (rule: Rule) => {
    const confirmed = window.confirm(`Удалить правило «${rule.rule_name}»?`);
    if (confirmed) {
      deleteMutation.mutate(rule.id);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (isLoading) {
    return <div className="text-foreground">Загрузка правил...</div>;
  }

  if (error) {
    return <div className="text-destructive">Ошибка загрузки правил</div>;
  }

  const datasetFilterOptions = [
    { value: 'all', label: 'Все датасеты' },
    ...(datasets?.map((ds) => ({
      value: String(ds.id),
      label: `${ds.name} (#${ds.id})`,
    })) ?? []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Правила</h1>
          <p className="text-base text-foreground mt-1">
            Правила проверки качества данных
          </p>
        </div>
        <Button onClick={openCreateDialog} disabled={!datasets?.length}>
          + Добавить правило
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Label>Фильтр по датасету</Label>
        <FormSelect
          value={datasetFilter}
          onValueChange={setDatasetFilter}
          className="min-w-[220px]"
          options={datasetFilterOptions}
        />
      </div>

      <Card className="py-0">
        {!rules?.length ? (
          <div className="px-6 py-12 text-center text-foreground">
            Правил пока нет. Добавьте первое правило.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Название</TableHead>
                <TableHead>Датасет</TableHead>
                <TableHead>Тип</TableHead>
                <TableHead>Колонка</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Активно</TableHead>
                <TableHead>Создано</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-mono">#{rule.id}</TableCell>
                  <TableCell className="font-medium">{rule.rule_name}</TableCell>
                  <TableCell>
                    {datasetsMap.get(rule.dataset_id)?.name ??
                      `#${rule.dataset_id}`}
                  </TableCell>
                  <TableCell>{rule.rule_type}</TableCell>
                  <TableCell>{rule.column_name ?? '—'}</TableCell>
                  <TableCell>
                    <Badge
                      className={cn(
                        rule.severity === 'critical'
                          ? 'bg-destructive/10 text-destructive'
                          : 'bg-amber-100 text-amber-800'
                      )}
                    >
                      {rule.severity}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {rule.is_active ? (
                      <span className="text-green-600">Да</span>
                    ) : (
                      <span className="text-foreground">Нет</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {new Date(rule.created_at).toLocaleString('ru-RU')}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(rule)}
                      >
                        Изменить
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(rule)}
                        disabled={deleteMutation.isPending}
                      >
                        Удалить
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog
        open={dialogOpen}
        onClose={closeDialog}
        title={editingRule ? 'Редактировать правило' : 'Добавить правило'}
        description="Настройте проверку качества для выбранного датасета"
      >
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <RuleFormFields
            form={form}
            datasets={datasets}
            onChange={updateForm}
            disableDataset={!!editingRule}
          />

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={closeDialog}>
              Отмена
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving
                ? 'Сохранение...'
                : editingRule
                  ? 'Сохранить'
                  : 'Создать'}
            </Button>
          </div>
        </form>
      </Dialog>

      <ToastBanner toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}