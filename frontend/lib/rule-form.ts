import type { Rule, RuleCreate, RuleType, RuleUpdate } from '@/lib/api';

export const RULE_TYPE_OPTIONS: {
  value: RuleType;
  label: string;
  description: string;
  level: 'column' | 'dataset';
}[] = [
  { value: 'not_null', label: 'Not Null', description: 'Колонка не должна содержать NULL', level: 'column' },
  { value: 'unique', label: 'Unique', description: 'Значения колонки должны быть уникальны', level: 'column' },
  { value: 'min_max', label: 'Min / Max', description: 'Значение в заданном диапазоне', level: 'column' },
  { value: 'not_equal', label: 'Not Equal', description: 'Значение не должно равняться заданному', level: 'column' },
  { value: 'not_zero', label: 'Not Zero', description: 'Значение не должно быть нулём', level: 'column' },
  { value: 'regex_match', label: 'Regex Match', description: 'Значение должно соответствовать регулярному выражению', level: 'column' },
  { value: 'accepted_values', label: 'Accepted Values', description: 'Значение должно быть из списка допустимых', level: 'column' },
  { value: 'freshness', label: 'Freshness', description: 'Максимальный timestamp колонки не старше N часов/дней', level: 'column' },
  { value: 'null_percent', label: 'Null Percent', description: 'Процент NULL в колонке не выше порога', level: 'column' },
  { value: 'date_not_future', label: 'Date Not Future', description: 'Дата/время в колонке не в будущем', level: 'column' },
  { value: 'row_count', label: 'Row Count', description: 'Количество строк в датасете в заданных пределах', level: 'dataset' },
  { value: 'schema_match', label: 'Schema Match', description: 'Датасет должен содержать указанные колонки', level: 'dataset' },
  {
    value: 'custom_sql',
    label: 'Custom SQL / Spark',
    description: 'Spark SQL expression: true для «плохих» строк (например end_date < start_date)',
    level: 'dataset',
  },
];

const COLUMN_LEVEL_RULES: RuleType[] = [
  'not_null',
  'unique',
  'min_max',
  'not_equal',
  'not_zero',
  'regex_match',
  'accepted_values',
  'freshness',
  'null_percent',
  'date_not_future',
];

const DATASET_LEVEL_RULES: RuleType[] = ['row_count', 'schema_match', 'custom_sql'];

export interface RuleFormState {
  dataset_id: string;
  rule_name: string;
  rule_type: RuleType;
  column_name: string;
  min_value: string;
  max_value: string;
  not_equal_value: string;
  regex_pattern: string;
  accepted_values: string;
  min_rows: string;
  max_rows: string;
  expected_columns: string;
  max_age_hours: string;
  max_age_days: string;
  max_null_percent: string;
  custom_condition: string;
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
  regex_pattern: '',
  accepted_values: '',
  min_rows: '',
  max_rows: '',
  expected_columns: '',
  max_age_hours: '',
  max_age_days: '',
  max_null_percent: '',
  custom_condition: '',
  severity: 'warning',
  is_active: true,
};

export function isColumnLevelRule(ruleType: RuleType): boolean {
  return COLUMN_LEVEL_RULES.includes(ruleType);
}

export function isDatasetLevelRule(ruleType: RuleType): boolean {
  return DATASET_LEVEL_RULES.includes(ruleType);
}

export function ruleTypeNeedsColumn(ruleType: RuleType): boolean {
  return isColumnLevelRule(ruleType);
}

export function ruleTypeNeedsMinMax(ruleType: RuleType): boolean {
  return ruleType === 'min_max';
}

export function ruleTypeNeedsValue(ruleType: RuleType): boolean {
  return ruleType === 'not_equal' || ruleType === 'not_zero';
}

export function ruleTypeNeedsRegex(ruleType: RuleType): boolean {
  return ruleType === 'regex_match';
}

export function ruleTypeNeedsAcceptedValues(ruleType: RuleType): boolean {
  return ruleType === 'accepted_values';
}

export function ruleTypeNeedsRowCount(ruleType: RuleType): boolean {
  return ruleType === 'row_count';
}

export function ruleTypeNeedsExpectedColumns(ruleType: RuleType): boolean {
  return ruleType === 'schema_match';
}

export function ruleTypeNeedsFreshness(ruleType: RuleType): boolean {
  return ruleType === 'freshness';
}

export function ruleTypeNeedsNullPercent(ruleType: RuleType): boolean {
  return ruleType === 'null_percent';
}

export function ruleTypeNeedsCustomSql(ruleType: RuleType): boolean {
  return ruleType === 'custom_sql';
}

