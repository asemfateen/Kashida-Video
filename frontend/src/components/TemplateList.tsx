// Template manager — home screen: saved templates, starter templates, and a
// library toolbar with search, tag filtering, and sorting. Each saved card has
// a live 9:16 thumbnail, tag chips (editable), dimension/duration/version
// badges, and a kebab context menu (Open, Duplicate, Export HTML, Rename,
// History, Delete).

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Plus,
  Pencil,
  Copy,
  Trash2,
  Loader2,
  WifiOff,
  RefreshCw,
  CircleAlert,
  Search,
  MoreVertical,
  Download,
  Tag as TagIcon,
  X,
  Check,
  ArrowUpRight,
} from 'lucide-react'
import type { TemplateModel } from '../lib/model'
import { uid, defaultTemplate, coerceTemplate } from '../lib/model'
import { STARTER_TEMPLATES, getStarterTemplate } from '../lib/starterTemplates'
import {
  listTemplates,
  getTemplate,
  saveTemplate,
  deleteTemplate,
  type TemplateMeta,
} from '../lib/api'
import { useBackendOnline } from '../lib/useBackend'
import { Editor } from './Editor'
import { Button } from './ui'

function fmtDate(ts: number): string {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// --- Mini 9:16 preview: exact scaled replica of the 1080x1920 Canvas --------
function Thumb({ data }: { data?: TemplateModel }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.18)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const w = el.clientWidth
      if (w > 0) {
        setScale(w / (data?.width || 1080))
      }
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [data?.width])

  if (!data) return <div className="aspect-[9/16] w-full bg-slate-900" />
  const layers = data.layers || []
  const bg = data.backgroundColor || '#0b0b0f'
  const accent = data.accentColor || '#3390ec'
  const nonBg = layers.filter((l) => l.type !== 'background')

  return (
    <div
      ref={containerRef}
      className="relative aspect-[9/16] w-full overflow-hidden select-none bg-slate-950"
    >
      <div
        className="absolute top-0 left-0 origin-top-left pointer-events-none"
        style={{
          width: data.width || 1080,
          height: data.height || 1920,
          transform: `scale(${scale})`,
          background: bg,
        }}
      >
        {/* Render each layer exactly matching Canvas.tsx */}
        {nonBg.map((l, i) => {
          const style: React.CSSProperties = {
            position: 'absolute',
            left: `${l.x}%`,
            top: `${l.y}%`,
            width: l.width && l.width > 0 ? `${l.width}%` : 'auto',
            textAlign: l.textAlign === 'center' ? 'center' : l.textAlign === 'end' ? 'left' : 'right',
            fontSize: l.fontSize,
            fontWeight: l.fontWeight,
            color: l.color || '#ffffff',
            opacity: l.opacity ?? 1,
            zIndex: i + 2,
          }

          if (l.type === 'accentBar') {
            return (
              <div
                key={l.id || i}
                style={{
                  ...style,
                  height: l.height ?? 12,
                  background: l.backgroundColor || accent,
                }}
              />
            )
          }

          if (l.type === 'card') {
            return (
              <div
                key={l.id || i}
                style={{
                  ...style,
                  height: l.height ?? 420,
                  background: l.backgroundColor || 'rgba(15,23,42,0.85)',
                  border: l.border || '2px solid rgba(255,255,255,0.18)',
                  borderRadius: l.borderRadius ?? 28,
                  backdropFilter: `blur(${l.backdropBlur ?? 16}px)`,
                }}
              />
            )
          }

          if (l.type === 'shape') {
            const radius = l.shapeType === 'circle' ? '50%' : l.shapeType === 'pill' ? '9999px' : l.borderRadius ? `${l.borderRadius}px` : '20px'
            let shapeBg = l.backgroundColor || accent
            if (l.fillType === 'gradient') {
              const start = l.gradientColorStart || accent
              const end = l.gradientColorEnd || '#E63946'
              const angle = l.gradientAngle ?? 135
              shapeBg = `linear-gradient(${angle}deg, ${start}, ${end})`
            }
            const transforms: string[] = []
            if (l.rotation) transforms.push(`rotate(${l.rotation}deg)`)
            if (l.skewX) transforms.push(`skewX(${l.skewX}deg)`)
            if (l.skewY) transforms.push(`skewY(${l.skewY}deg)`)
            return (
              <div
                key={l.id || i}
                style={{
                  ...style,
                  height: l.height ?? 180,
                  background: shapeBg,
                  borderRadius: radius,
                  transform: transforms.length > 0 ? transforms.join(' ') : undefined,
                  boxShadow: l.shadowBlur ? `0 10px ${l.shadowBlur}px ${l.shadowColor || 'rgba(0,0,0,0.5)'}` : undefined,
                }}
              />
            )
          }

          if (l.type === 'label') {
            return (
              <div key={l.id || i} style={style}>
                <span
                  className="inline-flex items-center gap-3 px-4 py-1 leading-none text-white shadow-xs"
                  style={{ background: l.backgroundColor || accent }}
                >
                  <span style={{ fontSize: l.fontSize, fontWeight: 700 }}>{l.labelAr || ''}</span>
                  <span style={{ fontSize: Math.round(l.fontSize * 0.6), fontWeight: 700, opacity: 0.85, letterSpacing: 2 }}>
                    {l.labelEn || ''}
                  </span>
                </span>
              </div>
            )
          }

          if (l.type === 'logo') {
            return (
              <div key={l.id || i} style={style}>
                {l.imageUrl ? (
                  <img src={l.imageUrl} alt="logo" style={{ width: '100%', height: 'auto', objectFit: 'contain' }} />
                ) : (
                  <span>{l.text || 'كشيدة'}</span>
                )}
              </div>
            )
          }

          return (
            <div key={l.id || i} style={style}>
              <span>{l.text || ''}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// --- Kebab menu -------------------------------------------------------------
function Kebab({ onOpen }: { onOpen: (item: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="More actions"
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
      >
        <MoreVertical size={16} aria-hidden />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 top-9 z-20 w-40 overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-[0_12px_36px_rgba(15,23,42,0.12)]" onClick={(e) => e.stopPropagation()}>
            {[
              ['open', 'Open', Pencil],
              ['duplicate', 'Duplicate', Copy],
              ['export', 'Export HTML', Download],
              ['rename', 'Rename', Pencil],
              ['delete', 'Delete', Trash2],
            ].map(([key, label, Icon]) => (
              <button
                key={key as string}
                type="button"
                onClick={() => { setOpen(false); onOpen(key as string) }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] transition-colors ${
                  key === 'delete' ? 'text-red-600 hover:bg-red-50' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon size={14} aria-hidden /> {label as string}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// --- Saved template card ----------------------------------------------------
function TemplateCard({
  t,
  onOpen,
  onDuplicate,
  onDelete,
  onRefresh,
  notify,
}: {
  t: TemplateMeta
  onOpen: (id: string) => void
  onDuplicate: (t: TemplateMeta) => void
  onDelete: (id: string) => void
  onRefresh: () => void
  notify: (msg: string) => void
}) {
  const [data, setData] = useState<TemplateModel | undefined>()
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState(t.name)
  const [addingTag, setAddingTag] = useState(false)
  const [tagDraft, setTagDraft] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    getTemplate(t.id)
      .then((rec) => {
        if (!alive) return
        const dataObj = rec.data as Record<string, unknown>
        if (Array.isArray(dataObj.layers) && dataObj.layers.length > 0) {
          setData(coerceTemplate(dataObj))
        } else {
          const starter = getStarterTemplate(t.id) || getStarterTemplate(String(dataObj.template || ''))
          setData(starter || coerceTemplate(dataObj))
        }
      })
      .catch(() => {
        const starter = getStarterTemplate(t.id)
        if (starter && alive) setData(starter)
      })
    return () => { alive = false }
  }, [t.id, t.version, t.updated_at])

  const savePatch = useCallback(async (patch: { name?: string; tags?: string[] }) => {
    setBusy(true)
    try {
      const rec = await getTemplate(t.id)
      await saveTemplate(t.id, rec.data, patch.name ?? rec.meta.name, rec.meta.description, patch.tags ?? rec.meta.tags)
      onRefresh()
    } catch {
      notify('Could not save changes — backend unreachable.')
    } finally {
      setBusy(false)
    }
  }, [t.id, onRefresh, notify])

  const commitRename = useCallback(async () => {
    const n = nameDraft.trim()
    setRenaming(false)
    if (n && n !== t.name) await savePatch({ name: n })
  }, [nameDraft, t.name, savePatch])

  const commitTag = useCallback(async () => {
    const tag = tagDraft.trim().replace(/\s+/g, '-').toLowerCase()
    setAddingTag(false)
    setTagDraft('')
    if (tag && !t.tags.includes(tag)) await savePatch({ tags: [...t.tags, tag] })
  }, [tagDraft, t.tags, savePatch])

  const removeTag = useCallback(async (tag: string) => {
    await savePatch({ tags: t.tags.filter((x) => x !== tag) })
  }, [t.tags, savePatch])

  const exportHtml = useCallback(async () => {
    setBusy(true)
    try {
      const rec = await getTemplate(t.id)
      const model = coerceTemplate(rec.data as Record<string, unknown>)
      const { generateTemplateHTML } = await import('../lib/codeGenerator')
      const { html, filename } = generateTemplateHTML(model)
      const blob = new Blob([html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      notify('Could not export HTML — backend unreachable.')
    } finally {
      setBusy(false)
    }
  }, [t.id, notify])

  const onKebab = useCallback((item: string) => {
    if (item === 'open') onOpen(t.id)
    else if (item === 'duplicate') onDuplicate(t)
    else if (item === 'export') exportHtml()
    else if (item === 'rename') { setNameDraft(t.name); setRenaming(true) }
    else if (item === 'delete') { if (window.confirm(`Delete "${t.name}"?`)) onDelete(t.id) }
  }, [t, onOpen, onDuplicate, onDelete, exportHtml])

  return (
    <div className="group flex flex-col rounded-3xl border border-slate-200/70 bg-white p-3.5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-[#1E56A0]/40 hover:shadow-[0_20px_40px_rgba(30,86,160,0.12)]">
      <button type="button" onClick={() => onOpen(t.id)} className="block w-full">
        <div className="aspect-[9/16] w-full overflow-hidden rounded-2xl shadow-inner">
          <Thumb data={data} />
        </div>
      </button>
      <div className="flex flex-1 flex-col pt-3">
        <div className="flex items-start justify-between gap-1.5">
          <div className="min-w-0 flex-1">
            {renaming ? (
              <div className="flex items-center gap-1">
                <input
                  value={nameDraft}
                  autoFocus
                  aria-label="Rename template"
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(false) }}
                  className="min-w-0 flex-1 rounded-full border border-[#1E56A0] bg-white px-2.5 py-1 text-[13px] font-semibold text-slate-900 focus:outline-none"
                />
                <button type="button" aria-label="Save name" onClick={commitRename} disabled={busy} className="rounded-full p-1 text-emerald-600 hover:bg-slate-100 disabled:opacity-40"><Check size={14} aria-hidden /></button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <h3 className="truncate text-sm font-bold text-slate-900">{t.name}</h3>
              </div>
            )}
            <p className="mt-0.5 line-clamp-1 text-xs text-slate-500 font-medium">{t.description || 'قالب إخباري قابل للتخصيص'}</p>
          </div>
          <div className="relative shrink-0">
            <Kebab onOpen={onKebab} />
          </div>
        </div>

        {/* Tags */}
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {t.tags.map((tag) => (
            <span key={tag} className="flex items-center gap-1 rounded-full bg-blue-50/80 px-2 py-0.5 text-[10px] font-semibold text-[#1E56A0]">
              {tag}
              <button type="button" aria-label={`Remove tag ${tag}`} onClick={() => removeTag(tag)} disabled={busy} className="text-[#1E56A0]/60 hover:text-red-600 disabled:opacity-40">
                <X size={10} aria-hidden />
              </button>
            </span>
          ))}
          {addingTag ? (
            <span className="flex items-center gap-1">
              <input
                value={tagDraft}
                autoFocus
                aria-label="New tag"
                placeholder="tag"
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') commitTag(); if (e.key === 'Escape') setAddingTag(false) }}
                className="w-16 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-900 focus:border-[#1E56A0] focus:outline-none"
              />
              <button type="button" aria-label="Add tag" onClick={commitTag} disabled={busy} className="text-primary hover:text-primary-hover disabled:opacity-40"><Check size={11} aria-hidden /></button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setAddingTag(true)}
              aria-label="Add tag"
              className="flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[10px] font-medium text-slate-400 transition-colors hover:border-[#1E56A0] hover:text-[#1E56A0]"
            >
              <TagIcon size={9} aria-hidden /> أضف وسم
            </button>
          )}
        </div>

        {/* Badges + meta */}
        <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">9:16</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{data?.duration ?? '—'}s</span>
          </div>
          {t.updated_at > 0 && <span className="text-[10px] text-slate-400">{fmtDate(t.updated_at)}</span>}
        </div>

        {/* Action row */}
        <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-2.5">
          <button
            type="button"
            onClick={() => onOpen(t.id)}
            className="flex-1 rounded-xl bg-[#1E56A0] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#16437E] active:bg-[#123666]"
          >
            Open Editor
          </button>
          <button
            type="button"
            onClick={() => onDuplicate(t)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition-colors hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900"
          >
            Duplicate
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Library screen ---------------------------------------------------------
export function TemplateList() {
  const [templates, setTemplates] = useState<TemplateMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [editing, setEditing] = useState<TemplateModel | null>(null)
  const online = useBackendOnline()

  const [query, setQuery] = useState('')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'updated' | 'name'>('updated')

  const refresh = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    setActionError(null)
    try {
      setTemplates(await listTemplates())
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const notify = useCallback((msg: string) => setActionError(msg), [])

  const open = useCallback((model: TemplateModel) => {
    setEditing(model)
    try {
      localStorage.setItem('kashida_active_template_id', model.id)
      const url = new URL(window.location.href)
      url.searchParams.set('template', model.id)
      url.searchParams.delete('version')
      window.history.replaceState(null, '', url.toString())
    } catch {}
  }, [])

  const close = useCallback(() => {
    setEditing(null)
    try {
      localStorage.removeItem('kashida_active_template_id')
      const url = new URL(window.location.href)
      url.searchParams.delete('template')
      url.searchParams.delete('version')
      window.history.replaceState(null, '', url.toString())
    } catch {}
    refresh()
  }, [refresh])

  const openSaved = useCallback(async (id: string) => {
    try {
      const rec = await getTemplate(id)
      const dataObj = rec.data as Record<string, unknown>
      let model: TemplateModel
      if (Array.isArray(dataObj.layers) && dataObj.layers.length > 0) {
        model = coerceTemplate(dataObj)
      } else {
        const starter = getStarterTemplate(id) || getStarterTemplate(String(dataObj.template || ''))
        model = starter || coerceTemplate(dataObj)
      }
      model.id = rec.meta.id
      model.name = rec.meta.name
      open(model)
    } catch {
      const starter = getStarterTemplate(id)
      if (starter) {
        open(starter)
      } else {
        setActionError('Could not open template — backend unreachable.')
      }
    }
  }, [open])

  // Restore active template on initial load / page refresh
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const templateId = params.get('template') || localStorage.getItem('kashida_active_template_id')

      if (templateId) {
        openSaved(templateId)
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const duplicate = useCallback((t: TemplateMeta) => {
    getTemplate(t.id)
      .then((rec) => {
        const dataObj = rec.data as Record<string, unknown>
        let model: TemplateModel
        if (Array.isArray(dataObj.layers) && dataObj.layers.length > 0) {
          model = coerceTemplate(dataObj)
        } else {
          const starter = getStarterTemplate(t.id) || getStarterTemplate(String(dataObj.template || ''))
          model = starter || coerceTemplate(dataObj)
        }
        model.id = uid()
        model.name = `${rec.meta.name} (copy)`
        open(model)
      })
      .catch(() => {
        const starter = getStarterTemplate(t.id)
        if (starter) {
          starter.id = uid()
          starter.name = `${t.name} (copy)`
          open(starter)
        } else {
          setActionError('Could not duplicate template — backend unreachable.')
        }
      })
  }, [open])

  const remove = useCallback(async (id: string) => {
    try {
      await deleteTemplate(id)
      refresh()
    } catch {
      setActionError('Could not delete template — backend unreachable.')
    }
  }, [refresh])

  const newBlank = useCallback(() => {
    const t = defaultTemplate()
    t.id = uid()
    open(t)
  }, [open])

  const fromStarter = useCallback((s: TemplateModel) => {
    if (templates.some((t) => t.id === s.id)) {
      openSaved(s.id)
    } else {
      open(s)
    }
  }, [open, openSaved, templates])

  // Derived: tag list + filtered/sorted templates
  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const t of templates) for (const tag of t.tags) set.add(tag)
    return Array.from(set).sort()
  }, [templates])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    let out = templates.filter((t) => {
      if (tagFilter && !t.tags.includes(tagFilter)) return false
      if (!q) return true
      return (
        t.name.toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q))
      )
    })
    out = [...out].sort((a, b) =>
      sortBy === 'name' ? a.name.localeCompare(b.name) : (b.updated_at ?? 0) - (a.updated_at ?? 0),
    )
    return out
  }, [templates, query, tagFilter, sortBy])

  if (editing) {
    return <Editor initial={editing} onBack={close} onSaved={() => refresh()} />
  }

  return (
    <div className="thin-scroll h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8">
        
        {/* Floating Capsule Header (kashida.io style) */}
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-full border border-slate-200/80 bg-white/90 px-6 py-3 shadow-[0_8px_30px_rgba(15,23,42,0.05)] backdrop-blur-md">
          <div className="flex items-center gap-3.5">
            <img src="/logo.png" alt="Kashida" className="h-7 w-auto" />
            <div className="flex items-center gap-2.5">
              <span className="text-base font-bold text-slate-900 tracking-tight">Kashida Studio</span>
              <span className="h-3.5 w-px bg-slate-200" />
              <span className="text-xs font-medium text-slate-500">Design news-video templates visually — no code.</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <span className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${online ? 'border border-emerald-200/80 bg-emerald-50 text-emerald-700' : 'border border-red-200 bg-red-50 text-red-600'}`}>
              {online ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Connected to backend</span>
                </>
              ) : (
                <>
                  <WifiOff size={13} className="text-red-500" />
                  <span>Backend offline</span>
                </>
              )}
            </span>
            <button
              type="button"
              onClick={newBlank}
              className="flex items-center gap-1.5 rounded-xl bg-[#1E56A0] px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#16437E] active:bg-[#123666]"
            >
              <Plus size={15} />
              <span>Blank Template</span>
            </button>
          </div>
        </header>

        {/* Start a new template */}
        <section className="mb-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600">Start a new template</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {/* Blank Card */}
            <button
              type="button"
              onClick={newBlank}
              className="group flex aspect-[9/16] flex-col items-center justify-center gap-2.5 rounded-[26px] border-2 border-dashed border-slate-300 bg-white/70 text-slate-500 shadow-xs transition-all duration-300 hover:border-[#1E56A0] hover:bg-white hover:text-[#1E56A0] hover:shadow-[0_15px_35px_rgba(30,86,160,0.1)] hover:-translate-y-1"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-[#1E56A0] shadow-xs transition-transform duration-300 group-hover:scale-110 group-hover:bg-[#1E56A0] group-hover:text-white">
                <Plus size={24} />
              </span>
              <span className="text-sm font-bold">Blank</span>
            </button>

            {/* Starter Templates */}
            {STARTER_TEMPLATES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => fromStarter(s)}
                className="group flex aspect-[9/16] flex-col rounded-3xl border border-slate-200/80 bg-white p-3.5 text-left shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-[#1E56A0]/40 hover:shadow-[0_20px_40px_rgba(30,86,160,0.12)]"
              >
                <div className="aspect-[9/16] w-full overflow-hidden rounded-2xl shadow-inner">
                  <Thumb data={s} />
                </div>

                <div className="pt-3 px-0.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 group-hover:text-[#1E56A0] transition-colors">{s.name}</span>
                    <ArrowUpRight size={13} className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="mt-0.5 line-clamp-1 text-[11px] text-slate-500 font-medium">{s.description}</div>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Saved Templates */}
        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600">Saved templates</h2>
            
            <div className="flex items-center gap-2.5">
              {/* Single Rounded Capsule Container */}
              <div className="flex items-center rounded-full border border-slate-200/90 bg-white px-2 py-1 shadow-sm">
                <div className="relative flex items-center">
                  <Search size={14} className="pointer-events-none absolute left-2 text-slate-400" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search templates…"
                    aria-label="Search templates"
                    className="w-48 bg-transparent py-0.5 pl-7 pr-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none"
                  />
                </div>
                <div className="h-4 w-px bg-slate-200" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'updated' | 'name')}
                  aria-label="Sort templates"
                  className="bg-transparent px-2.5 py-0.5 text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
                >
                  <option value="updated">Recently updated</option>
                  <option value="name">Name (A–Z)</option>
                </select>
              </div>

              {loading && <Loader2 size={14} className="animate-spin text-slate-400" />}
            </div>
          </div>

          {/* Tag filter chips (flush aligned) */}
          {allTags.length > 0 && (
            <div className="no-scrollbar mb-4 flex items-center gap-1.5 overflow-x-auto py-1">
              <button
                type="button"
                onClick={() => setTagFilter(null)}
                className={`shrink-0 rounded-full px-3.5 py-1 text-xs font-semibold transition-all duration-200 ${
                  tagFilter === null
                    ? 'bg-[#1E56A0] text-white shadow-xs'
                    : 'border border-slate-200/90 bg-white text-slate-600 hover:border-[#1E56A0] hover:text-[#1E56A0]'
                }`}
              >
                All
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                  className={`shrink-0 rounded-full px-3.5 py-1 text-xs font-semibold transition-all duration-200 ${
                    tagFilter === tag
                      ? 'bg-[#1E56A0] text-white shadow-xs'
                      : 'border border-slate-200/90 bg-white text-slate-600 hover:border-[#1E56A0] hover:text-[#1E56A0]'
                  }`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}

          {actionError && (
            <div className="mb-4 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-600">
              <CircleAlert size={15} /> {actionError}
            </div>
          )}

          {!loading && loadError && (
            <div className="rounded-3xl border border-red-200 bg-red-50/80 p-8 text-center backdrop-blur-xs">
              <WifiOff size={24} className="mx-auto mb-2 text-red-500" />
              <p className="text-sm font-bold text-red-600">Backend unreachable</p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-slate-600">
                Saved templates, version history, and test renders all live on the backend. Start it (uvicorn on :8001) and retry.
              </p>
              <div className="mt-4">
                <Button variant="outline" onClick={refresh}>
                  <RefreshCw size={13} /> Retry
                </Button>
              </div>
            </div>
          )}

          {!loading && !loadError && templates.length === 0 && (
            <div className="rounded-[26px] border-2 border-dashed border-slate-200 bg-white/70 p-12 text-center text-sm font-semibold text-slate-500">
              No saved templates yet. Create one from a starter or blank above.
            </div>
          )}

          {!loading && !loadError && templates.length > 0 && visible.length === 0 && (
            <div className="rounded-[26px] border-2 border-dashed border-slate-200 bg-white/70 p-12 text-center text-sm font-semibold text-slate-500">
              No templates match your search or filter.
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((t) => (
              <TemplateCard
                key={t.id}
                t={t}
                onOpen={openSaved}
                onDuplicate={duplicate}
                onDelete={remove}
                onRefresh={refresh}
                notify={notify}
              />
            ))}
          </div>
        </section>

      </div>
    </div>
  )
}

export default TemplateList
