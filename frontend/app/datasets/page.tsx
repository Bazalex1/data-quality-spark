'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ToastBanner, type ToastState } from '@/components/toast-banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { FormSelect } from '@/components/ui/form-select';
import { Input } from '@/components/ui/input';
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
  buildDatasetSourceConfig,
  createDataset,
  deleteDataset,
  getDatasets,
  parseDatasetFormat,
  parseDatasetPath,
  updateDataset,
  uploadDatasetFile,
  type Dataset,
  type DatasetCreate,
} from '@/lib/api';

const SOURCE_TYPE_OPTIONS = [
  { value: 'csv', label: 'CSV / file' },
  { value: 'path', label: 'Path' },
  { value: 'spark_df', label: 'Spark DF (parquet/json/orc/csv)' },
];

const SPARK_FORMAT_OPTIONS = [
  { value: 'parquet', label: 'parquet (default for spark_df)' },
  { value: 'csv', label: 'csv' },
  { value: 'json', label: 'json' },
  { value: 'orc', label: 'orc' },
];

type InputMode = 'path' | 'upload';

interface DatasetFormState {
  name: string;
  source_type: string;
  file_path: string;
  data_format: string;
  input_mode: InputMode;
  file: File | null;
}

const initialFormState: DatasetFormState = {
  name: '',
  source_type: 'csv',
  file_path: '/data/test.csv',
  data_format: 'csv',
  input_mode: 'upload',
  file: null,
};

function defaultFormatForSourceType(sourceType: string): string {
  if (sourceType === 'spark_df') return 'parquet';
  return 'csv';
}

function datasetToForm(dataset: Dataset): DatasetFormState {
  const parsedFormat = parseDatasetFormat(dataset.source_config_json);
  return {
    name: dataset.name,
    source_type: dataset.source_type,
    file_path: parseDatasetPath(dataset.source_config_json) ?? '',
    data_format: parsedFormat || defaultFormatForSourceType(dataset.source_type),
    input_mode: 'path',
    file: null,
  };
}

