import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { RunStatus } from '@/lib/api';

const statusConfig: Record<
  RunStatus,
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
  failed: {
    label: 'Ошибка',
    className: 'bg-destructive/10 text-destructive',
  },
};

interface StatusBadgeProps {
  status: RunStatus;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <Badge className={cn('h-6 px-2.5', config.className)}>
      {config.label}
    </Badge>
  );
}