'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Sparkles } from 'lucide-react';
import MarkdownAnalysis from '@/components/markdown-analysis';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { analyzeRun, getRunAnalysis, type RunStatus } from '@/lib/api';
import { getErrorMessage } from '@/lib/errors';

interface RunLlmAnalysisProps {
  runId: number;
  status: RunStatus;
  hasResults: boolean;
}

export default function RunLlmAnalysis({
  runId,
  status,
  hasResults,
}: RunLlmAnalysisProps) {
  const queryClient = useQueryClient();
  const isTerminal = status === 'success' || status === 'failed';

  const {
    data: analysisData,
    isLoading: isLoadingAnalysis,
    error: loadError,
  } = useQuery({
    queryKey: ['run-analysis', runId],
    queryFn: () => getRunAnalysis(runId),
    enabled: isTerminal && hasResults,
  });

  const analyzeMutation = useMutation({
    mutationFn: () => analyzeRun(runId),
    onSuccess: (data) => {
      queryClient.setQueryData(['run-analysis', runId], data);
    },
  });

  if (!isTerminal || !hasResults) {
    return null;
  }

  const analysis = analysisData?.analysis ?? analyzeMutation.data?.analysis ?? null;
  const isCached = analysisData?.cached ?? analyzeMutation.data?.cached ?? false;
  const isGenerating = analyzeMutation.isPending;
  const errorMessage = analyzeMutation.error
    ? getErrorMessage(analyzeMutation.error)
    : loadError
      ? getErrorMessage(loadError)
      : null;

  return (
    <Card className="overflow-hidden border-violet-200/80 bg-gradient-to-br from-violet-50/80 via-background to-background dark:border-violet-900/50 dark:from-violet-950/20">
      <CardHeader className="border-b border-violet-100/80 dark:border-violet-900/40">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                <Sparkles className="h-4 w-4" />
              </span>
              AI-анализ результатов
            </CardTitle>
            <CardDescription>
              Понятный отчёт на русском языке на основе результатов проверок
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {analysis && isCached && (
              <Badge variant="secondary" className="bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200">
                Сохранён
              </Badge>
            )}
            {!analysis && (
              <Button
                onClick={() => analyzeMutation.mutate()}
                disabled={isGenerating || isLoadingAnalysis}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Генерация...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Сгенерировать анализ с помощью ИИ
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-6">
        {isLoadingAnalysis && !analysis ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Загрузка анализа...
          </div>
        ) : null}

        {errorMessage ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}

        {!analysis && !isGenerating && !isLoadingAnalysis && !errorMessage ? (
          <p className="text-sm text-muted-foreground">
            Анализ ещё не создан. Нажмите кнопку выше, чтобы получить рекомендации от локальной модели Ollama.
          </p>
        ) : null}

        {isGenerating && !analysis ? (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-violet-200 bg-violet-50/50 px-4 py-6 text-sm text-violet-900 dark:border-violet-900 dark:bg-violet-950/20 dark:text-violet-100">
            <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
            <div>
              <p className="font-medium">Модель анализирует результаты...</p>
              <p className="mt-1 text-violet-800/80 dark:text-violet-200/80">
                Это может занять до 1–2 минут в зависимости от модели Ollama.
              </p>
            </div>
          </div>
        ) : null}

        {analysis ? <MarkdownAnalysis content={analysis} /> : null}
      </CardContent>
    </Card>
  );
}