export default function DatasetsPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDataset, setEditingDataset] = useState<Dataset | null>(null);
  const [form, setForm] = useState<DatasetFormState>(initialFormState);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const { data: datasets, isLoading, error } = useQuery({
    queryKey: ['datasets'],
    queryFn: () => getDatasets(),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['datasets'] });
  };

  const createMutation = useMutation({
    mutationFn: (payload: DatasetCreate) => createDataset(payload),
    onSuccess: () => {
      invalidate();
      closeDialog();
      setToast({ type: 'success', message: 'Датасет успешно создан' });
    },
    onError: (err) => setFormError(getErrorMessage(err)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: DatasetCreate }) =>
      updateDataset(id, data),
    onSuccess: () => {
      invalidate();
      closeDialog();
      setToast({ type: 'success', message: 'Датасет обновлён' });
    },
    onError: (err) => setFormError(getErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteDataset(id),
    onSuccess: () => {
      invalidate();
      setToast({ type: 'success', message: 'Датасет удалён' });
    },
    onError: (err) =>
      setToast({ type: 'error', message: getErrorMessage(err) }),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadDatasetFile(file),
  });

  const openCreateDialog = () => {
    setEditingDataset(null);
    setForm(initialFormState);
    setFormError(null);
    setDialogOpen(true);
  };

  const openEditDialog = (dataset: Dataset) => {
    setEditingDataset(dataset);
    setForm(datasetToForm(dataset));
    setFormError(null);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingDataset(null);
    setFormError(null);
  };

  const resolveFilePath = async (): Promise<string | null> => {
    if (form.input_mode === 'path' || form.source_type === 'spark_df') {
      return form.file_path.trim() || null;
    }

    if (!form.file) {
      if (editingDataset && form.file_path.trim()) {
        return form.file_path.trim();
      }
      return null;
    }

    const uploaded = await uploadMutation.mutateAsync(form.file);
    return uploaded.path;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (form.name.trim().length < 3) {
      setFormError('Название — минимум 3 символа');
      return;
    }

    try {
      const filePath = await resolveFilePath();
      if (!filePath) {
        setFormError(
          form.input_mode === 'upload' && form.source_type !== 'spark_df'
            ? 'Выберите CSV-файл для загрузки'
            : 'Укажите путь к файлу / директории Spark'
        );
        return;
      }

      const format =
        form.source_type === 'spark_df'
          ? form.data_format || 'parquet'
          : form.data_format || 'csv';

      const payload: DatasetCreate = {
        name: form.name.trim(),
        source_type: form.source_type,
        source_config_json: buildDatasetSourceConfig(filePath, format),
      };

      if (editingDataset) {
        updateMutation.mutate({ id: editingDataset.id, data: payload });
      } else {
        createMutation.mutate(payload);
      }
    } catch (err) {
      setFormError(getErrorMessage(err));
    }
  };

  const handleDelete = (dataset: Dataset) => {
    const confirmed = window.confirm(
      `Удалить датасет «${dataset.name}»? Связанные правила и запуски могут перестать работать.`
    );
    if (confirmed) {
      deleteMutation.mutate(dataset.id);
    }
  };

  const isSaving =
    createMutation.isPending ||
    updateMutation.isPending ||
    uploadMutation.isPending;

  if (isLoading) {
    return <div className="text-foreground">Загрузка датасетов...</div>;
  }

  if (error) {
    return <div className="text-destructive">Ошибка загрузки датасетов</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Датасеты</h1>
          <p className="text-base text-foreground mt-1">
            Управление источниками данных для проверок
          </p>
        </div>
        <Button onClick={openCreateDialog}>+ Добавить датасет</Button>
      </div>

      <Card className="py-0">
        {!datasets?.length ? (
          <div className="px-6 py-12 text-center text-foreground">
            Датасетов пока нет. Добавьте первый датасет.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Название</TableHead>
                <TableHead>Тип источника</TableHead>
                <TableHead>Путь</TableHead>
                <TableHead>Создан</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {datasets.map((dataset) => (
                <TableRow key={dataset.id}>
                  <TableCell className="font-mono">#{dataset.id}</TableCell>
                  <TableCell className="font-medium">{dataset.name}</TableCell>
                  <TableCell>{dataset.source_type}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {parseDatasetPath(dataset.source_config_json) ?? '—'}
                  </TableCell>
                  <TableCell>
                    {new Date(dataset.created_at).toLocaleString('ru-RU')}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(dataset)}
                      >
                        Изменить
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(dataset)}
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
        title={editingDataset ? 'Редактировать датасет' : 'Добавить датасет'}
        description="Укажите название и источник данных (путь или загрузка CSV)"
      >
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="dataset-name">Название</Label>
            <Input
              id="dataset-name"
              value={form.name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="Например: Тестовый датасет"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label>Тип источника</Label>
            <FormSelect
              value={form.source_type}
              onValueChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  source_type: value,
                  data_format: defaultFormatForSourceType(value),
                  input_mode: value === 'spark_df' ? 'path' : prev.input_mode,
                }))
              }
              options={SOURCE_TYPE_OPTIONS}
            />
            <p className="text-xs text-foreground">
              <code>spark_df</code> — данные, которые Spark-пайплайн записал на диск
              (обычно parquet). Сервис читает их через PySpark.
            </p>
          </div>

          {(form.source_type === 'spark_df' || form.input_mode === 'path') && (
            <div className="space-y-1.5">
              <Label>Формат данных</Label>
              <FormSelect
                value={form.data_format}
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, data_format: value }))
                }
                options={SPARK_FORMAT_OPTIONS}
              />
            </div>
          )}

          {form.source_type !== 'spark_df' && (
            <div className="space-y-2">
              <Label>Способ указания файла</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={form.input_mode === 'upload' ? 'default' : 'outline'}
                  onClick={() =>
                    setForm((prev) => ({ ...prev, input_mode: 'upload' }))
                  }
                >
                  Загрузить файл
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={form.input_mode === 'path' ? 'default' : 'outline'}
                  onClick={() =>
                    setForm((prev) => ({ ...prev, input_mode: 'path' }))
                  }
                >
                  Указать путь
                </Button>
              </div>
            </div>
          )}

          {form.source_type !== 'spark_df' && form.input_mode === 'upload' ? (
            <div className="space-y-1.5">
              <Label htmlFor="dataset-file">CSV-файл</Label>
              <Input
                id="dataset-file"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    file: e.target.files?.[0] ?? null,
                  }))
                }
              />
              {form.file && (
                <p className="text-xs text-foreground">
                  Выбран: {form.file.name} ({Math.round(form.file.size / 1024)} KB)
                </p>
              )}
              {editingDataset && form.file_path && !form.file && (
                <p className="text-xs text-foreground">
                  Текущий путь: <code className="font-mono">{form.file_path}</code>
                  . Оставьте файл пустым, чтобы сохранить текущий.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="dataset-path">
                {form.source_type === 'spark_df'
                  ? 'Путь к данным Spark (файл или директория)'
                  : 'Путь к файлу'}
              </Label>
              <Input
                id="dataset-path"
                value={form.file_path}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, file_path: e.target.value }))
                }
                placeholder={
                  form.source_type === 'spark_df'
                    ? '/data/silver/orders_parquet'
                    : '/data/test.csv'
                }
              />
              <p className="text-xs text-foreground">
                Для Docker: <code className="font-mono">/data/...</code> (volume
                из docker-compose)
              </p>
            </div>
          )}

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={closeDialog}>
              Отмена
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving
                ? 'Сохранение...'
                : editingDataset
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