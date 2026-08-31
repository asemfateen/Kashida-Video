// CommandPalette — Spotlight-style instant action search (Ctrl+K / Cmd+K).
// Allows instant search and execution of layers, fonts, broadcast themes, scene actions, and editor tools.

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Search,
  Type,
  Palette,
  Layers,
  Sparkles,
  Play,
  Download,
  Copy,
  Plus,
  Grid3x3,
  X,
} from 'lucide-react'
import type { Layer, TemplateModel, TemplateRound } from '../lib/model'
import { ARABIC_FONTS } from '../lib/fonts'
import { BROADCAST_PALETTES } from '../lib/palettes'

export interface CommandItem {
  id: string
  title: string
  subtitle?: string
  category: 'Layers' | 'Typography' | 'Color Themes' | 'Actions' | 'Scenes'
  icon: typeof Search
  shortcut?: string
  onSelect: () => void
}

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  model: TemplateModel
  selectedId: string | null
  activeRound: TemplateRound | undefined
  onSelectLayer: (id: string | null) => void
  onAddLayer: (type: any) => void
  onUpdateLayer: (id: string, patch: Partial<Layer>) => void
  onUpdateTemplate: (patch: Partial<TemplateModel>) => void
  onAddRound: () => void
  onDuplicateRound: (id: string) => void
  onTogglePlay: () => void
  onSave: () => void
  onExport: () => void
  onToggleGuides?: () => void
}

