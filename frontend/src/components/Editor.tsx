// Editor — the main workspace: canvas preview, layers panel, inspector,
// playback, plus save / export-HTML / test-render actions.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Save,
  Download,
  Clapperboard,
  Loader2,
  Plus,
  Minus,
  CheckCircle2,
  WifiOff,
  AlertTriangle,
  CircleAlert,
  Layers as LayersIcon,
  Sparkles,
  Undo2,
  Redo2,
  Keyboard,
  X,
  Copy,
  Trash2,
  Lock,
  LockOpen,
  AlignHorizontalJustifyCenter,
  AlignRight,
  AlignCenter,
  AlignLeft,
} from 'lucide-react'
import type { EntranceAnimation, Layer, LayerType, TemplateModel, TemplateRound } from '../lib/model'
import {
  newLayer,
  defaultRound,
  applyRoundToLayers,
  duplicateLayerModel,
  duplicateRoundModel,
  alignLayerH,
  alignLayerV,
  LAYER_TYPE_LABELS,
} from '../lib/model'
import { ARABIC_FONTS } from '../lib/fonts'
import {
  createHistory,
  pushHistory,
  undoHistory,
  redoHistory,
  canUndo,
  canRedo,
  type HistoryState,
} from '../lib/history'
import { buildTimeline, timelineDuration } from '../lib/timeline'
import { usePlaybackClock } from '../lib/preview'
import { useBackendOnline } from '../lib/useBackend'
import { Canvas } from './Canvas'
import { LayersPanel } from './LayersPanel'
import { Inspector } from './Inspector'
import { PlaybackBar } from './PlaybackBar'
import { ToastContainer, type ToastMessage } from './Toast'
import { CommandPalette } from './CommandPalette'
import {
  checkBackend,
  requestRender,
  saveTemplate,
  getRenderStatus,
  flushSaveTemplate,
  uploadAsset,
  assetUrl,
  type RenderTask,
} from '../lib/api'

interface Props {
  initial: TemplateModel
  onBack: () => void
  onSaved?: (m: TemplateModel) => void
}

