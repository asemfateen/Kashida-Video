// PlaybackBar — Premiere / DaVinci Resolve-style Timeline Sequencer
// - Global Playback & Scrubbing
// - Timecode Ruler with tick marks
// - Draggable Layer Clips (Slide in-point / delay)
// - Left & Right Trim Handles (Adjust delay & stretch duration)
// - Unified Vertical Playhead Needle across all tracks

import { Play, Pause, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react'
import { useState, useRef, useCallback, type PointerEvent as ReactPointerEvent } from 'react'
import type { Layer, EntranceAnimation } from '../lib/model'

export interface RoundOffset {
  id: string
  name: string
  start: number
  duration: number
  // A clip may be a news round or a brand bumper segment. Bumpers render as a
  // distinct "logo" clip in the sequencer and are not selectable as a round.
  kind?: 'round' | 'bumper'
}

interface Props {
  time: number
  duration: number
  playing: boolean
  play: () => void
  pause: () => void
  seek: (t: number) => void
  layers: Layer[]
  selectedId?: string | null
  onSelectLayer?: (id: string) => void
  onUpdateAnimation?: (id: string, patch: Partial<EntranceAnimation>) => void
}

function fmt(t: number): string {
  const s = Math.max(0, t)
  const m = Math.floor(s / 60)
  const sec = (s % 60).toFixed(1)
  return `${m}:${sec.padStart(4, '0')}`
}

function roundTo(v: number, decimals = 2): number {
  const factor = Math.pow(10, decimals)
  return Math.round(v * factor) / factor
}

export function PlaybackBar({
  time,
  duration,
  playing,
  play,
  pause,
  seek,
  layers,
  selectedId,
  onSelectLayer,
  onUpdateAnimation,
}: Props) {
  const tracks = layers.filter((l) => l.visible && l.animation.type !== 'none' && l.type !== 'background')
  const trackLaneRef = useRef<HTMLDivElement>(null)

  // Dragging state for clips (Premiere / DaVinci trim & slide)
  const [activeDrag, setActiveDrag] = useState<{
    layerId: string
    mode: 'move' | 'trim-left' | 'trim-right'
    startDelay: number
    startDuration: number
    startX: number
  } | null>(null)

  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const [collapsed, setCollapsed] = useState(true)

  const safeDuration = Math.max(0.1, duration)
  const pct = (t: number) => (Math.max(0, Math.min(safeDuration, t)) / safeDuration) * 100

  // Convert pixel delta or clientX to timeline seconds
  const clientXToTime = useCallback(
    (clientX: number) => {
      const rect = trackLaneRef.current?.getBoundingClientRect()
      if (!rect || rect.width <= 0) return 0
      const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      return roundTo(fraction * safeDuration)
    },
    [safeDuration]
  )

  // Ruler & Track Area Scrub Handler (click/drag playhead)
  const handleRulerPointerDown = (e: ReactPointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const t = clientXToTime(e.clientX)
    seek(t)

    const onPointerMove = (ev: PointerEvent) => {
      seek(clientXToTime(ev.clientX))
    }
    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  // Clip Interaction (Move Delay, Trim Left, Trim Right)
  const handleClipPointerDown = (
    e: ReactPointerEvent,
    layer: Layer,
    mode: 'move' | 'trim-left' | 'trim-right'
  ) => {
    if (!onUpdateAnimation) return
    e.preventDefault()
    e.stopPropagation()
    onSelectLayer?.(layer.id)

    const rect = trackLaneRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return

    const startDelay = layer.animation.delay
    const startDuration = layer.animation.duration
    const startX = e.clientX

    setActiveDrag({
      layerId: layer.id,
      mode,
      startDelay,
      startDuration,
      startX,
    })

    const onPointerMove = (ev: PointerEvent) => {
      const deltaPx = ev.clientX - startX
      const deltaSec = (deltaPx / rect.width) * safeDuration

      if (mode === 'move') {
        const maxDelay = Math.max(0, safeDuration - startDuration)
        const newDelay = roundTo(Math.max(0, Math.min(maxDelay, startDelay + deltaSec)))
        onUpdateAnimation(layer.id, { delay: newDelay })
      } else if (mode === 'trim-left') {
        const newDelay = roundTo(Math.max(0, Math.min(startDelay + startDuration - 0.2, startDelay + deltaSec)))
        const newDuration = roundTo(Math.max(0.2, startDuration - (newDelay - startDelay)))
        onUpdateAnimation(layer.id, { delay: newDelay, duration: newDuration })
      } else if (mode === 'trim-right') {
        const maxDuration = Math.max(0.2, safeDuration - startDelay)
        const newDuration = roundTo(Math.max(0.2, Math.min(maxDuration, startDuration + deltaSec)))
        onUpdateAnimation(layer.id, { duration: newDuration })
      }
    }

    const onPointerUp = () => {
      setActiveDrag(null)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  // Ruler tick generator (every 1 second major ticks, 0.5s sub-ticks)
  const ticks = []
  for (let s = 0; s <= safeDuration + 0.01; s += 0.5) {
    const isMajor = Math.abs(s - Math.round(s)) < 0.05
    ticks.push({ time: s, isMajor })
  }

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-2.5 shadow-[0_4px_20px_rgba(15,23,42,0.04)] backdrop-blur-md">
      {/* Sleek Single-Row Media Player Bar */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => (playing ? pause() : play())}
          aria-label={playing ? 'Pause' : 'Play'}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#1E56A0] text-white shadow-xs transition-all hover:bg-[#16437E] active:bg-[#123666] cursor-pointer"
        >
          {playing ? <Pause size={15} aria-hidden /> : <Play size={15} aria-hidden className="ml-0.5" />}
        </button>

        <div className="flex items-center gap-1 shrink-0 text-[12px] font-bold tabular-nums">
          <span className="text-slate-900">{fmt(time)}</span>
          <span className="text-slate-300 font-normal">/</span>
          <span className="text-slate-400 font-medium">{fmt(safeDuration)}</span>
        </div>

        <div className="flex-1 px-2">
          <input
            type="range"
            aria-label="Timeline scrubber"
            min={0}
            max={safeDuration}
            step={0.01}
            value={Math.min(time, safeDuration)}
            onChange={(e) => seek(parseFloat(e.target.value))}
            className="w-full cursor-pointer accent-[#1E56A0]"
          />
        </div>

        <div className="flex items-center gap-1.5 shrink-0 pl-2 border-l border-slate-100">
          <button
            type="button"
            onClick={() => seek(0)}
            title="Restart playback"
            aria-label="Restart playback"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
          >
            <RotateCcw size={14} aria-hidden />
          </button>

          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            title={collapsed ? 'Show keyframe tracks' : 'Hide keyframe tracks'}
            className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-all cursor-pointer ${
              !collapsed
                ? 'bg-blue-50 text-[#1E56A0] border border-[#1E56A0]/30'
                : 'border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            {collapsed ? <ChevronUp size={13} aria-hidden /> : <ChevronDown size={13} aria-hidden />}
            <span>Tracks</span>
          </button>
        </div>
      </div>

      {/* DaVinci / Premiere Style Track Sequencer */}
      {!collapsed && tracks.length > 0 && (
        <div className="relative mt-3.5 border-t border-slate-100 pt-2.5">
          {/* Sequencer Header Bar */}
          <div className="mb-2 flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Timeline Sequencer</span>
              <span className="text-[10px] text-slate-400">· Drag clip body to move delay, drag edges [ ] to trim duration</span>
            </div>
            {activeDrag && (
              <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-[#1E56A0]">
                {activeDrag.mode === 'move' ? 'Sliding clip delay' : 'Trimming entrance duration'}
              </span>
            )}
          </div>

          {/* Timeline Grid Container */}
          <div className="flex items-stretch rounded-xl border border-slate-200/90 bg-slate-50/50 overflow-hidden shadow-2xs">
            {/* Left Track Names Column */}
            <div className="w-36 shrink-0 border-r border-slate-200/80 bg-white/90 divide-y divide-slate-100">
              <div className="h-6 flex items-center px-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100/60">
                Tracks
              </div>
              {tracks.map((l) => {
                const isSelected = selectedId === l.id
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => onSelectLayer?.(l.id)}
                    className={`flex h-7 w-full items-center px-2.5 text-left transition-colors truncate text-[11px] ${
                      isSelected ? 'bg-blue-50 text-[#1E56A0] font-bold' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                    }`}
                  >
                    <span className="truncate">{l.name}</span>
                  </button>
                )
              })}
            </div>

            {/* Right Sequencer Tracks & Ruler */}
            <div
              ref={trackLaneRef}
              className="relative flex-1 bg-slate-50/60 cursor-crosshair select-none"
              onPointerDown={handleRulerPointerDown}
              onPointerMove={(e) => setHoverTime(clientXToTime(e.clientX))}
              onPointerLeave={() => setHoverTime(null)}
            >
              {/* Vertical Time Grid Lines across track lanes */}
              <div className="pointer-events-none absolute inset-0 z-0">
                {ticks.map((t, idx) => (
                  <div
                    key={idx}
                    className={`absolute top-0 bottom-0 ${t.isMajor ? 'border-l border-slate-200/70' : 'border-l border-slate-100/50'}`}
                    style={{ left: `${pct(t.time)}%` }}
                  />
                ))}
              </div>

              {/* Timecode Ruler */}
              <div className="relative h-6 border-b border-slate-200/80 bg-white/70 z-10">
                {ticks.map((t, idx) => (
                  <div
                    key={idx}
                    className="absolute top-0 flex flex-col items-center pointer-events-none"
                    style={{ left: `${pct(t.time)}%` }}
                  >
                    <div className={`w-px ${t.isMajor ? 'h-3 bg-slate-400' : 'h-1.5 bg-slate-200'}`} />
                    {t.isMajor && (
                      <span className="text-[9px] font-semibold tabular-nums text-slate-400 mt-0.5 -translate-x-1/2">
                        {fmt(t.time)}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Clip Track Lanes */}
              <div className="relative z-10 divide-y divide-slate-200/40">
                {tracks.map((l) => {
                  const isSelected = selectedId === l.id
                  const startPct = pct(l.animation.delay)
                  const endPct = pct(l.animation.delay + l.animation.duration)
                  const widthPct = Math.max(1, endPct - startPct)

                  return (
                    <div key={l.id} className="relative h-7 flex items-center px-1">
                      {/* Draggable / Trimmable Clip Block (Fully Rounded Pill) */}
                      <div
                        style={{ left: `${startPct}%`, width: `${widthPct}%` }}
                        onPointerDown={(e) => handleClipPointerDown(e, l, 'move')}
                        className={`group absolute top-1 bottom-1 flex items-center justify-between rounded-full cursor-grab active:cursor-grabbing border shadow-xs transition-colors overflow-hidden ${
                          isSelected
                            ? 'bg-[#1E56A0] border-[#16437E] text-white ring-2 ring-[#1E56A0]/20'
                            : 'bg-[#1E56A0]/85 border-[#1E56A0] text-white hover:bg-[#1E56A0]'
                        }`}
                        title={`${l.name} · Delay: ${l.animation.delay}s · Duration: ${l.animation.duration}s`}
                      >
                        {/* Left Trim Handle */}
                        <div
                          onPointerDown={(e) => handleClipPointerDown(e, l, 'trim-left')}
                          className="h-full w-2.5 flex items-center justify-center cursor-w-resize bg-black/10 hover:bg-black/30 rounded-l-full"
                          title="Trim in-point (delay)"
                        >
                          <span className="text-[7px] font-bold opacity-70">◂</span>
                        </div>

                        {/* Clip Label */}
                        <div className="flex-1 min-w-0 px-1 truncate text-center text-[10px] font-bold">
                          <span className="truncate">{l.animation.type}</span>
                          <span className="ml-1 opacity-80 tabular-nums text-[9px]">({l.animation.duration}s)</span>
                        </div>

                        {/* Right Trim Handle */}
                        <div
                          onPointerDown={(e) => handleClipPointerDown(e, l, 'trim-right')}
                          className="h-full w-2.5 flex items-center justify-center cursor-e-resize bg-black/10 hover:bg-black/30 rounded-r-full"
                          title="Trim out-point (duration)"
                        >
                          <span className="text-[7px] font-bold opacity-70">▸</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Hover Playhead Needle Ghost */}
              {hoverTime !== null && (
                <div
                  className="pointer-events-none absolute inset-y-0 w-px bg-slate-400/50 z-20"
                  style={{ left: `${pct(hoverTime)}%` }}
                />
              )}

              {/* Premiere / DaVinci Continuous Red Playhead Needle with Teardrop Cap */}
              <div
                className="pointer-events-none absolute inset-y-0 w-0.5 bg-rose-500 z-30 shadow-xs"
                style={{ left: `${pct(time)}%` }}
              >
                {/* Playhead Teardrop / Pill Top Cap */}
                <div className="absolute -top-2.5 -left-[7px] flex h-5 w-4 items-center justify-center rounded-t-full rounded-b-xs bg-rose-500 shadow-md">
                  <div className="h-1.5 w-1 rounded-full bg-white/90" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
