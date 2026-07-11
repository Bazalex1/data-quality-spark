'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { FormSelect } from '@/components/ui/form-select';
import { getDatasetColumns, type Dataset } from '@/lib/api';
import {
  RULE_TYPE_OPTIONS,
  ruleTypeNeedsAcceptedValues,
  ruleTypeNeedsColumn,
  ruleTypeNeedsCustomSql,
  ruleTypeNeedsExpectedColumns,
  ruleTypeNeedsFreshness,
  ruleTypeNeedsMinMax,
  ruleTypeNeedsNullPercent,
  ruleTypeNeedsRegex,
  ruleTypeNeedsRowCount,
  ruleTypeNeedsValue,
  type RuleFormState,
} from '@/lib/rule-form';

interface RuleFormFieldsProps {
  form: RuleFormState;
  datasets: Dataset[] | undefined;
  onChange: <K extends keyof RuleFormState>(key: K, value: RuleFormState[K]) => void;
  disableDataset?: boolean;
}

export function RuleFormFields({
  form,
  datasets,
  onChange,
  disableDataset = false,
}: RuleFormFieldsProps) {
  const [columnInputMode, setColumnInputMode] = useState<'select' | 'manual'>(
    'select'
  );

  const datasetId = form.dataset_id ? Number(form.dataset_id) : null;
  const needsDatasetColumns =
    !!datasetId &&
    (ruleTypeNeedsColumn(form.rule_type) || ruleTypeNeedsExpectedColumns(form.rule_type));

  const {
    data: columnsData,
    isLoading: columnsLoading,
    isError: columnsError,
  } = useQuery({
    queryKey: ['dataset-columns', datasetId],
    queryFn: () => getDatasetColumns(datasetId!),
    enabled: needsDatasetColumns,
  });

  const columns = columnsData?.columns ?? [];

  useEffect(() => {
    if (
      columnInputMode === 'select' &&
      columns.length > 0 &&
      form.column_name &&
      !columns.includes(form.column_name)
    ) {
      onChange('column_name', '');
    }
  }, [columns, columnInputMode, form.column_name]); // eslint-disable-line react-hooks/exhaustive-deps

  const showColumnField = ruleTypeNeedsColumn(form.rule_type);
  const ruleLevelLabel =
    RULE_TYPE_OPTIONS.find((o) => o.value === form.rule_type)?.level === 'dataset'
      ? 'Уровень: датасет'
      : 'Уровень: колонка';

  const appendExpectedColumn = (column: string) => {
    const current = form.expected_columns
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (current.includes(column)) return;

    onChange('expected_columns', [...current, column].join(', '));
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Датасет</Label>
        <FormSelect
          value={form.dataset_id}
          onValueChange={(value) => {
            onChange('dataset_id', value);
            onChange('column_name', '');
          }}
          placeholder="Выберите датасет"
          disabled={disableDataset || !datasets?.length}
          options={
            datasets?.map((ds) => ({
              value: String(ds.id),
              label: `${ds.name} (#${ds.id})`,
            })) ?? []
          }
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="rule-name">Название правила</Label>
        <Input
          id="rule-name"
          value={form.rule_name}
          onChange={(e) => onChange('rule_name', e.target.value)}
          placeholder="Например: Email not null"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label>Тип правила</Label>
        <FormSelect
          value={form.rule_type}
          onValueChange={(value) =>
            onChange('rule_type', value as RuleFormState['rule_type'])
          }
          options={RULE_TYPE_OPTIONS.map((opt) => ({
            value: opt.value,
            label: opt.label,
          }))}
        />
        <p className="text-xs text-foreground">
          {RULE_TYPE_OPTIONS.find((o) => o.value === form.rule_type)?.description}
        </p>
        <p className="text-xs text-foreground">{ruleLevelLabel}</p>
      </div>

      {showColumnField && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>Колонка</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={columnInputMode === 'select' ? 'default' : 'outline'}
                onClick={() => setColumnInputMode('select')}
                disabled={!datasetId}
              >
                Из датасета
              </Button>
              <Button
                type="button"
                size="sm"
                variant={columnInputMode === 'manual' ? 'default' : 'outline'}
                onClick={() => setColumnInputMode('manual')}
              >
                Вручную
              </Button>
            </div>
          </div>

          {!datasetId ? (
            <p className="text-xs text-foreground">
              Сначала выберите датасет, чтобы загрузить список колонок.
            </p>
          ) : columnInputMode === 'select' ? (
            <>
              {columnsLoading ? (
                <p className="text-sm text-foreground">Загрузка колонок...</p>
              ) : columnsError ? (
                <div className="space-y-2">
                  <p className="text-sm text-destructive">
                    Не удалось загрузить колонки. Укажите вручную.
                  </p>
                  <Input
                    id="rule-column"
                    value={form.column_name}
                    onChange={(e) => onChange('column_name', e.target.value)}
                    placeholder="Например: email"
                    required
                  />
                </div>
              ) : columns.length > 0 ? (
                <FormSelect
                  value={form.column_name}
                  onValueChange={(value) => onChange('column_name', value)}
                  placeholder="Выберите колонку"
                  options={columns.map((col) => ({
                    value: col,
                    label: col,
                  }))}
                />
              ) : (
                <p className="text-sm text-foreground">
                  Колонки не найдены. Переключитесь на ручной ввод.
                </p>
              )}
            </>
          ) : (
            <Input
              id="rule-column"
              value={form.column_name}
              onChange={(e) => onChange('column_name', e.target.value)}
              placeholder="Например: email"
              required
            />
          )}
        </div>
      )}

      {ruleTypeNeedsMinMax(form.rule_type) && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="rule-min">Min</Label>
            <Input
              id="rule-min"
              type="number"
              value={form.min_value}
              onChange={(e) => onChange('min_value', e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rule-max">Max</Label>
            <Input
              id="rule-max"
              type="number"
              value={form.max_value}
              onChange={(e) => onChange('max_value', e.target.value)}
              placeholder="120"
            />
          </div>
        </div>
      )}

      {ruleTypeNeedsValue(form.rule_type) && (
        <div className="space-y-1.5">
          <Label htmlFor="rule-value">Значение (не должно встречаться)</Label>
          <Input
            id="rule-value"
            value={form.not_equal_value}
            onChange={(e) => onChange('not_equal_value', e.target.value)}
            placeholder="Например: 0"
          />
        </div>
      )}

      {ruleTypeNeedsRegex(form.rule_type) && (
        <div className="space-y-1.5">
          <Label htmlFor="rule-pattern">Регулярное выражение (pattern)</Label>
          <Input
            id="rule-pattern"
            value={form.regex_pattern}
            onChange={(e) => onChange('regex_pattern', e.target.value)}
            placeholder="Например: ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+$"
          />
          <p className="text-xs text-foreground">
            Проверяются строки, которые не соответствуют паттерну.
          </p>
        </div>
      )}

      {ruleTypeNeedsAcceptedValues(form.rule_type) && (
        <div className="space-y-1.5">
          <Label htmlFor="rule-accepted-values">Допустимые значения</Label>
          <Input
            id="rule-accepted-values"
            value={form.accepted_values}
            onChange={(e) => onChange('accepted_values', e.target.value)}
            placeholder="Например: Москва, Казань, Самара"
          />
          <p className="text-xs text-foreground">
            Перечислите значения через запятую.
          </p>
        </div>
      )}

      {ruleTypeNeedsRowCount(form.rule_type) && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="rule-min-rows">Min rows (опционально)</Label>
            <Input
              id="rule-min-rows"
              type="number"
              value={form.min_rows}
              onChange={(e) => onChange('min_rows', e.target.value)}
              placeholder="1"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rule-max-rows">Max rows (опционально)</Label>
            <Input
              id="rule-max-rows"
              type="number"
              value={form.max_rows}
              onChange={(e) => onChange('max_rows', e.target.value)}
              placeholder="10000"
            />
          </div>
          <p className="col-span-2 text-xs text-foreground">
            Укажите хотя бы одно из полей: минимальное или максимальное число строк.
          </p>
        </div>
      )}

      {ruleTypeNeedsExpectedColumns(form.rule_type) && (
        <div className="space-y-2">
          <Label htmlFor="rule-expected-columns">Ожидаемые колонки</Label>
          <Input
            id="rule-expected-columns"
            value={form.expected_columns}
            onChange={(e) => onChange('expected_columns', e.target.value)}
            placeholder="id, name, email, age"
          />
          <p className="text-xs text-foreground">
            Перечислите названия колонок через запятую.
          </p>
          {datasetId && columns.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {columns.map((column) => (
                <Button
                  key={column}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => appendExpectedColumn(column)}
                >
                  + {column}
                </Button>
              ))}
            </div>
          )}
          {columnsLoading && (
            <p className="text-xs text-foreground">Загрузка колонок датасета...</p>
          )}
        </div>
      )}

      {ruleTypeNeedsFreshness(form.rule_type) && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="rule-max-age-hours">Max age (hours)</Label>
            <Input
              id="rule-max-age-hours"
              type="number"
              value={form.max_age_hours}
              onChange={(e) => onChange('max_age_hours', e.target.value)}
              placeholder="24"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rule-max-age-days">Max age (days)</Label>
            <Input
              id="rule-max-age-days"
              type="number"
              value={form.max_age_days}
              onChange={(e) => onChange('max_age_days', e.target.value)}
              placeholder="7"
            />
          </div>
          <p className="col-span-2 text-xs text-foreground">
            Свежесть: max(timestamp колонки) не старше указанного порога. Достаточно
            одного из полей.
          </p>
        </div>
      )}

      {ruleTypeNeedsNullPercent(form.rule_type) && (
        <div className="space-y-1.5">
          <Label htmlFor="rule-max-null-percent">Max null percent (0–100)</Label>
          <Input
            id="rule-max-null-percent"
            type="number"
            min={0}
            max={100}
            value={form.max_null_percent}
            onChange={(e) => onChange('max_null_percent', e.target.value)}
            placeholder="5"
          />
          <p className="text-xs text-foreground">
            Правило проходит, если доля NULL/пустых значений ≤ порога.
          </p>
        </div>
      )}

      {ruleTypeNeedsCustomSql(form.rule_type) && (
        <div className="space-y-1.5">
          <Label htmlFor="rule-custom-condition">
            Spark SQL condition (true = плохая строка)
          </Label>
          <Input
            id="rule-custom-condition"
            value={form.custom_condition}
            onChange={(e) => onChange('custom_condition', e.target.value)}
            placeholder="end_date < start_date OR amount < 0"
          />
          <p className="text-xs text-foreground">
            Пример бизнес-правил: <code>end_date &lt; start_date</code>,{' '}
            <code>amount &lt; 0</code>, <code>status NOT IN (&apos;A&apos;,&apos;B&apos;)</code>
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Severity</Label>
          <FormSelect
            value={form.severity}
            onValueChange={(value) =>
              onChange('severity', value as RuleFormState['severity'])
            }
            options={[
              { value: 'warning', label: 'warning' },
              { value: 'critical', label: 'critical' },
            ]}
          />
        </div>

        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => onChange('is_active', e.target.checked)}
              className="size-4 rounded border-input"
            />
            <span className="text-sm font-medium text-foreground">Активно</span>
          </label>
        </div>
      </div>
    </div>
  );
}