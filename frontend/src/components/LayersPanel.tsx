// Layers panel — Canva/Figma-style layer list (select, visibility, lock,
// reorder, add, delete). Rows are shown bottom-to-top (background first).

import {
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  Trash2,
  Type,
  Hash,
  Quote,
  PenLine,
  Square,
  Image,
  Clock3,
  PanelBottom,
  PanelLeftClose,
  Layers as LayersIcon,
  Plus,
  GripVertical,
  Copy,
  Shapes,
} from 'lucide-react'
import { useState } from 'react'
import type { Layer, LayerType, TemplateModel } from '../lib/model'
import { LAYER_TYPE_LABELS, calculateDropIndex } from '../lib/model'

const TYPE_ICON: Record<LayerType, typeof Type> = {
  headline: Type,
  subheadline: Quote,
  label: Hash,
  logo: PenLine,
  accentBar: Square,
  card: Square,
  shape: Shapes,
  background: Image,
  footer: PanelBottom,
  timestamp: Clock3,
}

const ADDABLE: LayerType[] = ['headline', 'subheadline', 'label', 'shape', 'card', 'accentBar', 'logo', 'timestamp', 'footer']

interface Props {
  model: TemplateModel
  selectedId: string | null
  collapsed: boolean
  onToggleCollapsed: () => void
  onSelect: (id: string) => void
  onToggleVisible: (id: string) => void
  onToggleLock: (id: string) => void
  onReorder?: (id: string, dir: -1 | 1) => void
  onReorderToIndex?: (fromId: string, toIndex: number) => void
  onDuplicate?: (id: string) => void
  onDelete: (id: string) => void
  onAdd: (type: LayerType) => void
  onRename: (id: string, name: string) => void
}

