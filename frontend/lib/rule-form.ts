import type { Rule, RuleCreate, RuleType, RuleUpdate } from '@/lib/api';

export const RULE_TYPE_OPTIONS: {
  value: RuleType;
  label: string;
  description: string;
}[] = [
  { value: 'not_null', label: 'Not Null', description: 'Колонка не должна содержать NULL' },
  { value: 'unique', label: 'Unique', description: 'Значения колонки должны быть уникальны' },
  { value: 'min_max', label: 'Min / Max', description: 'Значение в заданном диапазоне' },
  { value: 'not_equal', label: 'Not Equal', description: 'Значение не должно равняться заданному' },
  { value: 'not_zero', label: 'Not Zero', description: 'Значение не должно быть нулём' },
];

export const DEMO_COLUMNS = ['id', 'name', 'email', 'age', 'city'];

export interface RuleFormState {
  dataset_id: string;
  rule_name: string;
  rule_type: RuleType;
  column_name: string;
  min_value: string;
  max_value: string;
  not_equal_value: string;
  severity: 'warning' | 'critical';
  is_active: boolean;
}

export const initialRuleFormState: RuleFormState = {
  dataset_id: '',
  rule_name: '',
  rule_type: 'not_null',
  column_name: '',
  min_value: '',
  max_value: '',
  not_equal_value: '',
  severity: 'warning',
  is_active: true,
};

export function ruleTypeNeedsColumn(ruleType: RuleType): boolean {
  return ['not_null', 'unique', 'min_max', 'not_equal', 'not_zero'].includes(ruleType);
}

export function ruleTypeNeedsMinMax(ruleType: RuleType): boolean {
  return ruleType === 'min_max';
}

export function ruleTypeNeedsValue(ruleType: RuleType): boolean {
  return ruleType === 'not_equal' || ruleType === 'not_zero';
}

export function validateRuleForm(form: RuleFormState): string | null {
  if (!form.dataset_id) return 'Выберите датасет';
  if (form.rule_name.trim().length < 3) return 'Название правила — минимум 3 символа';
  if (ruleTypeNeedsColumn(form.rule_type) && !form.column_name.trim()) {
    return 'Укажите колонку';
  }
  if (ruleTypeNeedsMinMax(form.rule_type)) {
    if (form.min_value === '' || form.max_value === '') {
      return 'Укажите min и max';
    }
    if (Number.isNaN(Number(form.min_value)) || Number.isNaN(Number(form.max_value))) {
      return 'Min и max должны быть числами';
    }
  }
  if (ruleTypeNeedsValue(form.rule_type) && form.not_equal_value === '') {
    return 'Укажите значение для сравнения';
  }
  return null;
}

export function ruleToFormState(rule: Rule): RuleFormState {
  const params = rule.params_json ?? {};

  return {
    dataset_id: String(rule.dataset_id),
    rule_name: rule.rule_name,
    rule_type: rule.rule_type as RuleType,
    column_name: rule.column_name ?? '',
    min_value: params.min != null ? String(params.min) : '',
    max_value: params.max != null ? String(params.max) : '',
    not_equal_value: params.value != null ? String(params.value) : '',
    severity: rule.severity,
    is_active: rule.is_active,
  };
}

function buildParamsJson(form: RuleFormState): Record<string, unknown> | null {
  if (ruleTypeNeedsMinMax(form.rule_type)) {
    return {
      min: Number(form.min_value),
      max: Number(form.max_value),
    };
  }

  if (ruleTypeNeedsValue(form.rule_type)) {
    const raw = form.not_equal_value.trim();
    const numeric = Number(raw);
    return {
      value: Number.isNaN(numeric) ? raw : numeric,
    };
  }

  return null;
}

export function buildRuleCreatePayload(form: RuleFormState): RuleCreate {
  return {
    dataset_id: Number(form.dataset_id),
    rule_name: form.rule_name.trim(),
    rule_type: form.rule_type,
    column_name: form.column_name.trim() || null,
    params_json: buildParamsJson(form),
    severity: form.severity,
    is_active: form.is_active,
  };
}

export function buildRuleUpdatePayload(form: RuleFormState): RuleUpdate {
  return {
    rule_name: form.rule_name.trim(),
    rule_type: form.rule_type,
    column_name: form.column_name.trim() || null,
    params_json: buildParamsJson(form),
    severity: form.severity,
    is_active: form.is_active,
  };
}