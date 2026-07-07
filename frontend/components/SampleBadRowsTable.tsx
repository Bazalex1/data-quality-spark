import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface SampleBadRowsTableProps {
  rows: Record<string, unknown>[];
}

export default function SampleBadRowsTable({ rows }: SampleBadRowsTableProps) {
  if (rows.length === 0) return null;

  const columns = Array.from(
    new Set(rows.flatMap((row) => Object.keys(row)))
  );

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  return (
    <div className="rounded-lg border bg-muted/30">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col}>{col}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, idx) => (
            <TableRow key={idx}>
              {columns.map((col) => (
                <TableCell key={col} className="font-mono text-xs">
                  {formatValue(row[col])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}