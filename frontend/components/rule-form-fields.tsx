import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormSelect } from '@/components/ui/form-select';
import type { Dataset } from '@/lib/api';
import {
  DEMO_COLUMNS,
  RULE_TYPE_OPTIONS,
  ruleTypeNeedsMinMax,
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
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Датасет</Label>
        <FormSelect
          value={form.dataset_id}
          onValueChange={(value) => onChange('dataset_id', value)}
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
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="rule-column">Колонка</Label>
        <Input
          id="rule-column"
          list="demo-columns"
          value={form.column_name}
          onChange={(e) => onChange('column_name', e.target.value)}
          placeholder="Например: email"
          required
        />
        <datalist id="demo-columns">
          {DEMO_COLUMNS.map((col) => (
            <option key={col} value={col} />
          ))}
        </datalist>
      </div>

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