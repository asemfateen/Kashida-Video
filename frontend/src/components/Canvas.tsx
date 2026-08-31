// Live preview canvas (1080×1920) with drag-to-move, click-to-select, and
// imperative Web-Animations scrubbing driven by the playback clock's playhead
// ref (so layers don't re-render on every frame).

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Grid3x3,
  RotateCcw,
  Sparkles,
  RotateCw,
  Copy,
  Trash2,
  Lock,
  LockOpen,
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  ArrowUp,
  ArrowDown,
  Edit3,
} from 'lucide-react'
import type { Layer, TemplateModel, TextAlign } from '../lib/model'
import { CSS_EASING, waaiKeyframes } from '../lib/animations'
import { playheadToAnimTime } from '../lib/preview'

function cssAlign(ta: TextAlign): 'right' | 'left' | 'center' {
  return ta === 'start' ? 'right' : ta === 'end' ? 'left' : 'center'
}

type Registry = Map<string, (t: number, isNextRound?: boolean) => void>

interface LayerViewProps {
  layer: Layer
  index: number
  selected: boolean
  accent: string
  onSelect: (id: string) => void
  onMove: (id: string, x: number, y: number) => void
  onResize?: (id: string, width: number) => void
  onRotate?: (id: string, rotation: number) => void
  onDuplicate?: (id: string) => void
  onDelete?: (id: string) => void
  onToggleLock?: (id: string) => void
  onAlignH?: (id: string) => void
  onAlignV?: (id: string) => void
  onBringForward?: (id: string) => void
  onSendBackward?: (id: string) => void
  onUpdateText?: (id: string, text: string) => void
  onContextMenu?: (e: ReactMouseEvent, id: string) => void
  registry: Registry
  playheadRef: MutableRefObject<number>
  onDragStateChange?: (dragging: boolean, layerX?: number, layerY?: number, layerW?: number) => void
}