export function Editor({ initial, onBack, onSaved }: Props) {
  const [history, setHistory] = useState<HistoryState<TemplateModel>>(() => createHistory(initial))
  const model = history.present
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const addToast = useCallback((t: Omit<ToastMessage, 'id'> & { id?: string }) => {
    const toastId = t.id ?? Math.random().toString(36).slice(2, 9)
    setToasts((prev) => {
      const filtered = prev.filter((item) => item.id !== toastId)
      return [...filtered, { ...t, id: toastId }]
    })
    return toastId
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [bumperActive, setBumperActive] = useState(false)
  // Incremented to tell the Inspector to open + reveal the Bumper editor.
  const [bumperFocus, setBumperFocus] = useState(0)
  const [activeRoundId, setActiveRoundId] = useState<string | null>(() => model.rounds[0]?.id ?? null)
  const [saving, setSaving] = useState(false)
  const [render, setRender] = useState<{ busy: boolean; task?: RenderTask; error?: string }>({ busy: false })
  const online = useBackendOnline()

  // Layers panel collapse preference — persisted so the canvas keeps its space.
  const [layersCollapsed, setLayersCollapsed] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('kashida:layersCollapsed')
      return stored === null ? true : stored === '1'
    } catch {
      return true
    }
  })
  const toggleLayers = useCallback(() => {
    setLayersCollapsed((c) => {
      const n = !c
      try {
        localStorage.setItem('kashida:layersCollapsed', n ? '1' : '0')
      } catch {
        /* ignore */
      }
      return n
    })
  }, [])

  const [lastSave, setLastSave] = useState<{ ok: boolean; version?: number; error?: string } | null>(null)
  // Snapshot of the model at the time of the last save; `dirty` compares against it.
  const [savedSnap, setSavedSnap] = useState<string>(() => JSON.stringify(initial))
  const dirty = useMemo(() => JSON.stringify(model) !== savedSnap, [model, savedSnap])

  // Settle the connectivity flag as soon as the editor opens.
  useEffect(() => {
    checkBackend()
  }, [])

  // Full ordered segment timeline (news rounds + brand bumpers). Mirrors the
  // renderer so preview timing always matches the produced MP4.
  const roundDur = useCallback(
    (r: TemplateRound) => (r.duration > 0 ? r.duration : (model.duration || 5)),
    [model.duration]
  )
  const segments = useMemo(
    () => buildTimeline(model.rounds, roundDur, model.bumper),
    [model.rounds, roundDur, model.bumper]
  )

  // Unified clips for the sequencer: news rounds + bumper segments (absolute starts).
  const clips = useMemo(() => {
    return segments.map((s, idx) => {
      if (s.kind === 'bumper') {
        const isFirst = idx === 0
        const isLast = idx === segments.length - 1
        return {
          id: `bumper-${s.start.toFixed(3)}-${idx}`,
          name: isFirst ? 'Intro' : isLast ? 'Outro' : 'Bumper',
          start: s.start,
          duration: s.duration,
          kind: 'bumper' as const,
        }
      }
      const round = model.rounds[s.roundIndex ?? 0]
      return {
        id: round.id,
        name: round.name,
        start: s.start,
        duration: s.duration,
        kind: 'round' as const,
      }
    })
  }, [segments, model.rounds])

  // News-round offsets only (used for round selection / highlighting).
  const roundOffsets = useMemo(() => clips.filter((c) => c.kind === 'round'), [clips])

  const totalDuration = useMemo(() => timelineDuration(segments), [segments])

  const clock = usePlaybackClock(totalDuration)

  const activeRound = model.rounds.find((r) => r.id === activeRoundId) ?? model.rounds[0]

  // The segment under the playhead while playing (null when stopped).
  const currentSegment = useMemo(() => {
    if (!clock.playing) return null
    return segments.find((s) => clock.time >= s.start && clock.time < s.start + s.duration) ?? null
  }, [segments, clock.time, clock.playing])


  // Find which round the playhead is currently inside during playback (null for bumper segments).
  const playingOffset = useMemo(() => {
    if (!currentSegment || currentSegment.kind !== 'round') return null
    const round = model.rounds[currentSegment.roundIndex ?? 0]
    const off = roundOffsets.find((o) => o.id === round.id)
    return off ?? null
  }, [currentSegment, roundOffsets, model.rounds])

  const currentDisplayRound = useMemo(() => {
    if (clock.playing) {
      if (currentSegment?.kind === 'bumper') return undefined
      if (currentSegment?.kind === 'round') return model.rounds[currentSegment.roundIndex ?? 0]
    }
    return activeRound
  }, [clock.playing, currentSegment, model.rounds, activeRound])

  const selectedLayer = useMemo(
    () => model.layers.find((l) => l.id === selectedId),
    [model.layers, selectedId],
  )

  // --- model mutations with undo/redo history --------------------------------
  const updateModel = useCallback((fn: (m: TemplateModel) => TemplateModel, recordHistory = true) => {
    setHistory((cur) => {
      const nextModel = fn(cur.present)
      if (recordHistory) {
        return pushHistory(cur, nextModel)
      }
      return { ...cur, present: nextModel }
    })
  }, [])

  const undo = useCallback(() => {
    setHistory((cur) => {
      if (!canUndo(cur)) return cur
      const next = undoHistory(cur)
      addToast({ type: 'info', title: 'Undo', message: 'Reverted last change', duration: 2000 })
      return next
    })
  }, [addToast])

  const redo = useCallback(() => {
    setHistory((cur) => {
      if (!canRedo(cur)) return cur
      const next = redoHistory(cur)
      addToast({ type: 'info', title: 'Redo', message: 'Re-applied change', duration: 2000 })
      return next
    })
  }, [addToast])

  const updateLayer = useCallback((id: string, patch: Partial<Layer>) => {
    updateModel((m) => ({ ...m, layers: m.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) }))
  }, [updateModel])

  const updateAnimation = useCallback((id: string, patch: Partial<EntranceAnimation>) => {
    updateModel((m) => ({ ...m, layers: m.layers.map((l) => (l.id === id ? { ...l, animation: { ...l.animation, ...patch } } : l)) }))
  }, [updateModel])

  const updateTemplate = useCallback((patch: Partial<TemplateModel>) => {
    updateModel((m) => ({ ...m, ...patch }))
  }, [updateModel])

  // --- round mutations --------------------------------------------------------
  const updateRound = useCallback((id: string, patch: Partial<TemplateRound>) => {
    updateModel((m) => ({ ...m, rounds: m.rounds.map((r) => (r.id === id ? { ...r, ...patch } : r)) }))
  }, [updateModel])

  const addRound = useCallback(() => {
    const roundNum = model.rounds.length + 1
    const round = defaultRound({ name: `Next Round ${roundNum}` })
    updateModel((m) => ({ ...m, rounds: [...m.rounds, round] }))
    setActiveRoundId(round.id)
    addToast({ type: 'info', title: 'Round Added', message: `Added ${round.name}`, duration: 2000 })
  }, [updateModel, model.rounds.length, addToast])

  const duplicateRound = useCallback((id: string) => {
    const src = model.rounds.find((r) => r.id === id)
    if (!src) return
    const dup = duplicateRoundModel(src)
    updateModel((m) => {
      const idx = m.rounds.findIndex((r) => r.id === id)
      if (idx < 0) return m
      const rounds = [...m.rounds]
      rounds.splice(idx + 1, 0, dup)
      return { ...m, rounds }
    })
    setActiveRoundId(dup.id)
    addToast({ type: 'info', title: 'Round Duplicated', message: `Created copy of ${src.name}`, duration: 2500 })
  }, [model.rounds, updateModel, addToast])

  const deleteRound = useCallback((id: string) => {
    const src = model.rounds.find((r) => r.id === id)
    updateModel((m) => {
      const rounds = m.rounds.filter((r) => r.id !== id)
      return { ...m, rounds: rounds.length ? rounds : [defaultRound({ name: 'First Round' })] }
    })
    setActiveRoundId((cur) => {
      if (cur !== id) return cur
      const remaining = model.rounds.filter((r) => r.id !== id)
      return remaining[0]?.id ?? null
    })
    if (src) {
      addToast({ type: 'info', title: 'Round Deleted', message: `Removed ${src.name}`, duration: 2000 })
    }
  }, [updateModel, model.rounds, addToast])

  const moveRound = useCallback((id: string, dir: -1 | 1) => {
    updateModel((m) => {
      const idx = m.rounds.findIndex((r) => r.id === id)
      const to = idx + dir
      if (idx < 0 || to < 0 || to >= m.rounds.length) return m
      const rounds = [...m.rounds]
      const [item] = rounds.splice(idx, 1)
      rounds.splice(to, 0, item)
      return { ...m, rounds }
    })
  }, [updateModel])

  const addLayer = useCallback((type: LayerType) => {
    const layer = newLayer(type)
    updateModel((m) => ({ ...m, layers: [...m.layers, layer] }))
    setSelectedId(layer.id)
    addToast({ type: 'info', title: 'Layer Added', message: `Created ${layer.name}`, duration: 2000 })
  }, [updateModel, addToast])

  const duplicateLayer = useCallback((id: string) => {
    const src = model.layers.find((l) => l.id === id)
    if (!src || src.type === 'background') return
    const dup = duplicateLayerModel(src)
    updateModel((m) => {
      const idx = m.layers.findIndex((l) => l.id === id)
      if (idx < 0) return m
      const layers = [...m.layers]
      layers.splice(idx + 1, 0, dup)
      return { ...m, layers }
    })
    setSelectedId(dup.id)
    addToast({ type: 'info', title: 'Layer Duplicated', message: `Created copy of ${src.name}`, duration: 2500 })
  }, [model.layers, updateModel, addToast])

  const alignLayerHorizontal = useCallback((id: string) => {
    const layer = model.layers.find((l) => l.id === id)
    if (!layer || layer.locked || layer.type === 'background') return
    const patch = alignLayerH(layer)
    updateLayer(id, patch)
    addToast({ type: 'info', title: 'Aligned Horizontally', message: `Centered ${layer.name} on canvas`, duration: 2000 })
  }, [model.layers, updateLayer, addToast])

  const alignLayerVertical = useCallback((id: string) => {
    const layer = model.layers.find((l) => l.id === id)
    if (!layer || layer.locked || layer.type === 'background') return
    const patch = alignLayerV(layer, model.height)
    updateLayer(id, patch)
    addToast({ type: 'info', title: 'Aligned Vertically', message: `Centered ${layer.name} on canvas`, duration: 2000 })
  }, [model.layers, model.height, updateLayer, addToast])

  const deleteLayer = useCallback((id: string) => {
    const layer = model.layers.find((l) => l.id === id)
    if (!layer || layer.type === 'background' || layer.locked) return
    updateModel((m) => {
      const layers = m.layers.filter((l) => l.id !== id)
      return { ...m, layers }
    })
    setSelectedId((s) => (s === id ? null : s))
    addToast({ type: 'info', title: 'Layer Deleted', message: `Removed ${layer.name}`, duration: 2000 })
  }, [updateModel, model.layers, addToast])

  const reorder = useCallback((id: string, dir: -1 | 1) => {
    updateModel((m) => {
      const idx = m.layers.findIndex((l) => l.id === id)
      if (idx < 0 || m.layers[idx].type === 'background') return m
      const hasBg = m.layers.length > 0 && m.layers[0].type === 'background'
      const minIdx = hasBg ? 1 : 0
      const to = idx + dir
      if (to < minIdx || to >= m.layers.length) return m
      const layers = [...m.layers]
      const [item] = layers.splice(idx, 1)
      layers.splice(to, 0, item)
      return { ...m, layers }
    })
  }, [updateModel])

  const reorderToIndex = useCallback((fromId: string, toIndex: number) => {
    updateModel((m) => {
      const fromIdx = m.layers.findIndex((l) => l.id === fromId)
      if (fromIdx < 0 || m.layers[fromIdx].type === 'background') return m
      const hasBg = m.layers.length > 0 && m.layers[0].type === 'background'
      const minIdx = hasBg ? 1 : 0
      const clampedTo = Math.max(minIdx, Math.min(m.layers.length - 1, toIndex))
      if (fromIdx === clampedTo) return m
      const layers = [...m.layers]
      const [item] = layers.splice(fromIdx, 1)
      layers.splice(clampedTo, 0, item)
      return { ...m, layers }
    })
  }, [updateModel])

  const toggleVisible = useCallback((id: string) => {
    updateLayer(id, { visible: !model.layers.find((l) => l.id === id)?.visible })
  }, [updateLayer, model.layers])

  const toggleLock = useCallback((id: string) => {
    updateLayer(id, { locked: !model.layers.find((l) => l.id === id)?.locked })
  }, [updateLayer, model.layers])

  const moveLayer = useCallback((id: string, x: number, y: number) => {
    updateLayer(id, { x, y })
  }, [updateLayer])

  const resizeLayer = useCallback((id: string, width: number) => {
    updateLayer(id, { width })
  }, [updateLayer])

  const bringForward = useCallback((id: string) => {
    updateModel((m) => {
      const idx = m.layers.findIndex((l) => l.id === id)
      if (idx < 0 || idx >= m.layers.length - 1) return m
      const layers = [...m.layers]
      const [item] = layers.splice(idx, 1)
      layers.splice(idx + 1, 0, item)
      return { ...m, layers }
    })
    addToast({ type: 'info', title: 'Layer Raised', message: 'Moved layer up', duration: 1500 })
  }, [updateModel, addToast])

  const sendBackward = useCallback((id: string) => {
    updateModel((m) => {
      const idx = m.layers.findIndex((l) => l.id === id)
      if (idx <= 0) return m
      const bgOffset = m.layers[0]?.type === 'background' ? 1 : 0
      if (idx <= bgOffset) return m
      const layers = [...m.layers]
      const [item] = layers.splice(idx, 1)
      layers.splice(idx - 1, 0, item)
      return { ...m, layers }
    })
    addToast({ type: 'info', title: 'Layer Lowered', message: 'Moved layer down', duration: 1500 })
  }, [updateModel, addToast])

  const updateLayerDirectText = useCallback((id: string, text: string) => {
    const target = model.layers.find((l) => l.id === id)
    if (!target) return
    if (target.type === 'headline' && activeRound) {
      updateRound(activeRound.id, { headline: text })
    } else if (target.type === 'subheadline' && activeRound) {
      updateRound(activeRound.id, { subheadline: text })
    } else if (target.type === 'label' && activeRound) {
      updateRound(activeRound.id, { labelAr: text })
    } else if (target.type === 'timestamp' && activeRound) {
      updateRound(activeRound.id, { timestamp: text })
    }
    updateLayer(id, target.type === 'label' ? { labelAr: text } : { text })
    addToast({ type: 'info', title: 'Text Updated', message: 'Applied text directly on canvas', duration: 1500 })
  }, [model.layers, activeRound, updateRound, updateLayer, addToast])

  const handleUploadMediaDirect = useCallback(
    async (file: File) => {
      const category = file.type.startsWith('video') ? 'video' : 'image'
      try {
        const up = await uploadAsset(category, file)
        const url = assetUrl(up.category, up.filename)
        if (activeRound) {
          updateRound(activeRound.id, {
            backgroundMedia: {
              url,
              type: category as 'image' | 'video',
              fit: 'cover',
              scale: 1,
              posX: 50,
              posY: 50,
            },
          })
        }
        addToast({
          type: 'success',
          title: 'Media Dropped',
          message: `Applied ${file.name} to background`,
          duration: 2500,
        })
      } catch {
        const blobUrl = URL.createObjectURL(file)
        if (activeRound) {
          updateRound(activeRound.id, {
            backgroundMedia: {
              url: blobUrl,
              type: category as 'image' | 'video',
              fit: 'cover',
              scale: 1,
              posX: 50,
              posY: 50,
            },
          })
        }
        addToast({
          type: 'info',
          title: 'Media Preview',
          message: 'Loaded local preview (backend offline)',
          duration: 2000,
        })
      }
    },
    [activeRound, updateRound, addToast]
  )

  // --- save -------------------------------------------------------------------
  const doSave = useCallback(
    async (silent = false, createVersion = false) => {
      if (!online) {
        setLastSave({ ok: false, error: 'backend unreachable' })
        if (!silent) {
          addToast({
            type: 'error',
            title: 'Backend Offline',
            message: 'Cannot save: backend is unreachable.',
            duration: 4000,
          })
        }
        return
      }

      const saveToastId = 'save-status'
      setSaving(true)
      if (!silent) {
        addToast({
          id: saveToastId,
          type: 'loading',
          title: 'Saving template…',
          message: 'Writing template and HTML code to backend…',
          duration: 0,
        })
      }

      try {
        const { generateTemplateHTML } = await import('../lib/codeGenerator')
        const { html } = generateTemplateHTML(model)
        const rec = await saveTemplate(
          model.id,
          model as unknown as Record<string, unknown>,
          model.name,
          model.description,
          [],
          html,
          createVersion
        )
        setSavedSnap(JSON.stringify(model))
        setLastSave({ ok: true, version: rec.meta.version })
        if (!silent) {
          addToast({
            id: saveToastId,
            type: 'success',
            title: 'Template Saved',
            message: `${rec.meta.name} (v${rec.meta.version}) saved successfully.`,
            duration: 3500,
          })
        }
        onSaved?.(model)
      } catch (e) {
        const reason = (e as Error).message.replace(/^\d+: /, '') || 'request failed'
        setLastSave({ ok: false, error: reason })
        if (!silent) {
          addToast({
            id: saveToastId,
            type: 'error',
            title: 'Save Failed',
            message: reason,
            duration: 4000,
          })
        }
      } finally {
        setSaving(false)
      }
    },
    [model, onSaved, online, addToast]
  )

  // --- Keyboard Shortcuts Manager ---------------------------------------------
  // - Ctrl+Z: Undo
  // - Ctrl+Shift+Z / Ctrl+Y: Redo
  // - Ctrl+S: Quick Save
  // - Ctrl+D: Duplicate selected layer
  // - Space: Toggle Play/Pause
  // - Arrow keys to nudge (Shift = 5x)
  // - Delete/Backspace to delete selected layer
  // - Escape to deselect
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      const tag = target.tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable) {
        return
      }

      const isCtrlOrMeta = e.ctrlKey || e.metaKey

      // Ctrl+Z / Cmd+Z: Undo (when not Shift)
      if (isCtrlOrMeta && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault()
        undo()
        return
      }

      // Ctrl+Shift+Z / Cmd+Shift+Z or Ctrl+Y / Cmd+Y: Redo
      if (
        (isCtrlOrMeta && e.shiftKey && (e.key === 'z' || e.key === 'Z')) ||
        (isCtrlOrMeta && (e.key === 'y' || e.key === 'Y'))
      ) {
        e.preventDefault()
        redo()
        return
      }

      // Ctrl+S / Cmd+S: Quick Save
      if (isCtrlOrMeta && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        doSave(false, true)
        return
      }

      // Ctrl+D / Cmd+D: Duplicate Selected Layer
      if (isCtrlOrMeta && (e.key === 'd' || e.key === 'D')) {
        if (selectedId) {
          e.preventDefault()
          duplicateLayer(selectedId)
        }
        return
      }

      // Space: Toggle Play / Pause
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault()
        if (clock.playing) clock.pause()
        else clock.play()
        return
      }

      // Ctrl+K / Cmd+K: Command Palette
      if (isCtrlOrMeta && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setCommandPaletteOpen((o) => !o)
        return
      }

      // ? or /: Toggle Keyboard Shortcuts Modal
      if (e.key === '?' || (isCtrlOrMeta && e.key === '/')) {
        e.preventDefault()
        setShortcutsOpen((o) => !o)
        return
      }

      // Escape: Deselect Layer / Close Modal
      if (e.key === 'Escape') {
        if (shortcutsOpen) {
          setShortcutsOpen(false)
          return
        }
        setSelectedId(null)
        return
      }

      if (!selectedId) return
      const layer = model.layers.find((l) => l.id === selectedId)
      if (!layer || layer.locked || layer.type === 'background') return

      // Delete / Backspace: Delete Layer
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        deleteLayer(selectedId)
        return
      }

      // Ctrl+] / Ctrl+[: Bring Forward / Send Backward
      if (isCtrlOrMeta && e.key === ']') {
        e.preventDefault()
        bringForward(selectedId)
        return
      }
      if (isCtrlOrMeta && e.key === '[') {
        e.preventDefault()
        sendBackward(selectedId)
        return
      }

      const step = e.shiftKey ? 5 : 1
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        updateLayer(selectedId, { x: Math.max(0, layer.x - step) })
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        updateLayer(selectedId, { x: Math.min(100, layer.x + step) })
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        updateLayer(selectedId, { y: Math.max(0, layer.y - step) })
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        updateLayer(selectedId, { y: Math.min(100, layer.y + step) })
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    selectedId,
    model.layers,
    deleteLayer,
    updateLayer,
    bringForward,
    sendBackward,
    undo,
    redo,
    duplicateLayer,
    doSave,
    clock,
  ])

  // --- auto-save (periodic every 3 minutes when there are unsaved edits) --------
  useEffect(() => {
    if (!dirty || !online || saving) return
    const timer = setInterval(() => {
      doSave(true, false)
    }, 3 * 60 * 1000)
    return () => clearInterval(timer)
  }, [dirty, online, saving, doSave])

  // Cached generated HTML, reused by the unload flush so we don't re-run the generator.
  const generateHtmlSnapshot = useCallback(async () => {
    try {
      const { generateTemplateHTML } = await import('../lib/codeGenerator')
      return generateTemplateHTML(model).html
    } catch {
      return null
    }
  }, [model])

  // --- flush pending changes before the tab closes -----------------------------
  useEffect(() => {
    if (!online) return
    const onUnload = () => {
      if (!dirty) return
      generateHtmlSnapshot().then((html) => {
        if (html) flushSaveTemplate(model.id, model as unknown as Record<string, unknown>, html)
      })
    }
    window.addEventListener('pagehide', onUnload)
    window.addEventListener('beforeunload', onUnload)
    return () => {
      window.removeEventListener('pagehide', onUnload)
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [dirty, online, model, generateHtmlSnapshot])

  // Persistent status chip shown next to the Save button.
  const saveStatus = useMemo(() => {
    if (!online)
      return {
        tone: 'danger',
        icon: WifiOff,
        spin: false,
        text: 'Backend offline',
        detail: 'The backend is unreachable. Start it (uvicorn on :8001), then save. Nothing can be saved locally.',
      }
    if (saving)
      return {
        tone: 'muted',
        icon: Loader2,
        spin: true,
        text: 'Saving…',
        detail: 'Writing template + HTML to the backend…',
      }
    if (lastSave?.ok && !dirty)
      return {
        tone: 'success',
        icon: CheckCircle2,
        spin: false,
        text: 'Saved',
        detail: 'All changes saved to backend and ready for video generation.',
      }
    if (dirty)
      return {
        tone: 'muted',
        icon: CircleAlert,
        spin: false,
        text: 'Unsaved changes',
        detail: 'Auto-saves every 3 minutes, or click Save now.',
      }
    if (lastSave?.error)
      return {
        tone: 'danger',
        icon: AlertTriangle,
        spin: false,
        text: `Save failed — ${lastSave.error}`,
        detail: 'Check the backend and try again.',
      }
    return {
      tone: 'success',
      icon: CheckCircle2,
      spin: false,
      text: 'Saved',
      detail: 'Template is saved and ready for generation.',
    }
  }, [online, saving, lastSave, dirty])

  // --- export HTML --------------------------------------------------------------
  const doExport = useCallback(async () => {
    try {
      const { generateTemplateHTML } = await import('../lib/codeGenerator')
      const { html, filename } = generateTemplateHTML(model)
      const blob = new Blob([html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      addToast({
        type: 'success',
        title: 'Export Complete',
        message: `Downloaded ${filename}`,
        duration: 3000,
      })
    } catch (e) {
      addToast({
        type: 'error',
        title: 'Export Failed',
        message: (e as Error).message,
        duration: 4000,
      })
    }
  }, [model, addToast])

  // --- test render ---------------------------------------------------------------
  const doRender = useCallback(async () => {
    const renderToastId = 'render-status'
    const roundToPayload = (r: TemplateRound): Record<string, unknown> => {
      const p: Record<string, unknown> = {
        headline: r.headline || 'Headline',
        subheadline: r.subheadline || '',
        accentColor: r.accentColor,
        backgroundColor: r.backgroundColor,
        labelAr: r.labelAr || 'NEWS',
        labelEn: r.labelEn || 'ALERT',
        timestamp: r.timestamp || '',
        overlayOpacity: r.overlayOpacity ?? 0.55,
      }
      if (r.duration > 0) p.duration = r.duration
      const media = r.backgroundMedia
      if (media?.url) {
        if (media.type === 'video') p.videoUrl = media.url
        else p.imageUrl = media.url
        p.videoFit = media.fit
        p.videoScale = media.scale
        p.videoPositionX = media.posX
        p.videoPositionY = media.posY
      }
      return p
    }
    const payload: Record<string, unknown> = {
      template: model.id,
      fps: model.fps,
      resolution: { width: model.width, height: model.height },
      rounds: model.rounds.map(roundToPayload),
    }
    // Carry the bumper config so the renderer interleaves intro/interstitial/outro.
    const b = model.bumper
    if (b && b.enabled) {
      payload.bumper = {
        enabled: true,
        showIntro: b.showIntro,
        showInterstitial: b.showInterstitial,
        showOutro: b.showOutro,
        duration: b.duration,
        backgroundColor: b.backgroundColor,
        accentColor: b.accentColor,
        logoImageUrl: b.logoImageUrl || '',
        logoText: b.logoText || 'KASHIDA',
        slogan: b.slogan || '',
      }
    }
    setRender({ busy: true, error: undefined })
    addToast({
      id: renderToastId,
      type: 'loading',
      title: 'Rendering Video…',
      message: 'Dispatching render task to background engine…',
      duration: 0,
    })

    try {
      const task = await requestRender(payload)
      setRender({ busy: true, task })
      const id = task.task_id
      const start = Date.now()
      let current = task
      while (
        current.status !== 'SUCCESS' &&
        current.status !== 'completed' &&
        current.status !== 'FAILURE' &&
        current.status !== 'failed' &&
        Date.now() - start < 120000
      ) {
        await new Promise((r) => setTimeout(r, 2000))
        current = await getRenderStatus(id)
        setRender({ busy: true, task: current })
        if (current.message) {
          addToast({
            id: renderToastId,
            type: 'loading',
            title: 'Rendering Video…',
            message: current.message,
            duration: 0,
          })
        }
      }
      setRender({ busy: false, task: current })
      if (current.status === 'FAILURE' || current.status === 'failed') {
        addToast({
          id: renderToastId,
          type: 'error',
          title: 'Render Failed',
          message: current.error || 'Video rendering failed — check the backend worker logs.',
          duration: 5000,
        })
      } else if (current.status === 'SUCCESS' || current.status === 'completed') {
        addToast({
          id: renderToastId,
          type: 'success',
          title: 'Render Complete',
          message: 'Video rendered successfully! Ready to preview below.',
          duration: 5000,
        })
      }
    } catch (e) {
      setRender({ busy: false, error: (e as Error).message })
      addToast({
        id: renderToastId,
        type: 'error',
        title: 'Render Unavailable',
        message: 'Could not connect to render API. Ensure backend is running.',
        duration: 4000,
      })
    }
  }, [model, addToast])

  const rawUrl = render.task?.output_url || render.task?.video_url
  const renderUrl = rawUrl ? `/videos/${rawUrl.split('/').pop()}` : null

  return (
    <div className="flex h-full flex-col p-3 sm:p-4 gap-3 bg-[#EDF3FA]">
      {/* Sleek Unified Studio Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/95 px-4 py-2.5 shadow-[0_4px_20px_rgba(15,23,42,0.04)] backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to templates"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-xs transition-colors hover:bg-slate-50 hover:border-slate-300 cursor-pointer"
          >
            <ArrowLeft size={16} aria-hidden />
          </button>
          
          <button
            type="button"
            onClick={toggleLayers}
            aria-label={layersCollapsed ? 'Show layers panel' : 'Hide layers panel'}
            title={layersCollapsed ? 'Show layers panel' : 'Hide layers panel'}
            className={`flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition-all cursor-pointer ${
              !layersCollapsed
                ? 'border-[#1E56A0] bg-blue-50/70 text-[#1E56A0]'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300'
            }`}
          >
            <LayersIcon size={15} aria-hidden />
            <span>Layers</span>
          </button>

          {/* Undo / Redo buttons */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={undo}
              disabled={!canUndo(history)}
              aria-label="Undo (Ctrl+Z)"
              title="Undo (Ctrl+Z)"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-xs transition-colors hover:bg-slate-50 hover:border-slate-300 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              <Undo2 size={15} aria-hidden />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={!canRedo(history)}
              aria-label="Redo (Ctrl+Shift+Z, Ctrl+Y)"
              title="Redo (Ctrl+Shift+Z, Ctrl+Y)"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-xs transition-colors hover:bg-slate-50 hover:border-slate-300 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              <Redo2 size={15} aria-hidden />
            </button>
          </div>

          {/* Template Name & Status */}
          <div className="flex h-9 items-center gap-1.5 rounded-xl border border-slate-200/80 bg-slate-50/80 px-2.5 shadow-2xs focus-within:border-[#1E56A0] focus-within:bg-white transition-all min-w-[140px] max-w-[280px]">
            <input
              value={model.name}
              dir="auto"
              aria-label="Template name"
              onChange={(e) => updateTemplate({ name: e.target.value })}
              className="w-full truncate bg-transparent text-xs font-bold text-slate-800 focus:outline-none"
              placeholder="Template name…"
            />
          </div>
        </div>

        {/* Center Cluster: News Rounds Scene Switcher */}
        <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-2xl border border-slate-200/80 shadow-2xs max-w-[480px]">
          <div className="thin-scroll flex items-center gap-1 overflow-x-auto px-1 py-0.5">
            {model.rounds.map((r, i) => {
              const offset = roundOffsets.find((o) => o.id === r.id)
              const isPlayingHere = clock.playing && playingOffset?.id === r.id
              const isSelected = activeRound?.id === r.id

              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setActiveRoundId(r.id)
                    if (offset) clock.seek(offset.start)
                  }}
                  aria-pressed={isSelected}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all shrink-0 cursor-pointer ${
                    isPlayingHere || isSelected
                      ? 'bg-[#1E56A0] text-white shadow-xs'
                      : 'bg-white/90 text-slate-700 hover:bg-white'
                  }`}
                >
                  <span>{`Scene ${i + 1}`}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-semibold ${isPlayingHere || isSelected ? 'bg-white/20 text-white' : 'bg-slate-200/80 text-slate-600'}`}>
                    {r.duration > 0 ? `${r.duration}s` : `${model.duration || 5}s`}
                  </span>
                </button>
              )
            })}
          </div>
          <button
            type="button"
            onClick={addRound}
            title="Add next scene"
            className="flex items-center gap-1 rounded-xl bg-white px-2.5 py-1.5 text-xs font-bold text-[#1E56A0] shadow-2xs hover:bg-blue-50 transition-colors shrink-0 cursor-pointer"
          >
            <Plus size={13} aria-hidden /> + Scene
          </button>
        </div>

        {/* Right Cluster: Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSelectedId(null)
              setBumperActive((b) => !b)
              setBumperFocus((n) => n + 1)
            }}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer ${
              bumperActive
                ? 'bg-[#e63946] text-white shadow-xs'
                : 'border border-slate-200 bg-white text-slate-700 shadow-xs hover:bg-slate-50 hover:border-slate-300'
            }`}
          >
            <Sparkles size={14} className={bumperActive ? 'text-white' : 'text-[#e63946]'} aria-hidden />
            <span>Bumper</span>
          </button>

          <button
            type="button"
            onClick={doExport}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs transition-colors hover:bg-slate-50 hover:border-slate-300 cursor-pointer"
          >
            <Download size={14} aria-hidden />
            <span>Export</span>
          </button>

          <button
            type="button"
            onClick={() => setShortcutsOpen(true)}
            title="Keyboard Shortcuts (?)"
            aria-label="Keyboard Shortcuts"
            className="inline-flex items-center justify-center h-8.5 w-8.5 rounded-xl border border-slate-200 bg-white text-slate-600 shadow-xs transition-colors hover:bg-slate-50 hover:text-slate-900 cursor-pointer"
          >
            <Keyboard size={15} aria-hidden />
          </button>

          <span
            title={saveStatus.detail}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold ${
              saveStatus.tone === 'danger'
                ? 'border-rose-200 bg-rose-50 text-rose-700'
                : saveStatus.tone === 'success'
                  ? 'border-emerald-200/80 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200/80 bg-white text-slate-600'
            }`}
          >
            <saveStatus.icon size={13} className={saveStatus.spin ? 'animate-spin' : 'shrink-0'} aria-hidden />
            <span className="max-w-[140px] truncate">{saveStatus.text}</span>
            {!online && (
              <button
                type="button"
                onClick={() => checkBackend()}
                className="ml-1 rounded-md bg-rose-200/60 px-1.5 py-0.5 text-[10px] font-bold text-rose-800 hover:bg-rose-200 transition-colors cursor-pointer"
                title="Retry connecting to backend"
              >
                Retry
              </button>
            )}
          </span>

          <button
            type="button"
            onClick={() => doSave(false, true)}
            disabled={saving || !online}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs transition-colors hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 cursor-pointer"
          >
            {saving ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Save size={14} aria-hidden />}
            <span>Save</span>
          </button>

          <button
            type="button"
            onClick={doRender}
            disabled={render.busy}
            className="inline-flex items-center gap-2 rounded-xl bg-linear-to-r from-[#1E56A0] to-[#16437E] px-5 py-2 text-xs font-bold text-white shadow-sm transition-all hover:brightness-110 active:scale-98 disabled:opacity-40 cursor-pointer"
          >
            {render.busy ? (
              <Loader2 size={15} className="animate-spin text-white" aria-hidden />
            ) : (
              <Clapperboard size={15} className="text-white" aria-hidden />
            )}
            <span>{render.busy ? 'Rendering…' : 'Generate Video'}</span>
          </button>
        </div>
      </div>

      {/* Canva Dynamic Contextual Property Toolbar */}
      {selectedLayer && selectedLayer.type !== 'background' && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-blue-200/80 bg-linear-to-r from-blue-50/90 via-white/95 to-slate-50/90 px-4 py-2 shadow-sm backdrop-blur-md animate-in slide-in-from-top-1 duration-150">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Layer Type Badge */}
            <span className="rounded-lg bg-[#1E56A0] px-2.5 py-1 text-[11px] font-bold text-white shadow-2xs">
              {LAYER_TYPE_LABELS[selectedLayer.type]}
            </span>

            {/* Typography Controls for text-capable layers */}
            {selectedLayer.type !== 'accentBar' && selectedLayer.type !== 'shape' && (
              <>
                {/* Font Family Selector */}
                <select
                  value={selectedLayer.fontFamily || ARABIC_FONTS[0].family}
                  onChange={(e) => updateLayer(selectedLayer.id, { fontFamily: e.target.value })}
                  className="h-8 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 shadow-2xs hover:border-slate-300 focus:outline-none focus:border-[#1E56A0] cursor-pointer"
                >
                  {ARABIC_FONTS.map((f) => (
                    <option key={f.id} value={f.family}>
                      {f.name}
                    </option>
                  ))}
                </select>

                {/* Font Size Stepper */}
                <div className="flex items-center rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden h-8">
                  <button
                    type="button"
                    onClick={() => updateLayer(selectedLayer.id, { fontSize: Math.max(12, (selectedLayer.fontSize || 48) - 4) })}
                    className="flex h-full w-7 items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  >
                    <Minus size={13} />
                  </button>
                  <input
                    type="number"
                    value={selectedLayer.fontSize || 48}
                    onChange={(e) => updateLayer(selectedLayer.id, { fontSize: Number(e.target.value) || 48 })}
                    className="w-11 text-center text-xs font-bold text-slate-800 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => updateLayer(selectedLayer.id, { fontSize: Math.min(300, (selectedLayer.fontSize || 48) + 4) })}
                    className="flex h-full w-7 items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  >
                    <Plus size={13} />
                  </button>
                </div>

                {/* Text Color Swatch & Picker */}
                <div className="flex items-center gap-1 h-8 rounded-xl border border-slate-200 bg-white px-2 shadow-2xs">
                  <span className="text-[10px] font-bold text-slate-400">Color</span>
                  <input
                    type="color"
                    value={selectedLayer.color || '#ffffff'}
                    onChange={(e) => updateLayer(selectedLayer.id, { color: e.target.value })}
                    className="h-5 w-5 rounded-full border border-slate-200 cursor-pointer p-0 overflow-hidden"
                  />
                </div>

                {/* Font Weight B / M / R */}
                <div className="flex items-center rounded-xl border border-slate-200 bg-white shadow-2xs p-0.5 h-8">
                  {[
                    { w: 700, label: 'B' },
                    { w: 500, label: 'M' },
                    { w: 400, label: 'R' },
                  ].map((fw) => (
                    <button
                      key={fw.w}
                      type="button"
                      onClick={() => updateLayer(selectedLayer.id, { fontWeight: fw.w })}
                      className={`h-full px-2 rounded-lg text-xs font-bold transition-all ${
                        (selectedLayer.fontWeight || 700) === fw.w
                          ? 'bg-[#1E56A0] text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      {fw.label}
                    </button>
                  ))}
                </div>

                {/* Alignment */}
                <div className="flex items-center rounded-xl border border-slate-200 bg-white shadow-2xs p-0.5 h-8">
                  <button
                    type="button"
                    onClick={() => updateLayer(selectedLayer.id, { textAlign: 'start' })}
                    title="Right Align (RTL)"
                    className={`h-full px-2 rounded-lg transition-all ${selectedLayer.textAlign === 'start' ? 'bg-[#1E56A0] text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    <AlignRight size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => updateLayer(selectedLayer.id, { textAlign: 'center' })}
                    title="Center Align"
                    className={`h-full px-2 rounded-lg transition-all ${selectedLayer.textAlign === 'center' ? 'bg-[#1E56A0] text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    <AlignCenter size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => updateLayer(selectedLayer.id, { textAlign: 'end' })}
                    title="Left Align"
                    className={`h-full px-2 rounded-lg transition-all ${selectedLayer.textAlign === 'end' ? 'bg-[#1E56A0] text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    <AlignLeft size={13} />
                  </button>
                </div>

                {/* Kashida Tatweel quick slider */}
                <div className="flex items-center gap-1.5 h-8 rounded-xl border border-slate-200 bg-white px-2.5 shadow-2xs">
                  <span className="text-[11px] font-bold text-slate-600">كشيدة</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={selectedLayer.kashida || 0}
                    onChange={(e) => updateLayer(selectedLayer.id, { kashida: Number(e.target.value) })}
                    className="w-16 h-1 accent-[#1E56A0] cursor-pointer"
                  />
                  <span className="text-[10px] font-bold text-slate-500 w-6">{selectedLayer.kashida || 0}%</span>
                </div>
              </>
            )}

            {/* Shape Controls */}
            {selectedLayer.type === 'shape' && (
              <>
                <div className="flex items-center gap-1 h-8 rounded-xl border border-slate-200 bg-white px-2 shadow-2xs">
                  <span className="text-[10px] font-bold text-slate-400">Fill</span>
                  <input
                    type="color"
                    value={selectedLayer.backgroundColor || model.accentColor}
                    onChange={(e) => updateLayer(selectedLayer.id, { backgroundColor: e.target.value })}
                    className="h-5 w-5 rounded-full border border-slate-200 cursor-pointer p-0 overflow-hidden"
                  />
                </div>

                <div className="flex items-center gap-1.5 h-8 rounded-xl border border-slate-200 bg-white px-2.5 shadow-2xs">
                  <span className="text-[11px] font-bold text-slate-600">Slant X</span>
                  <input
                    type="range"
                    min={-60}
                    max={60}
                    value={selectedLayer.skewX || 0}
                    onChange={(e) => updateLayer(selectedLayer.id, { skewX: Number(e.target.value) })}
                    className="w-16 h-1 accent-[#1E56A0] cursor-pointer"
                  />
                  <span className="text-[10px] font-bold text-slate-500 w-6">{selectedLayer.skewX || 0}°</span>
                </div>
              </>
            )}
          </div>

          {/* Quick Right Action Cluster */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => alignLayerHorizontal(selectedLayer.id)}
              title="Center Horizontally"
              className="flex h-8 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-slate-300 transition-colors"
            >
              <AlignHorizontalJustifyCenter size={13} />
              <span>Center</span>
            </button>
            <button
              type="button"
              onClick={() => duplicateLayer(selectedLayer.id)}
              title="Duplicate (Ctrl+D)"
              className="flex h-8 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-slate-300 transition-colors"
            >
              <Copy size={13} />
              <span>Duplicate</span>
            </button>
            <button
              type="button"
              onClick={() => toggleLock(selectedLayer.id)}
              title={selectedLayer.locked ? 'Unlock' : 'Lock'}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-2xs hover:bg-slate-50 transition-colors"
            >
              {selectedLayer.locked ? <Lock size={13} className="text-amber-500" /> : <LockOpen size={13} />}
            </button>
            {!selectedLayer.locked && (
              <button
                type="button"
                onClick={() => deleteLayer(selectedLayer.id)}
                title="Delete (Del)"
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600 shadow-2xs hover:bg-red-100 transition-colors"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Render result banner */}
      {renderUrl && (
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-2 shadow-sm">
          <video src={renderUrl} controls className="h-28 rounded-lg border border-slate-200" />
          <div className="text-[12px] text-slate-600">
            Render complete — check the <code className="rounded bg-slate-100 px-1">backend/templates/{model.id}.html</code> is present for this to use your template.
          </div>
        </div>
      )}
      {render.error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-[12px] text-red-600">{render.error}</div>
      )}

      {/* Main layout */}
      <div className="flex min-h-0 flex-1 gap-3">
        {/* Docked rail when the layers panel is collapsed */}
        {layersCollapsed && (
          <aside className="w-12 shrink-0 flex flex-col items-center py-4 rounded-[28px] border border-slate-200/80 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
            <button
              type="button"
              onClick={toggleLayers}
              aria-label="Expand layers panel"
              title="Expand layers panel"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-[#1E56A0] transition-colors cursor-pointer"
            >
              <LayersIcon size={16} aria-hidden />
            </button>
          </aside>
        )}
        <aside className={`shrink-0 overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.04)] transition-all duration-200 ease-out ${layersCollapsed ? 'w-0 border-0' : 'w-76'}`}>
          <LayersPanel
            model={model}
            selectedId={selectedId}
            collapsed={layersCollapsed}
            onToggleCollapsed={toggleLayers}
            onSelect={setSelectedId}
            onToggleVisible={toggleVisible}
            onToggleLock={toggleLock}
            onReorder={reorder}
            onReorderToIndex={reorderToIndex}
            onDuplicate={duplicateLayer}
            onDelete={deleteLayer}
            onAdd={addLayer}
            onRename={(id, name) => updateLayer(id, { name })}
          />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="min-h-0 flex-1 overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
            <Canvas
              model={currentDisplayRound ? { ...model, layers: applyRoundToLayers(model.layers, currentDisplayRound) } : model}
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId(id)
                if (id) setBumperActive(false)
              }}
              onMoveLayer={moveLayer}
              onResizeLayer={resizeLayer}
              onRotateLayer={(id, rotation) => updateLayer(id, { rotation })}
              onDuplicateLayer={duplicateLayer}
              onDeleteLayer={deleteLayer}
              onToggleLockLayer={toggleLock}
              onAlignHLayer={alignLayerHorizontal}
              onAlignVLayer={alignLayerVertical}
              onBringForwardLayer={bringForward}
              onSendBackwardLayer={sendBackward}
              onUpdateLayerText={updateLayerDirectText}
              onUploadMedia={handleUploadMediaDirect}
              playheadRef={clock.playheadRef}
              playing={clock.playing}
              roundOffsets={roundOffsets}
              showBumper={bumperActive}
            />
          </div>
          <PlaybackBar
            time={clock.time}
            duration={totalDuration}
            playing={clock.playing}
            play={clock.play}
            pause={clock.pause}
            seek={clock.seek}
            layers={model.layers}
            selectedId={selectedId}
            onSelectLayer={setSelectedId}
            onUpdateAnimation={updateAnimation}
          />
        </main>

        <aside className="w-80 shrink-0 overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
          <Inspector
            model={model}
            selectedId={selectedId}
            activeRound={activeRound}
            updateLayer={updateLayer}
            updateAnimation={updateAnimation}
            updateTemplate={updateTemplate}
            updateRound={updateRound}
            duplicateRound={duplicateRound}
            deleteRound={deleteRound}
            moveRound={moveRound}
            duplicateLayer={duplicateLayer}
            alignLayerH={alignLayerHorizontal}
            alignLayerV={alignLayerVertical}
            bumperFocus={bumperFocus}
            onBumperOpenChange={setBumperActive}
          />
        </aside>
      </div>

      {/* Toast Container */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Keyboard Shortcuts Cheatsheet Modal */}
      {shortcutsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setShortcutsOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-[#1E56A0]">
                  <Keyboard size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Keyboard Shortcuts</h3>
                  <p className="text-xs text-slate-500 font-medium">Quick studio actions & productivity navigation</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShortcutsOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2.5 text-xs">
              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5">
                <span className="font-semibold text-slate-700">Play / Pause</span>
                <kbd className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-slate-800 shadow-2xs">Space</kbd>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5">
                <span className="font-semibold text-slate-700">Save Template</span>
                <kbd className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-slate-800 shadow-2xs">Ctrl + S</kbd>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5">
                <span className="font-semibold text-slate-700">Undo Action</span>
                <kbd className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-slate-800 shadow-2xs">Ctrl + Z</kbd>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5">
                <span className="font-semibold text-slate-700">Redo Action</span>
                <kbd className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-slate-800 shadow-2xs">Ctrl + Y</kbd>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5">
                <span className="font-semibold text-slate-700">Duplicate Layer</span>
                <kbd className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-slate-800 shadow-2xs">Ctrl + D</kbd>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5">
                <span className="font-semibold text-slate-700">Delete Layer</span>
                <kbd className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-slate-800 shadow-2xs">Del / Backspace</kbd>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5">
                <span className="font-semibold text-slate-700">Nudge Position</span>
                <kbd className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-slate-800 shadow-2xs">Arrow Keys</kbd>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5">
                <span className="font-semibold text-slate-700">Fast Nudge (5%)</span>
                <kbd className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-slate-800 shadow-2xs">Shift + Arrows</kbd>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5">
                <span className="font-semibold text-slate-700">Bring Forward</span>
                <kbd className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-slate-800 shadow-2xs">Ctrl + ]</kbd>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5">
                <span className="font-semibold text-slate-700">Send Backward</span>
                <kbd className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-slate-800 shadow-2xs">Ctrl + [</kbd>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5">
                <span className="font-semibold text-slate-700">Clone on Drag</span>
                <kbd className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-slate-800 shadow-2xs">Alt + Drag</kbd>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5">
                <span className="font-semibold text-slate-700">Inline Edit Text</span>
                <kbd className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-slate-800 shadow-2xs">Double Click</kbd>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5">
                <span className="font-semibold text-slate-700">Command Palette</span>
                <kbd className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-slate-800 shadow-2xs">Ctrl + K</kbd>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShortcutsOpen(false)}
                className="rounded-xl bg-[#1E56A0] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#16437E] transition-colors cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Command Palette (Ctrl+K / Cmd+K) */}
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        model={model}
        selectedId={selectedId}
        activeRound={activeRound}
        onSelectLayer={setSelectedId}
        onAddLayer={addLayer}
        onUpdateLayer={updateLayer}
        onUpdateTemplate={updateTemplate}
        onAddRound={addRound}
        onDuplicateRound={duplicateRound}
        onTogglePlay={() => {
          if (clock.playing) clock.pause()
          else clock.play()
        }}
        onSave={() => doSave(false, true)}
        onExport={doRender}
      />
    </div>
  )
}