export function LayersPanel({
  model,
  selectedId,
  collapsed,
  onToggleCollapsed,
  onSelect,
  onToggleVisible,
  onToggleLock,
  onReorderToIndex,
  onDuplicate,
  onDelete,
  onAdd,
  onRename,
}: Props) {
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropIndicator, setDropIndicator] = useState<{ index: number; position: 'above' | 'below' } | null>(null)

  // Show in z-order: first array item is the background / bottom.
  const rows = [...model.layers]

  // Collapsed = icon-only strip.
  if (collapsed) {
    return (
      <div className="flex h-full flex-col items-center gap-1.5 py-3">
        <button
          type="button"
          aria-label="Expand layers panel"
          title="Expand layers panel"
          onClick={onToggleCollapsed}
          className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        >
          <PanelLeftClose size={16} aria-hidden />
        </button>
        {rows.map((l) => {
          const Icon = TYPE_ICON[l.type] ?? Type
          const active = selectedId === l.id
          return (
            <div key={l.id} className="flex flex-col items-center gap-1" title={l.name}>
              <button
                type="button"
                aria-label={`Select ${l.name}`}
                onClick={() => onSelect(l.id)}
                className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all ${
                  active
                    ? 'bg-[#1E56A0] text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon size={15} aria-hidden />
              </button>
            </div>
          )
        })}
      </div>
    )
  }

  const handleDragOver = (e: React.DragEvent, index: number, layer: Layer) => {
    if (!draggedId || draggedId === layer.id) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    const midY = rect.top + rect.height / 2
    const position = e.clientY < midY ? 'above' : 'below'
    if (layer.type === 'background' && position === 'above') return
    setDropIndicator({ index, position })
  }

  const handleDrop = (e: React.DragEvent, targetIndex: number, targetLayer: Layer) => {
    e.preventDefault()
    if (!draggedId || draggedId === targetLayer.id) {
      setDraggedId(null)
      setDropIndicator(null)
      return
    }

    const fromIndex = rows.findIndex((l) => l.id === draggedId)
    if (fromIndex >= 0 && onReorderToIndex) {
      const position = dropIndicator?.position ?? 'below'
      const hasBg = rows.length > 0 && rows[0].type === 'background'
      const finalIndex = calculateDropIndex(fromIndex, targetIndex, position, rows.length, hasBg)
      onReorderToIndex(draggedId, finalIndex)
    }
    setDraggedId(null)
    setDropIndicator(null)
  }

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <LayersIcon size={15} className="text-[#1E56A0]" aria-hidden />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Layers</span>
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">{rows.length}</span>
        </div>
        <span className="text-[10px] font-medium text-slate-400">Drag to reorder</span>
      </div>

      {/* Layers List */}
      <div
        className="thin-scroll flex-1 overflow-y-auto p-2 space-y-1"
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDropIndicator(null)
          }
        }}
      >
        {rows.map((l, i) => {
          const Icon = TYPE_ICON[l.type] ?? Type
          const active = selectedId === l.id
          const isDragging = draggedId === l.id
          const showAboveLine = dropIndicator?.index === i && dropIndicator.position === 'above' && !isDragging
          const showBelowLine = dropIndicator?.index === i && dropIndicator.position === 'below' && !isDragging

          return (
            <div key={l.id} className="relative">
              {/* Drop Insertion Indicator (Above) */}
              {showAboveLine && (
                <div className="absolute -top-1 left-0 right-0 z-30 flex items-center gap-1">
                  <div className="h-2 w-2 rounded-full bg-[#1E56A0]" />
                  <div className="h-0.5 flex-1 rounded-full bg-[#1E56A0]" />
                </div>
              )}

              <div
                role="button"
                tabIndex={0}
                aria-pressed={active}
                draggable={l.type !== 'background'}
                onDragStart={(e) => {
                  if (l.type === 'background') return
                  setDraggedId(l.id)
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', l.id)
                }}
                onDragOver={(e) => handleDragOver(e, i, l)}
                onDrop={(e) => handleDrop(e, i, l)}
                onDragEnd={() => {
                  setDraggedId(null)
                  setDropIndicator(null)
                }}
                onClick={() => onSelect(l.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onSelect(l.id)
                }}
                className={`group relative flex w-full cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-all ${
                  isDragging
                    ? 'opacity-30 border-2 border-dashed border-[#1E56A0] bg-blue-50/50 scale-[0.98]'
                    : active
                      ? 'bg-blue-50/80 border border-[#1E56A0]/30 shadow-xs'
                      : 'border border-transparent hover:bg-slate-50 hover:border-slate-200/80'
                }`}
              >
                {/* Drag Grip Handle */}
                {l.type !== 'background' ? (
                  <div
                    className="flex h-7 w-4 shrink-0 cursor-grab items-center justify-center text-slate-300 group-hover:text-slate-500 active:cursor-grabbing hover:text-[#1E56A0]"
                    title="Drag to reorder layer stack"
                  >
                    <GripVertical size={14} aria-hidden />
                  </div>
                ) : (
                  <div className="w-4 shrink-0" />
                )}

                {/* Type Icon Tile */}
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
                    active ? 'bg-[#1E56A0] text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200/80'
                  }`}
                >
                  <Icon size={14} aria-hidden />
                </div>

                {/* Layer Title */}
                <input
                  value={l.name}
                  aria-label="Layer name"
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => onRename(l.id, e.target.value)}
                  className={`min-w-0 flex-1 truncate bg-transparent text-xs focus:outline-none ${
                    active ? 'font-bold text-[#1E56A0]' : 'font-semibold text-slate-700'
                  }`}
                />

                {!l.visible && (
                  <span className="shrink-0 rounded bg-slate-100 px-1 py-0.5 text-[9px] font-medium text-slate-400">hidden</span>
                )}
                {/* Quick Actions (Floating on Hover/Active) */}
                <div className={`absolute right-1.5 z-10 flex items-center gap-0.5 rounded-lg border border-slate-200/80 bg-white/95 px-1 py-0.5 shadow-xs backdrop-blur-xs transition-all ${
                  active ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto'
                }`}>
                  <button
                    type="button"
                    title={l.visible ? 'Hide layer' : 'Show layer'}
                    aria-label={l.visible ? 'Hide layer' : 'Show layer'}
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleVisible(l.id)
                    }}
                    className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                  >
                    {l.visible ? <Eye size={12} aria-hidden /> : <EyeOff size={12} aria-hidden />}
                  </button>
                  <button
                    type="button"
                    title={l.locked ? 'Unlock layer' : 'Lock layer'}
                    aria-label={l.locked ? 'Unlock layer' : 'Lock layer'}
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleLock(l.id)
                    }}
                    className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                  >
                    {l.locked ? <Lock size={12} aria-hidden /> : <LockOpen size={12} aria-hidden />}
                  </button>
                  {onDuplicate && l.type !== 'background' && (
                    <button
                      type="button"
                      title="Duplicate layer"
                      aria-label="Duplicate layer"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDuplicate(l.id)
                      }}
                      className="rounded-md p-1 text-slate-400 hover:bg-blue-50 hover:text-[#1E56A0] cursor-pointer"
                    >
                      <Copy size={12} aria-hidden />
                    </button>
                  )}
                  {l.type !== 'background' && (
                    <button
                      type="button"
                      title="Delete layer"
                      aria-label="Delete layer"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete(l.id)
                      }}
                      className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 size={12} aria-hidden />
                    </button>
                  )}
                </div>

              </div>

              {/* Drop Insertion Indicator (Below) */}
              {showBelowLine && (
                <div className="absolute -bottom-1 left-0 right-0 z-30 flex items-center gap-1">
                  <div className="h-2 w-2 rounded-full bg-[#1E56A0]" />
                  <div className="h-0.5 flex-1 rounded-full bg-[#1E56A0]" />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Add Layer Palette (Clean 2x3 Grid of Icon Pills) */}
      <div className="border-t border-slate-100 p-3 bg-slate-50/60">
        <div className="mb-2 flex items-center justify-between px-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          <span>Add Layer</span>
          <Plus size={13} aria-hidden />
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {ADDABLE.map((t) => {
            const Icon = TYPE_ICON[t] ?? Type
            return (
              <button
                key={t}
                type="button"
                onClick={() => onAdd(t)}
                className="flex items-center gap-2 rounded-xl border border-slate-200/60 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition-all hover:bg-slate-50 hover:border-[#1E56A0]/40 hover:text-[#1E56A0] hover:shadow-xs active:scale-[0.98]"
              >
                <Icon size={14} className="text-slate-400 shrink-0" aria-hidden />
                <span className="truncate">{LAYER_TYPE_LABELS[t]}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

