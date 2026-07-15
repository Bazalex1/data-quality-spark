import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { RunStatus, RunSummary } from '@/lib/api';
import { getRunOutcome, type RunOutcome } from '@/lib/dashboard-stats';

const outcomeConfig: Record<
  RunOutcome,
  { label: string; className: string }
> = {
  pending: {
    label: 'Ожидание',
    className: 'bg-secondary text-foreground',
  },
  running: {
    label: 'Выполняется',
    className: 'bg-blue-100 text-blue-700',
  },
  success: {
    label: 'Успешно',
    className: 'bg-green-100 text-green-700',
  },
  with_errors: {
    label: 'С ошибками',
    className: 'bg-amber-100 text-amber-800',
  },
  failed: {
    label: 'Неудачный',
    className: 'bg-destructive/10 text-destructive',
  },
};

interface StatusBadgeProps {
  status: RunStatus;
  /** summary_json — нужен, чтобы отличить «успешно» от «с ошибками» */
  summary?: RunSummary | null;
}

export default function StatusBadge({ status, summary }: StatusBadgeProps) {
  const outcome = getRunOutcome(status, summary);
  const config = outcomeConfig[outcome];

  return (
    <Badge className={cn('h-6 px-2.5', config.className)}>
      {config.label}
    </Badge>
  );
}
