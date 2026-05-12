import { useEffect } from 'react';
import type { ToastMessage } from '../types';

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

const COLORS: Record<ToastMessage['type'], string> = {
  error:   'bg-red-500',
  warning: 'bg-amber-500',
  success: 'bg-green-500',
  info:    'bg-blue-500',
};

const ICONS: Record<ToastMessage['type'], string> = {
  error:   '✕',
  warning: '⚠',
  success: '✓',
  info:    'ℹ',
};

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 5000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div
      className={`flex items-start gap-2 px-4 py-3 rounded-lg text-white text-sm shadow-lg max-w-sm ${COLORS[toast.type]}`}
      role="alert"
    >
      <span className="font-bold shrink-0 mt-0.5">{ICONS[toast.type]}</span>
      <span className="flex-1 leading-snug">{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 ml-1 opacity-80 hover:opacity-100 font-bold"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

export default function Toast({ toasts, onDismiss }: ToastProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