export function CommandPalette({
  open,
  onClose,
  model,
  selectedId,
  activeRound,
  onSelectLayer,
  onAddLayer,
  onUpdateLayer,
  onUpdateTemplate,
  onAddRound,
  onDuplicateRound,
  onTogglePlay,
  onSave,
  onExport,
  onToggleGuides,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      const t = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(t)
    }
  }, [open])

  const commands = useMemo<CommandItem[]>(() => {
    const list: CommandItem[] = []

    // 1. Actions
    list.push({
      id: 'act-play',
      title: 'Play / Pause Preview',
      subtitle: 'Toggle live motion playback',
      category: 'Actions',
      icon: Play,
      shortcut: 'Space',
      onSelect: () => {
        onTogglePlay()
        onClose()
      },
    })
    list.push({
      id: 'act-save',
      title: 'Save Template',
      subtitle: 'Persist all design and round changes',
      category: 'Actions',
      icon: Download,
      shortcut: 'Ctrl+S',
      onSelect: () => {
        onSave()
        onClose()
      },
    })
    list.push({
      id: 'act-export',
      title: 'Export / Generate Video',
      subtitle: 'Render complete 1080x1920 MP4 video',
      category: 'Actions',
      icon: Sparkles,
      onSelect: () => {
        onExport()
        onClose()
      },
    })
    if (onToggleGuides) {
      list.push({
        id: 'act-guides',
        title: 'Toggle Safe-Zone Guides',
        subtitle: 'Show 9:16 mobile broadcast margin grid',
        category: 'Actions',
        icon: Grid3x3,
        onSelect: () => {
          onToggleGuides()
          onClose()
        },
      })
    }

    // 2. Add Layers
    list.push({
      id: 'add-headline',
      title: 'Add Main Headline (عنوان رئيسي)',
      subtitle: 'Create a primary Arabic headline layer',
      category: 'Layers',
      icon: Plus,
      onSelect: () => {
        onAddLayer('headline')
        onClose()
      },
    })
    list.push({
      id: 'add-badge',
      title: 'Add Breaking Badge (عاجل)',
      subtitle: 'Create a bilingual news category badge',
      category: 'Layers',
      icon: Plus,
      onSelect: () => {
        onAddLayer('label')
        onClose()
      },
    })
    list.push({
      id: 'add-subhead',
      title: 'Add Subheadline / Source Details',
      subtitle: 'Create a secondary context & location layer',
      category: 'Layers',
      icon: Plus,
      onSelect: () => {
        onAddLayer('subheadline')
        onClose()
      },
    })
    list.push({
      id: 'add-shape',
      title: 'Add Graphic Shape / Ribbon',
      subtitle: 'Insert a customizable Canva-style shape',
      category: 'Layers',
      icon: Plus,
      onSelect: () => {
        onAddLayer('shape')
        onClose()
      },
    })
    list.push({
      id: 'add-card',
      title: 'Add Glassmorphism Card Container',
      subtitle: 'Insert a frosted glass backdrop panel',
      category: 'Layers',
      icon: Plus,
      onSelect: () => {
        onAddLayer('card')
        onClose()
      },
    })

    // 3. Select Existing Layers
    model.layers.forEach((l) => {
      list.push({
        id: `layer-${l.id}`,
        title: `Select Layer: ${l.name}`,
        subtitle: `${l.type.toUpperCase()} · X: ${Math.round(l.x)}% Y: ${Math.round(l.y)}%`,
        category: 'Layers',
        icon: Layers,
        onSelect: () => {
          onSelectLayer(l.id)
          onClose()
        },
      })
    })

    // 4. Color Themes
    BROADCAST_PALETTES.forEach((p) => {
      list.push({
        id: `theme-${p.id}`,
        title: `Apply Theme: ${p.name} (${p.nameAr})`,
        subtitle: `Primary: ${p.primary} · Background: ${p.background}`,
        category: 'Color Themes',
        icon: Palette,
        onSelect: () => {
          onUpdateTemplate({
            accentColor: p.primary,
            backgroundColor: p.background,
          })
          onClose()
        },
      })
    })

    // 5. Arabic Fonts (if layer is selected)
    if (selectedId) {
      ARABIC_FONTS.forEach((f) => {
        list.push({
          id: `font-${f.id}`,
          title: `Set Font: ${f.name}`,
          subtitle: `Sample: "${f.sample}" (${f.family})`,
          category: 'Typography',
          icon: Type,
          onSelect: () => {
            onUpdateLayer(selectedId, { fontFamily: f.family })
            onClose()
          },
        })
      })
    }

    // 6. Scenes / Rounds
    list.push({
      id: 'scene-add',
      title: 'Add New Scene / Round',
      subtitle: 'Append a new news item segment to this video',
      category: 'Scenes',
      icon: Plus,
      onSelect: () => {
        onAddRound()
        onClose()
      },
    })
    if (activeRound) {
      list.push({
        id: 'scene-dup',
        title: `Duplicate Active Scene (${activeRound.name})`,
        subtitle: 'Clone current scene content and timing',
        category: 'Scenes',
        icon: Copy,
        onSelect: () => {
          onDuplicateRound(activeRound.id)
          onClose()
        },
      })
    }

    return list
  }, [
    model.layers,
    selectedId,
    activeRound,
    onTogglePlay,
    onSave,
    onExport,
    onToggleGuides,
    onAddLayer,
    onSelectLayer,
    onUpdateTemplate,
    onUpdateLayer,
    onAddRound,
    onDuplicateRound,
    onClose,
  ])

  const filtered = useMemo(() => {
    if (!query.trim()) return commands
    const q = query.toLowerCase()
    return commands.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.subtitle?.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q)
    )
  }, [commands, query])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => (i + 1 < filtered.length ? i + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => (i - 1 >= 0 ? i - 1 : filtered.length - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].onSelect()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-slate-950/60 p-4 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-3xl border border-slate-700/60 bg-[#0B1528]/95 shadow-[0_25px_70px_rgba(0,0,0,0.6)] backdrop-blur-2xl animate-in zoom-in-95 duration-150 text-slate-100"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800/80">
          <Search size={18} className="text-[#1E56A0] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search layers, fonts, themes, actions..."
            className="w-full bg-transparent text-sm font-medium text-white placeholder-slate-400 outline-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="rounded-lg p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X size={14} />
            </button>
          ) : (
            <kbd className="rounded-md border border-slate-700 bg-slate-800/80 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-400">
              ESC
            </kbd>
          )}
        </div>

        {/* Results List */}
        <div ref={listRef} className="thin-scroll max-h-96 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400 font-medium">
              No matching commands or tools found for "{query}"
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {filtered.map((item, idx) => {
                const isSelected = idx === selectedIndex
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={item.onSelect}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-2.5 text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#1E56A0] text-white shadow-md'
                        : 'text-slate-200 hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-xl shrink-0 ${
                          isSelected ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        <Icon size={15} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate">{item.title}</div>
                        {item.subtitle && (
                          <div
                            className={`text-[10px] truncate font-medium ${
                              isSelected ? 'text-blue-100' : 'text-slate-400'
                            }`}
                          >
                            {item.subtitle}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                          isSelected ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {item.category}
                      </span>
                      {item.shortcut && (
                        <kbd
                          className={`rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                            isSelected
                              ? 'border-white/30 bg-white/20 text-white'
                              : 'border-slate-700 bg-slate-800 text-slate-300'
                          }`}
                        >
                          {item.shortcut}
                        </kbd>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer Navigation Hints */}
        <div className="flex items-center justify-between border-t border-slate-800/80 bg-slate-950/40 px-5 py-2.5 text-[11px] text-slate-400 font-medium">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-slate-700 bg-slate-800 px-1 font-mono text-[10px] font-bold text-slate-300">↑</kbd>
              <kbd className="rounded border border-slate-700 bg-slate-800 px-1 font-mono text-[10px] font-bold text-slate-300">↓</kbd>
              <span className="ml-0.5">Navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-slate-700 bg-slate-800 px-1 font-mono text-[10px] font-bold text-slate-300">↵</kbd>
              <span className="ml-0.5">Select</span>
            </span>
          </div>
          <div className="text-[10px] text-slate-500 font-bold">Kashida Studio Pro</div>
        </div>
      </div>
    </div>
  )
}
