// Toast notification system with animated status feedback for saves and render events.

import { CheckCircle2, AlertTriangle, Info, Loader2, X } from 'lucide-react'
import { useEffect, useState } from 'react'

export type ToastType = 'success' | 'error' | 'info' | 'loading'

export interface ToastMessage {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number // ms (0 = persistent until manually dismissed or replaced)
}

interface Props {
  toasts: ToastMessage[]
  onDismiss: (id: string) => void
}

const TYPE_CONFIG = {
  success: {
    icon: CheckCircle2,
    iconColor: 'text-emerald-500',
    bgColor: 'bg-white/95 border-emerald-200/80 shadow-[0_10px_30px_rgba(16,185,129,0.12)]',
    badge: 'bg-emerald-50 text-emerald-700',
  },
  error: {
    icon: AlertTriangle,
    iconColor: 'text-red-500',
    bgColor: 'bg-white/95 border-red-200/80 shadow-[0_10px_30px_rgba(239,68,68,0.12)]',
    badge: 'bg-red-50 text-red-700',
  },
  info: {
    icon: Info,
    iconColor: 'text-[#1E56A0]',
    bgColor: 'bg-white/95 border-blue-200/80 shadow-[0_10px_30px_rgba(30,86,160,0.12)]',
    badge: 'bg-blue-50 text-[#1E56A0]',
  },
  loading: {
    icon: Loader2,
    iconColor: 'text-[#1E56A0] animate-spin',
    bgColor: 'bg-white/95 border-slate-200/80 shadow-[0_10px_30px_rgba(15,23,42,0.08)]',
    badge: 'bg-slate-100 text-slate-700',
  },
}

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(false)
  const cfg = TYPE_CONFIG[toast.type] || TYPE_CONFIG.info
  const Icon = cfg.icon

  useEffect(() => {
    // Trigger smooth slide-in
    const r = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(r)
  }, [])

  useEffect(() => {
    if (toast.duration === 0 || toast.type === 'loading') return
    const timeout = toast.duration ?? 3500
    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(() => onDismiss(toast.id), 200)
    }, timeout)
    return () => clearTimeout(timer)
  }, [toast, onDismiss])

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-auto flex items-start gap-3 rounded-2xl border p-3.5 backdrop-blur-md transition-all duration-200 ease-out ${
        cfg.bgColor
      } ${
        visible ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-2 opacity-0 scale-95'
      }`}
      style={{ minWidth: '280px', maxWidth: '380px' }}
    >
      <div className="mt-0.5 shrink-0">
        <Icon size={18} className={cfg.iconColor} aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold text-slate-900 leading-tight">{toast.title}</div>
        {toast.message && (
          <div className="mt-1 text-[12px] font-medium text-slate-600 leading-snug">{toast.message}</div>
        )}
      </div>
      <button
        type="button"
        onClick={() => {
          setVisible(false)
          setTimeout(() => onDismiss(toast.id), 150)
        }}
        aria-label="Dismiss notification"
        className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  )
}

export function ToastContainer({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  )
}
