'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface ToastState {
  message: string;
  type: 'success' | 'error';
}

interface ToastBannerProps {
  toast: ToastState | null;
  onClose: () => void;
}

export function ToastBanner({ toast, onClose }: ToastBannerProps) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;

  return (
    <div
      className={cn(
        'fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg',
        toast.type === 'success'
          ? 'bg-green-50 border-green-200 text-green-900'
          : 'bg-destructive/10 border-destructive/30 text-destructive'
      )}
    >
      <span className="text-sm font-medium">{toast.message}</span>
      <Button type="button" variant="ghost" size="icon-xs" onClick={onClose}>
        <X />
      </Button>
    </div>
  );
}