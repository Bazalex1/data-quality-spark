'use client';

import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type {
  ChartSlice,
  ColumnErrorChartItem,
} from '@/lib/dashboard-stats';

interface RunStatusChartProps {
  data: ChartSlice[];
}

export function RunStatusChart({ data }: RunStatusChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Статусы запусков</CardTitle>
        <CardDescription>Распределение запусков по статусам</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-16 text-center text-foreground">
            Нет данных для графика
          </p>
        ) : (
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={95}
                  paddingAngle={2}
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {data.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface ColumnErrorsChartProps {
  data: ColumnErrorChartItem[];
  latestRunId: number | null;
}

export function ColumnErrorsChart({ data, latestRunId }: ColumnErrorsChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ошибки по колонкам</CardTitle>
        <CardDescription>
          {latestRunId
            ? `Последний запуск #${latestRunId}`
            : 'Нет данных о последнем запуске'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-16 text-center text-foreground">
            Ошибок по колонкам нет
          </p>
        ) : (
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ left: 8, right: 8, bottom: 8 }}>
                <XAxis
                  dataKey="column"
                  tick={{ fontSize: 12 }}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={60}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="errors" name="Ошибок" fill="#dc2626" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}