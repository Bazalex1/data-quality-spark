// frontend/lib/api.ts
import axios from 'axios';

const API_BASE = 'http://localhost:8000/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

export type RunStatus = 'pending' | 'running' | 'success' | 'failed';

export interface RunSummary {
  total_rules?: number;
  passed?: number;
  failed?: number;
}

export interface ResultDetails {
  null_count?: number;
  duplicate_count?: number;
  out_of_range?: number;
  failed_count?: number;
  expected_not_equal?: unknown;
  sample_bad_rows?: Record<string, unknown>[];
  message?: string;
}

export interface RunResult {
  id: number;
  run_id: number;
  rule_id: number;
  passed: boolean;
  failed_count: number;
  details_json: ResultDetails | null;
  created_at: string;
}

export interface Run {
  id: number;
  dataset_id: number;
  status: RunStatus;
  started_at: string;
  finished_at: string | null;
  summary_json: RunSummary | null;
}

export interface RunDetail extends Run {
  results: RunResult[];
}

export interface Dataset {
  id: number;
  name: string;
  source_type: string;
  source_config_json: string | null;
  created_at: string;
}

export interface DatasetCreate {
  name: string;
  source_type: string;
  source_config_json?: string | null;
}

export interface DatasetUpdate {
  name?: string;
  source_type?: string;
  source_config_json?: string | null;
}

export interface DatasetUploadResponse {
  path: string;
  filename: string;
  original_filename: string;
}

export type RuleType =
  | 'not_null'
  | 'unique'
  | 'min_max'
  | 'not_equal'
  | 'not_zero'
  | 'regex_match'
  | 'accepted_values'
  | 'row_count'
  | 'schema_match';

export interface RuleCreate {
  dataset_id: number;
  rule_name: string;
  rule_type: RuleType;
  column_name?: string | null;
  params_json?: Record<string, unknown> | null;
  severity: 'warning' | 'critical';
  is_active: boolean;
}

export interface RuleUpdate {
  rule_name?: string;
  rule_type?: RuleType;
  column_name?: string | null;
  params_json?: Record<string, unknown> | null;
  severity?: 'warning' | 'critical';
  is_active?: boolean;
}

export interface Rule {
  id: number;
  dataset_id: number;
  rule_name: string;
  rule_type: string;
  column_name: string | null;
  params_json: Record<string, unknown> | null;
  severity: 'warning' | 'critical';
  is_active: boolean;
  created_at: string;
}

// === API функции ===

export const getRuns = async (datasetId?: number) => {
  const params = datasetId ? { dataset_id: datasetId } : {};
  const res = await api.get<Run[]>('/runs/', { params });
  return res.data;
};

export const getRun = async (runId: number) => {
  const res = await api.get<RunDetail>(`/runs/${runId}`);
  return res.data;
};

export const createRun = async (datasetId: number) => {
  const res = await api.post<Run>('/runs/', { dataset_id: datasetId });
  return res.data;
};

export const executeRun = async (runId: number) => {
  const res = await api.post<{ message: string }>(`/runs/${runId}/execute`);
  return res.data;
};

export interface RunAnalysis {
  run_id: number;
  analysis: string | null;
  cached: boolean;
}

export const getRunAnalysis = async (runId: number) => {
  const res = await api.get<RunAnalysis>(`/runs/${runId}/analysis`);
  return res.data;
};

export const analyzeRun = async (runId: number) => {
  const res = await api.post<RunAnalysis>(`/runs/${runId}/analyze`);
  return res.data;
};

export const getDatasets = async () => {
  const res = await api.get<Dataset[]>('/datasets/');
  return res.data;
};

export const getDatasetColumns = async (datasetId: number) => {
  const res = await api.get<{ columns: string[] }>(
    `/datasets/${datasetId}/columns`
  );
  return res.data;
};

export const createDataset = async (data: DatasetCreate) => {
  const res = await api.post<Dataset>('/datasets/', data);
  return res.data;
};

export const updateDataset = async (id: number, data: DatasetUpdate) => {
  const res = await api.put<Dataset>(`/datasets/${id}`, data);
  return res.data;
};

export const deleteDataset = async (id: number) => {
  await api.delete(`/datasets/${id}`);
};

export const uploadDatasetFile = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const res = await api.post<DatasetUploadResponse>('/datasets/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
};

export const getRules = async (datasetId?: number) => {
  const params = datasetId ? { dataset_id: datasetId } : {};
  const res = await api.get<Rule[]>('/rules/', { params });
  return res.data;
};

export const createRule = async (data: RuleCreate) => {
  const res = await api.post<Rule>('/rules/', data);
  return res.data;
};

export const updateRule = async (id: number, data: RuleUpdate) => {
  const res = await api.put<Rule>(`/rules/${id}`, data);
  return res.data;
};

export const deleteRule = async (id: number) => {
  await api.delete(`/rules/${id}`);
};

export function parseDatasetPath(sourceConfig: string | null): string | null {
  if (!sourceConfig) return null;
  try {
    const parsed = JSON.parse(sourceConfig) as { path?: string };
    return parsed.path ?? null;
  } catch {
    return sourceConfig;
  }
}

export function buildDatasetSourceConfig(path: string): string {
  return JSON.stringify({ path: path.trim() });
}

export default api;