const LayerView = memo(function LayerView({
  layer,
  index,
  selected,
  accent,
  onSelect,
  onMove,
  onResize,
  onRotate,
  onDuplicate,
  onDelete,
  onToggleLock,
  onAlignH,
  onAlignV,
  onBringForward,
  onSendBackward,
  onUpdateText,
  onContextMenu,
  registry,
  playheadRef,
  onDragStateChange,
}: LayerViewProps) {
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const animRef = useRef<Animation | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isRotating, setIsRotating] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(layer.text || layer.labelAr || '')
  const [currentRotation, setCurrentRotation] = useState<number | null>(null)
  const dragState = useRef<{ px: number; py: number; ox: number; oy: number; moved: boolean } | null>(null)

  useEffect(() => {
    setEditText(layer.text || layer.labelAr || '')
  }, [layer.text, layer.labelAr])

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleDoubleClick = useCallback((e: ReactMouseEvent) => {
    if (layer.locked || layer.type === 'background' || layer.type === 'accentBar') return
    e.stopPropagation()
    setIsEditing(true)
  }, [layer.locked, layer.type])

  const handleCommitText = useCallback(() => {
    setIsEditing(false)
    if (onUpdateText && editText !== (layer.text || layer.labelAr || '')) {
      onUpdateText(layer.id, editText)
    }
  }, [onUpdateText, layer.id, editText, layer.text, layer.labelAr])

  // Create/register the entrance animation.
  useEffect(() => {
    const el = ref.current
    if (!el || layer.animation.type === 'none') {
      if (animRef.current) {
        animRef.current.cancel()
        animRef.current = null
      }
      registry.delete(layer.id)
      return
    }
    const kfs = waaiKeyframes(layer.animation.type)
    const anim = el.animate(kfs, {
      duration: Math.max(10, layer.animation.duration * 1000),
      easing: CSS_EASING[layer.animation.easing],
      fill: 'both',
    })
    anim.pause()
    animRef.current = anim

    const apply = (timeInRound: number, isNextRound?: boolean) => {
      if (layer.animateFirstRoundOnly && isNextRound) {
        anim.currentTime = Math.max(10, layer.animation.duration * 1000)
        return
      }
      // In design mode (timeInRound === 999), show layers in fully visible completed entrance state
      if (timeInRound >= 900) {
        anim.currentTime = Math.max(10, layer.animation.duration * 1000)
        return
      }
      const ct = playheadToAnimTime(layer, timeInRound)
      if (ct !== null) {
        anim.currentTime = Math.max(0, Math.min(layer.animation.duration * 1000, ct))
      }
    }

    registry.set(layer.id, apply)
    apply(playheadRef.current === 0 ? 999 : playheadRef.current, false)

    return () => {
      registry.delete(layer.id)
      anim.cancel()
      animRef.current = null
    }
  }, [
    layer.id,
    layer.animation.type,
    layer.animation.duration,
    layer.animation.delay,
    layer.animation.easing,
    layer.animateFirstRoundOnly,
    playheadRef,
    registry,
  ])

  const startDrag = useCallback(
    (e: ReactPointerEvent) => {
      if (layer.locked || layer.type === 'background') return
      e.stopPropagation()
      e.preventDefault()
      const rect = ref.current?.parentElement?.getBoundingClientRect()
      if (!rect) return
      setIsDragging(true)
      onDragStateChange?.(true, layer.x, layer.y, layer.width)
      dragState.current = { px: e.clientX, py: e.clientY, ox: layer.x, oy: layer.y, moved: false }
      const move = (ev: PointerEvent) => {
        const st = dragState.current
        if (!st || !rect) return
        const dx = ((ev.clientX - st.px) / rect.width) * 100
        const dy = ((ev.clientY - st.py) / rect.height) * 100
        if (Math.abs(ev.clientX - st.px) + Math.abs(ev.clientY - st.py) > 2) st.moved = true
        let targetX = clamp(st.ox + dx, 0, 100)
        let targetY = clamp(st.oy + dy, 0, 100)
        
        // Smart magnetic center snapping (Canva style)
        const centerX = targetX + (layer.width ? layer.width / 2 : 0)
        if (Math.abs(centerX - 50) < 1.5) {
          targetX = 50 - (layer.width ? layer.width / 2 : 0)
        }
        if (Math.abs(targetY - 50) < 1.5) {
          targetY = 50
        }

        onMove(layer.id, targetX, targetY)
        onDragStateChange?.(true, targetX, targetY, layer.width)
      }
      const up = () => {
        setIsDragging(false)
        onDragStateChange?.(false)
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [layer.id, layer.locked, layer.type, layer.x, layer.y, layer.width, onMove, onDragStateChange],
  )

  const startCornerResize = useCallback(
    (e: ReactPointerEvent, corner: 'se' | 'sw' | 'ne' | 'nw') => {
      if (layer.locked || layer.type === 'background' || !onResize) return
      e.stopPropagation()
      e.preventDefault()
      const rect = ref.current?.parentElement?.getBoundingClientRect()
      if (!rect) return
      const startX = e.clientX
      const startWidth = layer.width ?? 80
      const move = (ev: PointerEvent) => {
        const sign = corner === 'se' || corner === 'ne' ? 1 : -1
        const dx = ((ev.clientX - startX) / rect.width) * 100 * sign
        onResize(layer.id, clamp(Math.round(startWidth + dx), 10, 100))
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [layer.id, layer.locked, layer.type, layer.width, onResize],
  )

  const startRotate = useCallback(
    (e: ReactPointerEvent) => {
      if (layer.locked || layer.type === 'background' || !onRotate) return
      e.stopPropagation()
      e.preventDefault()
      const rect = ref.current?.getBoundingClientRect()
      if (!rect) return
      setIsRotating(true)
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const initialAngle = layer.rotation || 0
      const startPointerAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI)

      const move = (ev: PointerEvent) => {
        const currentPointerAngle = Math.atan2(ev.clientY - cy, ev.clientX - cx) * (180 / Math.PI)
        const diff = currentPointerAngle - startPointerAngle
        let newAngle = Math.round((initialAngle + diff) % 360)
        if (newAngle > 180) newAngle -= 360
        if (newAngle < -180) newAngle += 360
        // Snapping within 3 degrees
        if (Math.abs(newAngle) <= 3) newAngle = 0
        else if (Math.abs(newAngle - 45) <= 3) newAngle = 45
        else if (Math.abs(newAngle + 45) <= 3) newAngle = -45
        else if (Math.abs(newAngle - 90) <= 3) newAngle = 90
        else if (Math.abs(newAngle + 90) <= 3) newAngle = -90
        else if (Math.abs(Math.abs(newAngle) - 180) <= 3) newAngle = 180
        setCurrentRotation(newAngle)
        onRotate(layer.id, newAngle)
      }

      const up = () => {
        setIsRotating(false)
        setCurrentRotation(null)
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }

      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [layer.id, layer.locked, layer.type, layer.rotation, onRotate],
  )

  const handleClick = useCallback(
    (e: ReactMouseEvent) => {
      e.stopPropagation()
      if (dragState.current?.moved) return
      onSelect(layer.id)
    },
    [onSelect, layer.id],
  )

  const hasPillBg = layer.backgroundColor && layer.type !== 'accentBar' && layer.type !== 'card' && layer.type !== 'label' && layer.type !== 'shape'
  const shadowStyle = layer.textShadow === '3d'
    ? '0 4px 0 #000, 0 8px 20px rgba(0,0,0,0.8)'
    : layer.textShadow === 'glow'
    ? `0 0 20px ${layer.color || '#fff'}, 0 0 40px ${accent}`
    : layer.textShadow === 'subtle'
    ? '0 2px 8px rgba(0,0,0,0.6)'
    : undefined

  const transforms: string[] = []
  if (layer.rotation) transforms.push(`rotate(${layer.rotation}deg)`)
  if (layer.skewX) transforms.push(`skewX(${layer.skewX}deg)`)
  if (layer.skewY) transforms.push(`skewY(${layer.skewY}deg)`)
  const transform = transforms.length > 0 ? transforms.join(' ') : undefined

  let shapeBg = layer.backgroundColor || accent || '#1E56A0'
  if (layer.fillType === 'gradient') {
    const start = layer.gradientColorStart || accent || '#1E56A0'
    const end = layer.gradientColorEnd || '#E63946'
    const angle = layer.gradientAngle ?? 135
    shapeBg = `linear-gradient(${angle}deg, ${start}, ${end})`
  } else if (layer.fillType === 'glass') {
    shapeBg = layer.backgroundColor || 'rgba(15,23,42,0.75)'
  }

  const shapeRadius = layer.shapeType === 'circle' ? '50%' : layer.shapeType === 'pill' ? '9999px' : layer.borderRadius ? `${layer.borderRadius}px` : '20px'
  const shapeBlur = layer.backdropBlur || (layer.fillType === 'glass' ? 16 : undefined)
  const shapeBorder = layer.strokeWidth
    ? `${layer.strokeWidth}px ${layer.strokeStyle || 'solid'} ${layer.strokeColor || '#ffffff'}`
    : layer.border || undefined

  const shapeShadows: string[] = []
  if (layer.shadowBlur) {
    shapeShadows.push(`${layer.shadowOffsetX ?? 0}px ${layer.shadowOffsetY ?? 10}px ${layer.shadowBlur}px ${layer.shadowColor || 'rgba(0,0,0,0.5)'}`)
  }
  if (layer.glowSpread) {
    shapeShadows.push(`0 0 ${layer.glowSpread}px ${layer.glowColor || accent}`)
  }
  const shapeShadow = shapeShadows.length > 0 ? shapeShadows.join(', ') : undefined

  const style: CSSProperties = {
    left: layer.type === 'background' ? 0 : `${layer.x}%`,
    top: layer.type === 'background' ? 0 : `${layer.y}%`,
    width: layer.type === 'background' ? '100%' : layer.width && layer.width > 0 ? `${layer.width}%` : 'auto',
    height: layer.type === 'background' ? '100%' : layer.height ? `${layer.height}px` : undefined,
    textAlign: cssAlign(layer.textAlign),
    fontSize: layer.fontSize,
    fontWeight: layer.fontWeight,
    fontFamily: layer.fontFamily || undefined,
    textShadow: shadowStyle,
    WebkitTextStroke: layer.textStroke || undefined,
    backgroundImage: layer.gradient || undefined,
    WebkitBackgroundClip: layer.gradient ? 'text' : undefined,
    WebkitTextFillColor: layer.gradient ? 'transparent' : undefined,
    color: layer.color,
    backgroundColor: layer.type === 'shape' ? shapeBg : hasPillBg ? layer.backgroundColor : undefined,
    borderRadius: layer.type === 'shape' ? shapeRadius : layer.borderRadius ? `${layer.borderRadius}px` : undefined,
    border: layer.type === 'shape' ? shapeBorder : undefined,
    backdropFilter: layer.type === 'shape' && shapeBlur ? `blur(${shapeBlur}px)` : undefined,
    boxShadow: layer.type === 'shape' ? shapeShadow : hasPillBg ? '0 8px 24px rgba(0,0,0,0.35)' : undefined,
    transform: transform,
    padding: hasPillBg ? '12px 24px' : undefined,
    display: hasPillBg || layer.type === 'shape' ? 'inline-flex' : undefined,
    alignItems: hasPillBg || layer.type === 'shape' ? 'center' : undefined,
    justifyContent: hasPillBg || layer.type === 'shape' ? (layer.textAlign === 'center' ? 'center' : layer.textAlign === 'end' ? 'flex-end' : 'flex-start') : undefined,
    opacity: layer.opacity,
    zIndex: index + 2,
    cursor: layer.type === 'background' ? 'pointer' : layer.locked ? 'default' : isDragging ? 'grabbing' : 'grab',
  }

  return (
    <div
      ref={ref}
      className={`el group ${selected ? 'ring-0' : 'hover:outline-1 hover:outline-dashed hover:outline-[#1E56A0]/40'}`}
      data-layer-type={layer.type}
      style={style}
      onPointerDown={startDrag}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onContextMenu?.(e, layer.id)
      }}
    >
      {isEditing ? (
        <textarea
          ref={inputRef}
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={handleCommitText}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleCommitText()
            } else if (e.key === 'Escape') {
              setIsEditing(false)
              setEditText(layer.text || layer.labelAr || '')
            }
          }}
          className="pointer-events-auto relative z-50 w-full resize-none bg-black/60 backdrop-blur-md border-2 border-dashed border-[#1E56A0] rounded-xl p-2 outline-none text-white font-inherit shadow-2xl"
          rows={Math.max(1, (editText.match(/\n/g) || []).length + 1)}
          dir="rtl"
        />
      ) : (
        <>
          {layer.type === 'shape' ? (
            <div className="relative w-full h-full flex items-center justify-center select-none">
              {layer.shapeType === 'speech-bubble' && (
                <div className="absolute -bottom-4 right-8 w-0 h-0 border-t-[16px] border-t-current border-l-[16px] border-l-transparent" style={{ color: layer.backgroundColor || accent }} />
              )}
              {layer.text && <span className="p-4">{layer.text}</span>}
            </div>
          ) : null}
          {layer.widgetType === 'breaking_ticker' ? (
            <div className="flex items-center gap-4 bg-red-600 px-6 py-2 rounded-xl font-black text-white shadow-2xl">
              <span className="bg-white text-red-600 px-3 py-1 rounded-md text-[0.75em] uppercase font-black animate-pulse">عاجل</span>
              <span className="text-[1.05em]">{layer.text || 'خبر عاجل'}</span>
            </div>
          ) : layer.widgetType === 'speaker_card' ? (
            <div className="flex items-center gap-4 bg-slate-950/90 backdrop-blur-md px-6 py-3 rounded-2xl border-r-4 shadow-2xl" style={{ borderColor: accent }}>
              <div className="flex flex-col text-right">
                <span className="text-[1.15em] font-black text-white">{layer.text?.split('·')[0]?.trim() || layer.text || 'صاحب التصريح'}</span>
                {layer.text?.includes('·') && (
                  <span className="text-[0.85em] font-bold mt-0.5" style={{ color: accent }}>{layer.text.split('·')[1]?.trim()}</span>
                )}
              </div>
            </div>
          ) : layer.widgetType === 'progress_bar' ? (
            <div className="w-full h-2.5 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ background: accent, width: '60%' }} />
            </div>
          ) : layer.type === 'label' ? (
            layer.labelAr?.includes('مونديال') ? (
              <span className="inline-flex relative drop-shadow-[0_14px_28px_rgba(0,0,0,0.55)]">
                <span className="inline-flex flex-row items-stretch rounded-r-full overflow-hidden" style={{ height: 76, background: layer.backgroundColor || '#7C3AED' }} dir="ltr">
                  <span className="relative flex flex-col items-center justify-center bg-black px-3.5 py-1 text-white rounded-tl-xl">
                    <svg viewBox="0 0 44 54" width="44" height="54" fill="none">
                      <text x="7" y="24" fontFamily="'Plus Jakarta Sans', Arial, sans-serif" fontWeight="900" fontSize="28" fill="#FFFFFF">2</text>
                      <text x="25" y="24" fontFamily="'Plus Jakarta Sans', Arial, sans-serif" fontWeight="900" fontSize="28" fill="#FFFFFF">6</text>
                      <path d="M18 6C18 4 20 2 22 2C24 2 26 4 26 6C26 8 28 10 28 14C28 18 24 21 22 21C20 21 16 18 16 14C16 10 18 8 18 6Z" fill="#F59E0B"/>
                      <path d="M19 21H25V28H19V21Z" fill="#D97706"/>
                      <rect x="17" y="28" width="10" height="4" rx="1" fill="#FFFFFF"/>
                      <text x="22" y="44" fontFamily="'Plus Jakarta Sans', Arial, sans-serif" fontWeight="900" fontSize="10" fill="#FFFFFF" textAnchor="middle" letterSpacing="1.5">FIFA</text>
                    </svg>
                    {/* Speech bubble tail pointing down-left */}
                    <span className="absolute -bottom-4 left-0 w-0 h-0 border-t-[16px] border-t-black border-r-[18px] border-r-transparent" />
                  </span>
                  <span className="flex items-center justify-center px-8 text-[38px] font-black text-white tracking-widest font-sans" dir="rtl">
                    {layer.labelAr.replace(/🏆/g, '').trim()}
                  </span>
                </span>
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-3 px-4 py-1 leading-none text-white shadow-xs"
                style={{ background: layer.backgroundColor || accent }}
              >
                <span style={{ fontSize: layer.fontSize, fontWeight: 700 }}>{layer.labelAr || ''}</span>
                <span style={{ fontSize: Math.round(layer.fontSize * 0.6), fontWeight: 700, opacity: 0.85, letterSpacing: 2 }}>{layer.labelEn || ''}</span>
              </span>
            )
          ) : null}
          {layer.type === 'accentBar' && <div style={{ width: '100%', height: layer.height ?? 1920, background: layer.backgroundColor || accent }} />}
          {layer.type === 'card' && (
            <div
              className="w-full shadow-2xl transition-all"
              style={{
                height: layer.height ?? 420,
                background: layer.backgroundColor || 'rgba(15,23,42,0.85)',
                border: layer.border || '2px solid rgba(255,183,3,0.3)',
                borderRadius: layer.borderRadius ?? 28,
                backdropFilter: `blur(${layer.backdropBlur ?? 16}px)`,
              }}
            >
              {layer.text && <div className="p-6">{layer.text}</div>}
            </div>
          )}
          {layer.type === 'timestamp' && layer.text?.includes('@') ? (
            <div className="flex flex-col items-end gap-1">
              <div className="inline-flex flex-row items-stretch overflow-hidden rounded-lg shadow-lg" dir="ltr">
                <span className="bg-[#0B0F19] px-2.5 py-1 text-[18px] font-bold text-white font-sans">
                  {layer.text.split('·')[0]?.trim().replace(/🎥/g, '').trim()}
                </span>
                <span className="flex items-center justify-center bg-[#EA580C] px-2 text-white text-[14px]">
                  📹
                </span>
              </div>
              <div className="text-[16px] font-bold text-white drop-shadow-md font-sans tracking-wide text-right">
                {layer.text.split('·')[1]?.trim() ?? '2026-07-10'}
              </div>
            </div>
          ) : null}
          {layer.type === 'subheadline' && layer.text?.includes('📍') ? (
            <div className="inline-flex items-center gap-2.5 drop-shadow-[0_4px_10px_rgba(0,0,0,0.7)]">
              <span className="text-[32px] font-black text-white tracking-wide font-sans">
                {layer.text.replace(/📍/g, '').trim()}
              </span>
              <span className="flex flex-col items-center relative">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="#FFFFFF">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                </svg>
                <span className="w-4 h-1 bg-[#7C3AED] rounded-full -mt-0.5" />
              </span>
            </div>
          ) : null}
          {layer.type === 'logo' && layer.imageUrl ? (
            <img src={layer.imageUrl} alt="logo" style={{ width: '100%', height: 'auto', objectFit: 'contain' }} />
          ) : (
            (layer.type !== 'timestamp' || !layer.text?.includes('@')) &&
            (layer.type !== 'subheadline' || !layer.text?.includes('📍')) &&
            layer.type !== 'label' &&
            layer.type !== 'card' &&
            layer.type !== 'accentBar' &&
            !layer.widgetType ? (
              (layer.type === 'headline' || layer.type === 'subheadline' || layer.type === 'logo' || layer.type === 'footer' || layer.type === 'timestamp') && (
                <span>
                  {layer.animation.type === 'word-stagger' && layer.text ? (
                    layer.text.trim().split(/\s+/).map((w, wi) => (
                      <span key={wi} className="inline-block px-1">
                        {w}{' '}
                      </span>
                    ))
                  ) : (
                    layer.text || ''
                  )}
                </span>
              )
            ) : null
          )}
        </>
      )}

      {/* Live drag coordinates badge */}
      {isDragging && (
        <div className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 rounded-full bg-[#0B1528] px-3 py-1 text-[11px] font-bold text-white shadow-lg backdrop-blur-md">
          <span>X: {Math.round(layer.x)}%</span>
          <span className="opacity-40">·</span>
          <span>Y: {Math.round(layer.y)}%</span>
          {layer.width ? (
            <>
              <span className="opacity-40">·</span>
              <span>W: {Math.round(layer.width)}%</span>
            </>
          ) : null}
        </div>
      )}

      {/* Canva-Grade Selection Bounding Box & Handles */}
      {selected && layer.type !== 'background' && (
        <div className="pointer-events-none absolute -inset-1 rounded-sm border-2 border-[#1E56A0] shadow-[0_0_0_1px_rgba(255,255,255,0.95)]">
          {/* Floating Canva Quick Action Mini-Toolbar */}
          <div className="pointer-events-auto absolute -top-12 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 rounded-2xl border border-slate-800/60 bg-[#0B1528]/95 px-2 py-1 shadow-2xl backdrop-blur-md">
            {(layer.type === 'headline' || layer.type === 'subheadline' || layer.type === 'label' || layer.type === 'timestamp' || layer.type === 'footer') && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setIsEditing(true) }}
                title="Edit text (Double Click)"
                className="flex h-7 w-7 items-center justify-center rounded-xl text-slate-300 hover:bg-white/15 hover:text-white transition-colors cursor-pointer"
              >
                <Edit3 size={13} />
              </button>
            )}
            {onDuplicate && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDuplicate(layer.id) }}
                title="Duplicate layer (Ctrl+D / Alt+Drag)"
                className="flex h-7 w-7 items-center justify-center rounded-xl text-slate-300 hover:bg-white/15 hover:text-white transition-colors cursor-pointer"
              >
                <Copy size={13} />
              </button>
            )}
            {onBringForward && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onBringForward(layer.id) }}
                title="Bring forward (Ctrl+])"
                className="flex h-7 w-7 items-center justify-center rounded-xl text-slate-300 hover:bg-white/15 hover:text-white transition-colors cursor-pointer"
              >
                <ArrowUp size={13} />
              </button>
            )}
            {onSendBackward && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSendBackward(layer.id) }}
                title="Send backward (Ctrl+[)"
                className="flex h-7 w-7 items-center justify-center rounded-xl text-slate-300 hover:bg-white/15 hover:text-white transition-colors cursor-pointer"
              >
                <ArrowDown size={13} />
              </button>
            )}
            {onAlignH && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onAlignH(layer.id) }}
                title="Center horizontally"
                className="flex h-7 w-7 items-center justify-center rounded-xl text-slate-300 hover:bg-white/15 hover:text-white transition-colors cursor-pointer"
              >
                <AlignHorizontalJustifyCenter size={13} />
              </button>
            )}
            {onAlignV && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onAlignV(layer.id) }}
                title="Center vertically"
                className="flex h-7 w-7 items-center justify-center rounded-xl text-slate-300 hover:bg-white/15 hover:text-white transition-colors cursor-pointer"
              >
                <AlignVerticalJustifyCenter size={13} />
              </button>
            )}
            {onToggleLock && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onToggleLock(layer.id) }}
                title={layer.locked ? 'Unlock layer' : 'Lock layer'}
                className="flex h-7 w-7 items-center justify-center rounded-xl text-slate-300 hover:bg-white/15 hover:text-white transition-colors cursor-pointer"
              >
                {layer.locked ? <Lock size={13} className="text-amber-400" /> : <LockOpen size={13} />}
              </button>
            )}
            {onDelete && !layer.locked && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(layer.id) }}
                title="Delete layer (Del)"
                className="flex h-7 w-7 items-center justify-center rounded-xl text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors cursor-pointer"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>

          {/* 4 Corner Resize Handles (Canva Pill-Dots) */}
          <div
            className="pointer-events-auto absolute -left-2 -top-2 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-[#1E56A0] bg-white shadow-md hover:scale-125 transition-transform"
            onPointerDown={(e) => startCornerResize(e, 'nw')}
            title="Drag to resize"
          />
          <div
            className="pointer-events-auto absolute -right-2 -top-2 h-4 w-4 cursor-nesw-resize rounded-full border-2 border-[#1E56A0] bg-white shadow-md hover:scale-125 transition-transform"
            onPointerDown={(e) => startCornerResize(e, 'ne')}
            title="Drag to resize"
          />
          <div
            className="pointer-events-auto absolute -left-2 -bottom-2 h-4 w-4 cursor-nesw-resize rounded-full border-2 border-[#1E56A0] bg-white shadow-md hover:scale-125 transition-transform"
            onPointerDown={(e) => startCornerResize(e, 'sw')}
            title="Drag to resize"
          />
          <div
            className="pointer-events-auto absolute -right-2 -bottom-2 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-[#1E56A0] bg-white shadow-md hover:scale-125 transition-transform"
            onPointerDown={(e) => startCornerResize(e, 'se')}
            title="Drag to resize"
          />

          {/* Left & Right Edge Resize Bars */}
          <div
            className="pointer-events-auto absolute -left-1.5 top-1/2 -translate-y-1/2 h-6 w-2.5 cursor-ew-resize rounded-full border-2 border-[#1E56A0] bg-white shadow-xs hover:scale-110 transition-transform"
            onPointerDown={(e) => startCornerResize(e, 'sw')}
            title="Resize width"
          />
          <div
            className="pointer-events-auto absolute -right-1.5 top-1/2 -translate-y-1/2 h-6 w-2.5 cursor-ew-resize rounded-full border-2 border-[#1E56A0] bg-white shadow-xs hover:scale-110 transition-transform"
            onPointerDown={(e) => startCornerResize(e, 'se')}
            title="Resize width"
          />

          {/* Canva Floating Rotation Stem & Knob */}
          <div className="pointer-events-auto absolute -bottom-9 left-1/2 -translate-x-1/2 flex flex-col items-center">
            <div className="h-4 w-0.5 border-l-2 border-dashed border-[#1E56A0]" />
            <div
              className="group relative flex h-6 w-6 cursor-grab active:cursor-grabbing items-center justify-center rounded-full border-2 border-[#1E56A0] bg-white shadow-lg hover:scale-125 hover:bg-blue-50 transition-transform"
              onPointerDown={startRotate}
              title="Drag to rotate 360°"
            >
              <RotateCw size={11} className="text-[#1E56A0]" />
              {/* Angle Tooltip during rotation */}
              {(isRotating || layer.rotation) && (
                <div className="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 z-50 rounded-md bg-[#0B1528] px-2 py-0.5 text-[10px] font-bold text-white shadow-md whitespace-nowrap">
                  {currentRotation ?? layer.rotation ?? 0}°
                </div>
              )}
            </div>
          </div>

          {/* Layer Name Tag */}
          <div className="absolute -top-6.5 left-0 flex items-center gap-1 rounded-t-md bg-[#1E56A0] px-2 py-0.5 text-[10px] font-bold text-white shadow-xs">
            <span>{layer.name}</span>
          </div>
        </div>
      )}
    </div>
  )
})

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function BumperCanvasView({
  model,
}: {
  model: TemplateModel
}) {
  const bumper = model.bumper
  const anim = bumper?.animation ?? { type: 'zoom-in', duration: 0.6, easing: 'ease-out', delay: 0 }
  const bg = bumper?.backgroundColor || model.backgroundColor || '#0b0b0f'
  const accent = bumper?.accentColor || model.accentColor || '#e63946'

  const logoRef = useRef<HTMLDivElement>(null)
  const sloganRef = useRef<HTMLDivElement>(null)
  const accRef = useRef<HTMLDivElement>(null)
  const [replayKey, setReplayKey] = useState(0)

  useEffect(() => {
    const ease = CSS_EASING[anim.easing] ?? 'cubic-bezier(0.16, 1, 0.3, 1)'
    const logo = logoRef.current
    const slogan = sloganRef.current
    const acc = accRef.current

    ;[logo, slogan, acc].forEach((el) => el?.getAnimations().forEach((a) => a.cancel()))

    if (logo && anim.type !== 'none') {
      logo.animate(waaiKeyframes(anim.type), {
        duration: Math.max(10, anim.duration * 1000),
        easing: ease,
        fill: 'both',
        delay: (anim.delay ?? 0) * 1000,
      })
    }
    if (slogan) {
      slogan.animate(
        [
          { opacity: 0, transform: 'translateY(30px)' },
          { opacity: 1, transform: 'translateY(0px)' },
        ],
        {
          duration: 600,
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
          fill: 'both',
          delay: ((anim.delay ?? 0) + 0.15) * 1000,
        }
      )
    }
    if (acc) {
      acc.animate(
        [
          { opacity: 0, transform: 'scaleX(0)' },
          { opacity: 1, transform: 'scaleX(1)' },
        ],
        {
          duration: 400,
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
          fill: 'both',
        }
      )
    }
  }, [anim, bumper, replayKey])

  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden select-none"
      style={{ background: bg }}
    >
      {/* Top Accent Bar */}
      <div
        ref={accRef}
        className="absolute top-0 left-0 h-4 w-full origin-center shadow-lg"
        style={{ background: accent }}
      />

      {/* Floating Mode Badge & Replay Button */}
      <div className="absolute top-24 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-full border border-white/20 bg-slate-950/80 px-4 py-2 text-xs font-bold text-white shadow-xl backdrop-blur-md">
        <Sparkles size={14} className="text-[#e63946]" />
        <span>Brand Bumper Preview</span>
        <button
          type="button"
          onClick={() => setReplayKey((k) => k + 1)}
          className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-white/20 transition-colors cursor-pointer ml-1"
        >
          <RotateCcw size={11} />
          <span>Replay</span>
        </button>
      </div>

      {/* Brand Logo */}
      <div ref={logoRef} className="flex flex-col items-center justify-center px-12 text-center">
        {bumper?.logoImageUrl ? (
          <img
            src={bumper.logoImageUrl}
            alt="Bumper Logo"
            className="max-h-56 max-w-full object-contain drop-shadow-[0_20px_40px_rgba(0,0,0,0.8)]"
          />
        ) : (
          <h1 className="text-[96px] font-black tracking-widest text-white drop-shadow-[0_15px_30px_rgba(0,0,0,0.8)]">
            {bumper?.logoText || 'KASHIDA'}
          </h1>
        )}
      </div>

      {/* Slogan */}
      {bumper?.slogan ? (
        <div
          ref={sloganRef}
          className="mt-8 px-12 text-center text-[38px] font-bold text-white/90 drop-shadow-md font-sans tracking-wide"
        >
          {bumper.slogan}
        </div>
      ) : null}

      {/* Bottom Accent Bar */}
      <div
        className="absolute bottom-0 left-0 h-4 w-full opacity-60 shadow-lg"
        style={{ background: accent }}
      />
    </div>
  )
}

