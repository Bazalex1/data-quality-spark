// frontend/app/runs/page.tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { getRuns } from '@/lib/api';
import Link from 'next/link';

export default function RunsPage() {
  const { data: runs, isLoading, error } = useQuery({
    queryKey: ['runs'],
    queryFn: () => getRuns(),
  });

  if (isLoading) return <div>Загрузка запусков...</div>;
  if (error) return <div className="text-red-500">Ошибка загрузки данных</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">Запуски проверок</h1>
        <button 
          onClick={() => alert('Пока не реализовано')}
          className="px-4 py-2 bg-black text-white rounded-lg text-sm hover:bg-gray-800"
        >
          + Новый запуск
        </button>
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">ID</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Dataset ID</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Статус</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Начало</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-gray-500"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {runs?.map((run) => (
              <tr key={run.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 font-mono text-sm">#{run.id}</td>
                <td className="px-6 py-4">{run.dataset_id}</td>
                <td className="px-6 py-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    run.status === 'success' ? 'bg-green-100 text-green-700' :
                    run.status === 'failed' ? 'bg-red-100 text-red-700' :
                    run.status === 'running' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {run.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {new Date(run.started_at).toLocaleString('ru-RU')}
                </td>
                <td className="px-6 py-4 text-right">
                  <Link 
                    href={`/runs/${run.id}`}
                    className="text-blue-600 hover:underline text-sm"
                  >
                    Подробнее →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}