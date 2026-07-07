// frontend/lib/api.ts
import axios from 'axios';

const API_BASE = 'http://localhost:8000/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Типы (позже можно вынести в отдельный файл types.ts)
export interface Run {
  id: number;
  dataset_id: number;
  status: 'pending' | 'running' | 'success' | 'failed';
  started_at: string;
  finished_at: string | null;
  summary_json: any;
}

export interface RunDetail extends Run {
  results: any[];
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
  const res = await api.post(`/runs/${runId}/execute`);
  return res.data;
};

export default api;