interface CanvasProps {
  model: TemplateModel
  selectedId: string | null
  onSelect: (id: string | null) => void
  onMoveLayer: (id: string, x: number, y: number) => void
  onResizeLayer?: (id: string, width: number) => void
  onRotateLayer?: (id: string, rotation: number) => void
  onDuplicateLayer?: (id: string) => void
  onDeleteLayer?: (id: string) => void
  onToggleLockLayer?: (id: string) => void
  onAlignHLayer?: (id: string) => void
  onAlignVLayer?: (id: string) => void
  onBringForwardLayer?: (id: string) => void
  onSendBackwardLayer?: (id: string) => void
  onUpdateLayerText?: (id: string, text: string) => void
  playheadRef: MutableRefObject<number>
  playing: boolean
  roundOffsets?: { id: string; start: number; duration: number }[]
  showBumper?: boolean
}

type Zoom = 'fit' | number

function ControlBtn({ onClick, active, label, children }: { onClick: () => void; active?: boolean; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex h-7 items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold transition-all ${
        active ? 'bg-[#1E56A0] text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      {children}
    </button>
  )
}

export function Canvas({
  model,
  selectedId,
  onSelect,
  onMoveLayer,
  onResizeLayer,
  onRotateLayer,
  onDuplicateLayer,
  onDeleteLayer,
  onToggleLockLayer,
  onAlignHLayer,
  onAlignVLayer,
  onBringForwardLayer,
  onSendBackwardLayer,
  onUpdateLayerText,
  playheadRef,
  playing,
  roundOffsets,
  showBumper,
}: CanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const registry = useRef<Registry>(new Map()).current
  const bgVideoRef = useRef<HTMLVideoElement>(null)
  const [fitScale, setFitScale] = useState(0.3)
  const [zoom, setZoom] = useState<Zoom>('fit')
  const [guides, setGuides] = useState(false)
  const [activeGuide, setActiveGuide] = useState<{ v?: boolean; h?: boolean } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; layerId: string } | null>(null)
  const isVertical = model.width === 1080 && model.height === 1920

  const handleContextMenu = useCallback((e: ReactMouseEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    onSelect(id)
    setContextMenu({ x: e.clientX, y: e.clientY, layerId: id })
  }, [onSelect])

  useEffect(() => {
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close()
    })
    return () => {
      window.removeEventListener('click', close)
    }
  }, [])

  const handleDragStateChange = useCallback((dragging: boolean, lx?: number, ly?: number, lw?: number) => {
    if (!dragging || lx === undefined || ly === undefined) {
      setActiveGuide(null)
      return
    }
    const cx = lx + (lw ? lw / 2 : 0)
    const nearV = Math.abs(cx - 50) < 1.8
    const nearH = Math.abs(ly - 50) < 1.8
    setActiveGuide(nearV || nearH ? { v: nearV, h: nearH } : null)
  }, [])

  // Compute the "fit to screen" scale (maximize available workspace).
  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    const compute = () => {
      const padX = 16
      const padY = 16
      const availW = Math.max(100, host.clientWidth - padX)
      const availH = Math.max(100, host.clientHeight - padY)
      const extra = isVertical ? 32 : 0
      const scaleX = availW / (model.width + extra)
      const scaleY = availH / (model.height + extra)
      const base = Math.min(scaleX, scaleY)
      setFitScale(Math.max(0.15, base))
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(host)
    return () => ro.disconnect()
  }, [model.width, model.height, isVertical])

  // Drive continuous animation updates to registered layer animations using requestAnimationFrame.
  useEffect(() => {
    let raf = 0
    const loop = () => {
      const globalTime = playheadRef.current
      const seg = roundOffsets?.find((r) => globalTime >= r.start && globalTime < r.start + r.duration)
      const timeInRound = seg ? globalTime - seg.start : globalTime
      const isNextRound = seg ? roundOffsets && roundOffsets.indexOf(seg) > 0 : false

      registry.forEach((apply) => {
        apply(playing ? timeInRound : (globalTime === 0 ? 999 : timeInRound), isNextRound)
      })

      // Sync background video element to current playhead
      if (bgVideoRef.current && bgVideoRef.current.readyState >= 1) {
        const v = bgVideoRef.current
        const vidDur = v.duration || 5
        const targetTime = timeInRound % vidDur
        if (Math.abs(v.currentTime - targetTime) > 0.15) {
          v.currentTime = targetTime
        }
        if (playing && v.paused) {
          v.play().catch(() => {})
        } else if (!playing && !v.paused) {
          v.pause()
        }
      }

      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playheadRef, registry, roundOffsets, playing])

  const scale = zoom === 'fit' ? fitScale : zoom
  const zoomBy = (dir: -1 | 1) => {
    const steps = [0.25, 0.33, 0.5, 0.75, 1, 1.5]
    const cur = scale
    const next = dir > 0 ? steps.find((s) => s > cur + 0.02) ?? 2 : [...steps].reverse().find((s) => s < cur - 0.02) ?? 0.2
    setZoom(next)
  }
  const setPercent = (pct: number) => setZoom(pct)

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const delta = -e.deltaY
      const factor = delta > 0 ? 1.08 : 0.92
      setZoom((cur) => {
        const curScale = cur === 'fit' ? fitScale : cur
        return Math.max(0.15, Math.min(2.5, curScale * factor))
      })
    }
  }, [fitScale])

  const bgLayer = model.layers.find((l) => l.type === 'background')
  const media = bgLayer?.backgroundMedia
  const sorted = [...model.layers].sort((a, b) => {
    const ab = a.type === 'background' ? -1 : 1
    const bb = b.type === 'background' ? -1 : 1
    return ab - bb || 0
  })

  return (
    <div className="relative flex h-full w-full flex-col bg-[#F8FAFC]">
      {/* Docked Viewport controls — floating bottom-right utility pill */}
      <div className="absolute bottom-4 right-4 z-30 flex items-center gap-1 rounded-xl border border-slate-200/90 bg-white/95 px-2 py-1 shadow-md backdrop-blur-md">
        <ControlBtn label="Fit to screen" active={zoom === 'fit'} onClick={() => setZoom('fit')}>
          <Maximize2 size={12} aria-hidden /> Fit
        </ControlBtn>
        <ControlBtn label="100%" active={zoom === 1} onClick={() => setPercent(1)}>100%</ControlBtn>
        <ControlBtn label="50%" active={zoom === 0.5} onClick={() => setPercent(0.5)}>50%</ControlBtn>
        <div className="mx-1 h-4 w-px bg-slate-200" aria-hidden />
        <ControlBtn label="Zoom out" onClick={() => zoomBy(-1)}><ZoomOut size={13} aria-hidden /></ControlBtn>
        <span className="w-11 text-center text-[11px] tabular-nums font-semibold text-slate-600">{Math.round(scale * 100)}%</span>
        <ControlBtn label="Zoom in" onClick={() => zoomBy(1)}><ZoomIn size={13} aria-hidden /></ControlBtn>
        <div className="mx-1 h-4 w-px bg-slate-200" aria-hidden />
        <ControlBtn label="Toggle 9:16 safe-zone guides" active={guides} onClick={() => setGuides((g) => !g)}>
          <Grid3x3 size={12} aria-hidden /> Guides
        </ControlBtn>
      </div>

      {/* Scrollable viewport */}
      <div
        ref={hostRef}
        onWheel={handleWheel}
        className="thin-scroll relative min-h-0 flex-1 overflow-auto flex items-center justify-center p-3"
      >
        {isVertical ? (
          <div className="m-auto" style={{ width: (model.width + 32) * scale, height: (model.height + 32) * scale }}>
            {/* Realistic iPhone Device Chassis matching kashida.io */}
            <div
              className="absolute origin-top-left rounded-[56px] p-4 bg-[#0F172A] shadow-[0_30px_80px_-15px_rgba(15,23,42,0.4)] ring-1 ring-white/20 transition-transform duration-100 ease-out"
              style={{ width: model.width + 32, height: model.height + 32, transform: `scale(${scale})` }}
            >
              {/* Dynamic Island Notch */}
              <div className="absolute top-5 left-1/2 -translate-x-1/2 h-7 w-36 bg-black rounded-full z-50 flex items-center justify-between px-3.5 shadow-md">
                <div className="w-3.5 h-3.5 rounded-full bg-[#1e293b] ring-1 ring-white/10" />
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#030712] ring-1 ring-white/10" />
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                </div>
              </div>

              {/* Status Bar Indicators */}
              <div className="absolute top-6 left-10 right-10 flex items-center justify-between z-40 text-[14px] font-bold text-white/90 select-none pointer-events-none">
                <span>19:30</span>
                <div className="flex items-center gap-2 text-xs">
                  <span>5G</span>
                  <div className="w-5 h-2.5 rounded-xs border border-white/80 p-0.5 flex items-center"><div className="h-full w-full bg-white rounded-2xs" /></div>
                </div>
              </div>

              {/* Exact 1080x1920 Physical Screen */}
              <div className="overflow-hidden rounded-[44px] bg-black relative" style={{ width: model.width, height: model.height }}>
                {/* Magnetic Smart Laser Guide Lines */}
                {activeGuide?.v && (
                  <div className="pointer-events-none absolute left-1/2 top-0 h-full w-[2px] -translate-x-1/2 bg-[#E11D48] shadow-[0_0_8px_#E11D48] z-50 animate-pulse" />
                )}
                {activeGuide?.h && (
                  <div className="pointer-events-none absolute top-1/2 left-0 w-full h-[2px] -translate-y-1/2 bg-[#E11D48] shadow-[0_0_8px_#E11D48] z-50 animate-pulse" />
                )}

                {showBumper ? (
                  <BumperCanvasView model={model} />
                ) : (
                  <div
                    className="relative h-full w-full"
                    style={{ width: model.width, height: model.height, background: model.backgroundColor }}
                    dir="rtl"
                    onClick={() => onSelect(null)}
                  >
                    {media?.url ? (
                      media.type === 'video' ? (
                        <video ref={bgVideoRef} className="absolute inset-0 h-full w-full" style={{ objectFit: media.fit, transform: `scale(${media.scale})`, objectPosition: `${media.posX}% ${media.posY}%` }} src={media.url} muted playsInline />
                      ) : (
                        <img className="absolute inset-0 h-full w-full" style={{ objectFit: media.fit, transform: `scale(${media.scale})`, objectPosition: `${media.posX}% ${media.posY}%` }} src={media.url} alt="" />
                      )
                    ) : null}
                    {bgLayer && bgLayer.overlayOpacity !== undefined && (
                      <div
                        className="pointer-events-none absolute inset-0"
                        style={{
                          opacity: bgLayer.overlayOpacity,
                          background: 'linear-gradient(180deg, rgba(11,11,15,0.25) 0%, rgba(11,11,15,0.15) 40%, rgba(11,11,15,0.9) 100%)',
                        }}
                      />
                    )}
                    {sorted
                      .filter((l) => l.visible)
                      .map((l, i) => (
                        <LayerView
                          key={l.id}
                          layer={l}
                          index={i}
                          selected={selectedId === l.id}
                          accent={model.accentColor}
                          onSelect={onSelect}
                          onMove={onMoveLayer}
                          onResize={onResizeLayer}
                          onRotate={onRotateLayer}
                          onDuplicate={onDuplicateLayer}
                          onDelete={onDeleteLayer}
                          onToggleLock={onToggleLockLayer}
                          onAlignH={onAlignHLayer}
                          onAlignV={onAlignVLayer}
                          onBringForward={onBringForwardLayer}
                          onSendBackward={onSendBackwardLayer}
                          onUpdateText={onUpdateLayerText}
                          onContextMenu={handleContextMenu}
                          registry={registry}
                          playheadRef={playheadRef}
                          onDragStateChange={handleDragStateChange}
                        />
                      ))}
                    {guides && (
                      <div className="pointer-events-none absolute inset-0 z-20">
                        <div className="absolute inset-[6%] border border-dashed border-primary/50" />
                        <div className="absolute left-1/2 top-0 h-full w-px bg-primary/25" />
                        <div className="absolute left-0 top-1/2 h-px w-full bg-primary/25" />
                      </div>
                    )}
                    <div className="pointer-events-none absolute bottom-2 right-3 text-[11px] text-white/40">
                      {model.width}×{model.height}{playing ? ' · playing' : ''}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="m-auto" style={{ width: model.width * scale, height: model.height * scale }}>
            {/* Standard Artboard Screen for 1:1, 16:9, etc. */}
            <div
              className="absolute origin-top-left overflow-hidden rounded-[24px] shadow-[0_20px_50px_rgba(15,23,42,0.25)] ring-1 ring-slate-900/10 relative"
              style={{ width: model.width, height: model.height, transform: `scale(${scale})`, background: model.backgroundColor }}
              dir="rtl"
              onClick={() => onSelect(null)}
            >
              {/* Magnetic Smart Laser Guide Lines */}
              {activeGuide?.v && (
                <div className="pointer-events-none absolute left-1/2 top-0 h-full w-[2px] -translate-x-1/2 bg-[#E11D48] shadow-[0_0_8px_#E11D48] z-50 animate-pulse" />
              )}
              {activeGuide?.h && (
                <div className="pointer-events-none absolute top-1/2 left-0 w-full h-[2px] -translate-y-1/2 bg-[#E11D48] shadow-[0_0_8px_#E11D48] z-50 animate-pulse" />
              )}

              {media?.url ? (
                media.type === 'video' ? (
                  <video ref={bgVideoRef} className="absolute inset-0 h-full w-full" style={{ objectFit: media.fit, transform: `scale(${media.scale})`, objectPosition: `${media.posX}% ${media.posY}%` }} src={media.url} muted playsInline />
                ) : (
                  <img className="absolute inset-0 h-full w-full" style={{ objectFit: media.fit, transform: `scale(${media.scale})`, objectPosition: `${media.posX}% ${media.posY}%` }} src={media.url} alt="" />
                )
              ) : null}
              {bgLayer && bgLayer.overlayOpacity !== undefined && (
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    opacity: bgLayer.overlayOpacity,
                    background: 'linear-gradient(180deg, rgba(11,11,15,0.25) 0%, rgba(11,11,15,0.15) 40%, rgba(11,11,15,0.9) 100%)',
                  }}
                />
              )}
              {sorted
                .filter((l) => l.visible)
                .map((l, i) => (
                  <LayerView
                    key={l.id}
                    layer={l}
                    index={i}
                    selected={selectedId === l.id}
                    accent={model.accentColor}
                    onSelect={onSelect}
                    onMove={onMoveLayer}
                    onResize={onResizeLayer}
                    onRotate={onRotateLayer}
                    onDuplicate={onDuplicateLayer}
                    onDelete={onDeleteLayer}
                    onToggleLock={onToggleLockLayer}
                    onAlignH={onAlignHLayer}
                    onAlignV={onAlignVLayer}
                    onBringForward={onBringForwardLayer}
                    onSendBackward={onSendBackwardLayer}
                    onUpdateText={onUpdateLayerText}
                    onContextMenu={handleContextMenu}
                    playheadRef={playheadRef}
                    registry={registry}
                    onDragStateChange={handleDragStateChange}
                  />
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Figma / Canva Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[180px] overflow-hidden rounded-2xl border border-slate-700/80 bg-[#0B1528]/95 p-1 text-xs text-slate-200 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100"
          style={{ top: Math.min(window.innerHeight - 240, contextMenu.y), left: Math.min(window.innerWidth - 200, contextMenu.x) }}
          onClick={(e) => e.stopPropagation()}
        >
          {onDuplicateLayer && (
            <button
              type="button"
              onClick={() => { onDuplicateLayer(contextMenu.layerId); setContextMenu(null) }}
              className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Copy size={13} className="text-slate-400" />
                <span>Duplicate</span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">Ctrl+D</span>
            </button>
          )}
          {onBringForwardLayer && (
            <button
              type="button"
              onClick={() => { onBringForwardLayer(contextMenu.layerId); setContextMenu(null) }}
              className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <ArrowUp size={13} className="text-slate-400" />
                <span>Bring Forward</span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">Ctrl+]</span>
            </button>
          )}
          {onSendBackwardLayer && (
            <button
              type="button"
              onClick={() => { onSendBackwardLayer(contextMenu.layerId); setContextMenu(null) }}
              className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <ArrowDown size={13} className="text-slate-400" />
                <span>Send Backward</span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">Ctrl+[</span>
            </button>
          )}
          <div className="my-1 h-px bg-slate-800" />
          {onAlignHLayer && (
            <button
              type="button"
              onClick={() => { onAlignHLayer(contextMenu.layerId); setContextMenu(null) }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
            >
              <AlignHorizontalJustifyCenter size={13} className="text-slate-400" />
              <span>Center Horizontally</span>
            </button>
          )}
          {onAlignVLayer && (
            <button
              type="button"
              onClick={() => { onAlignVLayer(contextMenu.layerId); setContextMenu(null) }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
            >
              <AlignVerticalJustifyCenter size={13} className="text-slate-400" />
              <span>Center Vertically</span>
            </button>
          )}
          {onToggleLockLayer && (
            <button
              type="button"
              onClick={() => { onToggleLockLayer(contextMenu.layerId); setContextMenu(null) }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
            >
              <Lock size={13} className="text-slate-400" />
              <span>Lock / Unlock</span>
            </button>
          )}
          {onDeleteLayer && (
            <>
              <div className="my-1 h-px bg-slate-800" />
              <button
                type="button"
                onClick={() => { onDeleteLayer(contextMenu.layerId); setContextMenu(null) }}
                className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Trash2 size={13} />
                  <span>Delete</span>
                </div>
                <span className="text-[10px] text-red-400/60 font-mono">Del</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
