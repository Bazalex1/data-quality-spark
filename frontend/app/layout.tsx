// frontend/app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Data Quality Service",
  description: "Сервис проверки качества данных для Spark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body className={inter.className}>
        <Providers>
          <div className="min-h-screen bg-gray-50">
            <nav className="border-b bg-white">
              <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-8">
                  <div className="font-semibold text-xl">DQ Service</div>
                  <div className="flex gap-6 text-sm">
                    <a href="/runs" className="hover:text-blue-600 transition-colors">Запуски</a>
                    <a href="/datasets" className="hover:text-blue-600 transition-colors">Датасеты</a>
                    <a href="/rules" className="hover:text-blue-600 transition-colors">Правила</a>
                  </div>
                </div>
                <div className="text-sm text-gray-500">v0.1</div>
              </div>
            </nav>

            <main className="max-w-7xl mx-auto px-6 py-8">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}