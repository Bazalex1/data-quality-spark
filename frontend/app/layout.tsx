// frontend/app/layout.tsx
import type { Metadata } from "next";
import { Inter, Geist } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

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
    <html lang="ru" className={cn("font-sans", geist.variable)}>
      <body className={inter.className}>
        <Providers>
          <div className="min-h-screen bg-background">
            <nav className="border-b bg-card">
              <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
                <div className="flex items-center gap-8">
                  <a href="/" className="font-semibold text-2xl text-foreground">DQ Service</a>
                  <div className="flex gap-6 text-base">
                    <a href="/" className="text-foreground hover:text-primary transition-colors">Dashboard</a>
                    <a href="/runs" className="text-foreground hover:text-primary transition-colors">Запуски</a>
                    <a href="/datasets" className="text-foreground hover:text-primary transition-colors">Датасеты</a>
                    <a href="/rules" className="text-foreground hover:text-primary transition-colors">Правила</a>
                  </div>
                </div>
                <div className="text-sm text-foreground">v0.1</div>
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