export function parseListInput(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseOptionalInt(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
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

  if (ruleTypeNeedsRegex(form.rule_type) && !form.regex_pattern.trim()) {
    return 'Укажите регулярное выражение (pattern)';
  }

  if (ruleTypeNeedsAcceptedValues(form.rule_type)) {
    const values = parseListInput(form.accepted_values);
    if (values.length === 0) {
      return 'Укажите хотя бы одно допустимое значение';
    }
  }

  if (ruleTypeNeedsRowCount(form.rule_type)) {
    if (form.min_rows === '' && form.max_rows === '') {
      return 'Укажите min_rows и/или max_rows';
    }
    if (form.min_rows !== '' && Number.isNaN(Number(form.min_rows))) {
      return 'min_rows должно быть числом';
    }
    if (form.max_rows !== '' && Number.isNaN(Number(form.max_rows))) {
      return 'max_rows должно быть числом';
    }
  }

  if (ruleTypeNeedsExpectedColumns(form.rule_type)) {
    const columns = parseListInput(form.expected_columns);
    if (columns.length === 0) {
      return 'Укажите хотя бы одну ожидаемую колонку';
    }
  }

  if (ruleTypeNeedsFreshness(form.rule_type)) {
    if (form.max_age_hours === '' && form.max_age_days === '') {
      return 'Укажите max_age_hours и/или max_age_days';
    }
    if (form.max_age_hours !== '' && Number.isNaN(Number(form.max_age_hours))) {
      return 'max_age_hours должно быть числом';
    }
    if (form.max_age_days !== '' && Number.isNaN(Number(form.max_age_days))) {
      return 'max_age_days должно быть числом';
    }
  }

  if (ruleTypeNeedsNullPercent(form.rule_type)) {
    if (form.max_null_percent === '') {
      return 'Укажите max_null_percent (0–100)';
    }
    const value = Number(form.max_null_percent);
    if (Number.isNaN(value) || value < 0 || value > 100) {
      return 'max_null_percent должно быть числом от 0 до 100';
    }
  }

  if (ruleTypeNeedsCustomSql(form.rule_type)) {
    if (!form.custom_condition.trim()) {
      return 'Укажите Spark SQL condition для плохих строк';
    }
    if (form.custom_condition.includes(';')) {
      return 'Символ «;» в condition запрещён';
    }
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
    regex_pattern: typeof params.pattern === 'string' ? params.pattern : '',
    accepted_values: Array.isArray(params.values)
      ? params.values.map(String).join(', ')
      : '',
    min_rows: params.min_rows != null ? String(params.min_rows) : '',
    max_rows: params.max_rows != null ? String(params.max_rows) : '',
    expected_columns: Array.isArray(params.expected_columns)
      ? params.expected_columns.map(String).join(', ')
      : '',
    max_age_hours: params.max_age_hours != null ? String(params.max_age_hours) : '',
    max_age_days: params.max_age_days != null ? String(params.max_age_days) : '',
    max_null_percent:
      params.max_null_percent != null ? String(params.max_null_percent) : '',
    custom_condition:
      typeof params.condition === 'string'
        ? params.condition
        : typeof params.expression === 'string'
          ? params.expression
          : typeof params.sql === 'string'
            ? params.sql
            : '',
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

  if (ruleTypeNeedsRegex(form.rule_type)) {
    return { pattern: form.regex_pattern.trim() };
  }

  if (ruleTypeNeedsAcceptedValues(form.rule_type)) {
    return { values: parseListInput(form.accepted_values) };
  }

  if (ruleTypeNeedsRowCount(form.rule_type)) {
    const params: Record<string, unknown> = {};
    const minRows = parseOptionalInt(form.min_rows);
    const maxRows = parseOptionalInt(form.max_rows);
    if (minRows !== undefined) params.min_rows = minRows;
    if (maxRows !== undefined) params.max_rows = maxRows;
    return params;
  }

  if (ruleTypeNeedsExpectedColumns(form.rule_type)) {
    return { expected_columns: parseListInput(form.expected_columns) };
  }

  if (ruleTypeNeedsFreshness(form.rule_type)) {
    const params: Record<string, unknown> = {};
    const hours = parseOptionalInt(form.max_age_hours);
    const days = parseOptionalInt(form.max_age_days);
    if (hours !== undefined) params.max_age_hours = hours;
    if (days !== undefined) params.max_age_days = days;
    return params;
  }

  if (ruleTypeNeedsNullPercent(form.rule_type)) {
    return { max_null_percent: Number(form.max_null_percent) };
  }

  if (ruleTypeNeedsCustomSql(form.rule_type)) {
    return { condition: form.custom_condition.trim() };
  }

  return null;
}

function buildColumnName(form: RuleFormState): string | null {
  return ruleTypeNeedsColumn(form.rule_type)
    ? form.column_name.trim() || null
    : null;
}

export function buildRuleCreatePayload(form: RuleFormState): RuleCreate {
  return {
    dataset_id: Number(form.dataset_id),
    rule_name: form.rule_name.trim(),
    rule_type: form.rule_type,
    column_name: buildColumnName(form),
    params_json: buildParamsJson(form),
    severity: form.severity,
    is_active: form.is_active,
  };
}

export function buildRuleUpdatePayload(form: RuleFormState): RuleUpdate {
  return {
    rule_name: form.rule_name.trim(),
    rule_type: form.rule_type,
    column_name: buildColumnName(form),
    params_json: buildParamsJson(form),
    severity: form.severity,
    is_active: form.is_active,
  };
}
