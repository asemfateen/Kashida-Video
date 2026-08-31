// Small reusable form controls used across the inspector & panels.
import { useState, type ReactNode } from 'react'
import { Pipette } from 'lucide-react'

export function Section({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="mb-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5 shadow-2xs transition-all">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-[13px] font-bold text-slate-800 hover:text-slate-900"
      >
        <span>{title}</span>
        <span className="text-slate-400 transition-transform text-xs" style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▾</span>
      </button>
      {open && <div className="mt-2.5 space-y-3 pt-2.5 border-t border-slate-200/60">{children}</div>}
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
    </label>
  )
}

export function TextInput({ value, onChange, placeholder, disabled }: { value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
  return (
    <input
      type="text"
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-2xl border border-slate-200/90 bg-white px-3.5 py-2 text-[13px] text-slate-900 placeholder:text-slate-400 transition-all focus:border-[#1E56A0] focus:ring-4 focus:ring-[#1E56A0]/10 focus:outline-none"
    />
  )
}

export function NumberInput({ value, onChange, min, max, step = 1, disabled, unit }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; disabled?: boolean; unit?: string }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full rounded-2xl border border-slate-200/90 bg-white px-3.5 py-2 text-[13px] text-slate-900 transition-all focus:border-[#1E56A0] focus:ring-4 focus:ring-[#1E56A0]/10 focus:outline-none"
      />
      {unit && <span className="text-[12px] font-medium text-slate-500">{unit}</span>}
    </div>
  )
}

export function Slider({ label, value, onChange, min, max, step = 1, unit, disabled }: { label?: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; unit?: string; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      {label && <span className="min-w-[64px] text-[12px] font-medium text-slate-600">{label}</span>}
      <input
        type="range"
        value={value}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
      />
      <span className="w-10 shrink-0 text-right text-[11px] tabular-nums font-semibold text-slate-600">
        {typeof value === 'number' ? Math.round(value * 10) / 10 : value}{unit}
      </span>
    </div>
  )
}

export function ColorInput({ label, value, onChange }: { label?: string; value: string; onChange: (v: string) => void }) {
  const hasEyeDropper = typeof window !== 'undefined' && 'EyeDropper' in window

  const pickColor = async () => {
    try {
      const eyeDropper = new (window as any).EyeDropper()
      const result = await eyeDropper.open()
      if (result?.sRGBHex) {
        onChange(result.sRGBHex)
      }
    } catch {
      // User cancelled
    }
  }

  return (
    <div className="flex items-center gap-2">
      {label && <span className="min-w-[64px] text-[12px] font-medium text-slate-600">{label}</span>}
      <div className="flex items-center gap-2 overflow-hidden rounded-2xl border border-slate-200 bg-white px-2.5 py-1 shadow-xs">
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="h-5 w-7 cursor-pointer"
          aria-label={label || 'color'}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-20 font-mono text-[12px] font-semibold text-slate-800 outline-none"
        />
        {hasEyeDropper && (
          <button
            type="button"
            onClick={pickColor}
            title="Pick color from canvas or screen"
            className="flex h-5 w-5 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
          >
            <Pipette size={12} />
          </button>
        )}
      </div>
    </div>
  )
}

export function Select({ label, value, onChange, options }: { label?: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="flex items-center gap-2">
      {label && <span className="min-w-[64px] text-[12px] font-medium text-slate-600">{label}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 transition-all focus:border-[#1E56A0] focus:ring-4 focus:ring-[#1E56A0]/10 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex gap-1 rounded-full bg-slate-100/90 p-1 border border-slate-200/60">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-full px-3 py-1 text-[12px] font-semibold transition-all ${
            value === o.value ? 'bg-[#1E56A0] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Button({ children, onClick, variant = 'ghost', disabled, title, className = '' }: { children: ReactNode; onClick?: () => void; variant?: 'primary' | 'midnight' | 'ghost' | 'danger' | 'outline'; disabled?: boolean; title?: string; className?: string }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-[13px] font-semibold transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer'
  const variants: Record<string, string> = {
    primary: 'bg-[#1E56A0] text-white shadow-xs hover:bg-[#16437E] active:bg-[#123666]',
    midnight: 'bg-[#0B1528] text-white shadow-xs hover:bg-[#162338]',
    ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
    outline: 'border border-slate-200 bg-white text-slate-700 shadow-xs hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900',
    danger: 'bg-red-600 text-white shadow-xs hover:bg-red-700',
  }
  return (
    <button type="button" title={title} disabled={disabled} onClick={onClick} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  )
}
