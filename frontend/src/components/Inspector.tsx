// Inspector — property editor for the selected layer (or template settings).
// Uses friendly widgets only; no code surface.

import { useEffect, useRef, useState } from 'react'
import { UploadCloud, RefreshCw, RotateCcw, AlignHorizontalJustifyCenter, AlignVerticalJustifyCenter, Copy, ChevronLeft, ChevronRight, Trash2, Play, Sparkles } from 'lucide-react'
import type { EntranceAnimation, BumperExitAnimation, Layer, TemplateModel, TemplateRound, BackgroundMedia, BumperConfig } from '../lib/model'
import { LAYER_TYPE_LABELS, ANIMATION_LABELS, EASING_LABELS, defaultBumper, ASPECT_RATIOS } from '../lib/model'
import { CSS_EASING, waaiKeyframes, waaiOutKeyframes } from '../lib/animations'
import { ARABIC_FONTS } from '../lib/fonts'
import { BROADCAST_PALETTES } from '../lib/palettes'
import { extractHarmonicPalette, type ExtractedHarmonicPalette } from '../lib/colorExtractor'
import { Field, TextInput, NumberInput, Slider, ColorInput, Select, Segmented, Section, Button } from './ui'
import { listAssets, uploadAsset, assetUrl, type Asset } from '../lib/api'
import { useBackendOnline } from '../lib/useBackend'

interface Props {
  model: TemplateModel
  selectedId: string | null
  activeRound: TemplateRound | undefined
  updateLayer: (id: string, patch: Partial<Layer>) => void
  updateAnimation: (id: string, patch: Partial<EntranceAnimation>) => void
  updateTemplate: (patch: Partial<TemplateModel>) => void
  updateRound: (id: string, patch: Partial<TemplateRound>) => void
  duplicateRound?: (id: string) => void
  deleteRound?: (id: string) => void
  moveRound?: (id: string, dir: -1 | 1) => void
  duplicateLayer?: (id: string) => void
  alignLayerH?: (id: string) => void
  alignLayerV?: (id: string) => void
  // Incrementing counter that forces the Bumper section open + into view.
  bumperFocus?: number
  // Notifies the parent when the Bumper editor card opens/closes, so it can show
  // a persistent bumper preview on the canvas while editing transitions.
  onBumperOpenChange?: (open: boolean) => void
}

// Quick entrance presets — one tap sets type + duration + easing (+ delay 0).
const ANIM_PRESETS: { label: string; anim: EntranceAnimation }[] = [
  { label: 'Words Stagger', anim: { type: 'word-stagger', duration: 0.5, easing: 'ease-out', delay: 0, stagger: 0.08 } },
  { label: 'Wipe RTL', anim: { type: 'wipe-rtl', duration: 0.6, easing: 'ease-out', delay: 0 } },
  { label: '3D Flip Up', anim: { type: 'flip-up', duration: 0.7, easing: 'spring', delay: 0 } },
  { label: 'Blur Reveal', anim: { type: 'blur-reveal', duration: 0.6, easing: 'expo-out', delay: 0 } },
  { label: 'Pop Bounce', anim: { type: 'pop-bounce', duration: 0.6, easing: 'back-out', delay: 0 } },
  { label: 'Slide up', anim: { type: 'slide-up', duration: 0.7, easing: 'ease-out', delay: 0 } },
  { label: 'Slide down', anim: { type: 'slide-down', duration: 0.6, easing: 'ease-out', delay: 0 } },
  { label: 'Fade', anim: { type: 'fade-in', duration: 0.5, easing: 'ease-out', delay: 0 } },
  { label: 'From right', anim: { type: 'slide-right', duration: 0.6, easing: 'ease-out', delay: 0 } },
  { label: 'Zoom', anim: { type: 'zoom-in', duration: 0.5, easing: 'ease-out', delay: 0 } },
  { label: 'None', anim: { type: 'none', duration: 0, easing: 'linear', delay: 0 } },
]

// Quick exit presets — how the bumper logo leaves when the bumper ends.
const OUT_PRESETS: { label: string; anim: BumperExitAnimation }[] = [
  { label: 'Fade out', anim: { type: 'fade-out', duration: 0.5, easing: 'ease-out', delay: 0 } },
  { label: 'Slide up', anim: { type: 'slide-up', duration: 0.5, easing: 'ease-out', delay: 0 } },
  { label: 'To left', anim: { type: 'slide-left', duration: 0.5, easing: 'ease-out', delay: 0 } },
  { label: 'To right', anim: { type: 'slide-right', duration: 0.5, easing: 'ease-out', delay: 0 } },
  { label: 'Zoom out', anim: { type: 'zoom-out', duration: 0.5, easing: 'ease-out', delay: 0 } },
  { label: 'None', anim: { type: 'none', duration: 0, easing: 'linear', delay: 0 } },
]

function AnimPresetCard({
  preset,
  selected,
  onSelect,
}: {
  preset: { label: string; anim: EntranceAnimation }
  selected: boolean
  onSelect: () => void
}) {
  const [hovering, setHovering] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!hovering || !boxRef.current) return
    const el = boxRef.current
    let keyframes: Keyframe[] = []
    switch (preset.anim.type) {
      case 'fade-in':
        keyframes = [{ opacity: 0 }, { opacity: 1 }]
        break
      case 'slide-up':
        keyframes = [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }]
        break
      case 'slide-down':
        keyframes = [{ opacity: 0, transform: 'translateY(-12px)' }, { opacity: 1, transform: 'translateY(0)' }]
        break
      case 'slide-right':
        keyframes = [{ opacity: 0, transform: 'translateX(16px)' }, { opacity: 1, transform: 'translateX(0)' }]
        break
      case 'zoom-in':
        keyframes = [{ opacity: 0, transform: 'scale(0.3)' }, { opacity: 1, transform: 'scale(1)' }]
        break
      case 'pop-bounce':
        keyframes = [
          { opacity: 0, transform: 'scale(0.3)' },
          { opacity: 1, transform: 'scale(1.2)', offset: 0.6 },
          { transform: 'scale(0.95)', offset: 0.8 },
          { transform: 'scale(1)', offset: 1 },
        ]
        break
      case 'flip-up':
        keyframes = [
          { opacity: 0, transform: 'perspective(300px) rotateX(90deg)' },
          { opacity: 1, transform: 'perspective(300px) rotateX(0deg)' },
        ]
        break
      case 'blur-reveal':
        keyframes = [
          { opacity: 0, filter: 'blur(6px)', transform: 'scale(0.9)' },
          { opacity: 1, filter: 'blur(0px)', transform: 'scale(1)' },
        ]
        break
      case 'wipe-rtl':
        keyframes = [
          { clipPath: 'inset(0 0 0 100%)', opacity: 0.5 },
          { clipPath: 'inset(0 0 0 0%)', opacity: 1 },
        ]
        break
      case 'word-stagger':
        keyframes = [
          { opacity: 0, transform: 'translateY(8px) scale(0.9)' },
          { opacity: 1, transform: 'translateY(0) scale(1)' },
        ]
        break
      default:
        keyframes = [{ opacity: 0 }, { opacity: 1 }]
    }
    const anim = el.animate(keyframes, {
      duration: Math.max(300, (preset.anim.duration || 0.5) * 800),
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
      fill: 'both',
    })
    return () => anim.cancel()
  }, [hovering, preset])

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className={`group flex flex-col items-center justify-between rounded-xl border p-1.5 text-center transition-all cursor-pointer ${
        selected
          ? 'border-[#1E56A0] bg-[#1E56A0]/10 text-[#1E56A0] ring-1 ring-[#1E56A0] shadow-xs'
          : 'border-slate-200/90 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50/40 hover:text-slate-900'
      }`}
    >
      <div className="flex h-6 w-full items-center justify-center overflow-hidden rounded-md bg-slate-100 mb-1">
        <div
          ref={boxRef}
          className={`h-2.5 w-6 rounded-xs shadow-2xs transition-transform ${
            selected ? 'bg-[#1E56A0]' : 'bg-slate-400 group-hover:bg-[#1E56A0]'
          }`}
        />
      </div>
      <span className="text-[10px] font-bold tracking-tight line-clamp-1">{preset.label}</span>
    </button>
  )
}

export function Inspector({
  model,
  selectedId,
  activeRound,
  updateLayer,
  updateAnimation,
  updateTemplate,
  updateRound,
  duplicateRound,
  deleteRound,
  moveRound,
  duplicateLayer,
  alignLayerH,
  alignLayerV,
  bumperFocus,
  onBumperOpenChange,
}: Props) {
  const layer = selectedId ? model.layers.find((l) => l.id === selectedId) : undefined

  const bumper = model.bumper
  const updateBumper = (patch: Partial<BumperConfig>) => {
    updateTemplate({ bumper: { ...(bumper ?? defaultBumper()), ...patch } })
  }

  // Bumper section is a controlled collapsible so the toolbar's "Bumper" button
  // can open it + scroll to it (it sits deep in the no-layer-selected view).
  const [bumperOpen, setBumperOpen] = useState(false)
  const bumperRef = useRef<HTMLDivElement>(null)
  const toggleBumperOpen = (open: boolean) => {
    setBumperOpen(open)
    onBumperOpenChange?.(open)
  }
  useEffect(() => {
    if (bumperFocus) {
      setMainTab('settings')
      setBumperOpen(true)
      onBumperOpenChange?.(true)
      const t = window.setTimeout(() => bumperRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60)
      return () => window.clearTimeout(t)
    }
  }, [bumperFocus])

  const [mainTab, setMainTab] = useState<'content' | 'settings'>('content')

  if (!layer) {
    return (
      <div className="thin-scroll h-full overflow-y-auto p-4 pb-8 space-y-4">
        {/* Main Tab Switcher */}
        <div className="flex items-center p-1 bg-slate-100/90 rounded-2xl border border-slate-200/80 shadow-2xs">
          <button
            type="button"
            onClick={() => setMainTab('content')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              mainTab === 'content'
                ? 'bg-[#1E56A0] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Content & Media
          </button>
          <button
            type="button"
            onClick={() => setMainTab('settings')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              mainTab === 'settings'
                ? 'bg-[#1E56A0] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Design & Settings
          </button>
        </div>

        {mainTab === 'content' && activeRound && (
          <div className="space-y-4">
            <RoundEditor
              round={activeRound}
              updateRound={updateRound}
              duplicateRound={duplicateRound}
              deleteRound={deleteRound}
              moveRound={moveRound}
              canMoveEarlier={model.rounds.findIndex((r) => r.id === activeRound.id) > 0}
              canMoveLater={model.rounds.findIndex((r) => r.id === activeRound.id) < model.rounds.length - 1}
              canDelete={model.rounds.length > 1}
            />

            <Section title="Color Themes">
              <div className="grid grid-cols-2 gap-2">
                {BROADCAST_PALETTES.map((pal) => {
                  const isSelected = model.accentColor.toLowerCase() === pal.primary.toLowerCase() && model.backgroundColor.toLowerCase() === pal.background.toLowerCase()
                  return (
                    <button
                      key={pal.id}
                      type="button"
                      onClick={() => {
                        updateTemplate({
                          accentColor: pal.primary,
                          backgroundColor: pal.background,
                        })
                        updateRound(activeRound.id, {
                          accentColor: pal.primary,
                          backgroundColor: pal.background,
                        })
                      }}
                      className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all text-left group cursor-pointer ${
                        isSelected
                          ? 'border-[#1E56A0] bg-blue-50/50 shadow-xs ring-1.5 ring-[#1E56A0]'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-2xs'
                      }`}
                    >
                      <div className="relative flex flex-col gap-1 items-center">
                        <div className="w-5 h-5 rounded-full shadow-2xs ring-1 ring-black/10 flex items-center justify-center text-[10px] font-bold text-white" style={{ background: pal.primary }}>
                          {isSelected && <span className="drop-shadow-sm">✓</span>}
                        </div>
                        <div className="w-5 h-1.5 rounded-xs" style={{ background: pal.secondary }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-[11px] font-bold truncate ${isSelected ? 'text-[#1E56A0]' : 'text-slate-800'}`}>{pal.name}</div>
                        <div className="text-[9px] text-slate-400 truncate">{pal.nameAr}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </Section>
          </div>
        )}

        {mainTab === 'settings' && (
          <div className="space-y-4">
            <Section title="Aspect Ratio">
              <div className="grid grid-cols-2 gap-2">
                {ASPECT_RATIOS.map((ar) => {
                  const active = model.width === ar.width && model.height === ar.height
                  return (
                    <button
                      key={ar.id}
                      type="button"
                      onClick={() => updateTemplate({ width: ar.width, height: ar.height })}
                      className={`relative rounded-xl p-3 text-center transition-all cursor-pointer ${
                        active
                          ? 'bg-[#1E56A0] text-white shadow-sm ring-2 ring-[#1E56A0]/25'
                          : 'bg-slate-100/80 text-slate-700 hover:bg-slate-200/90 hover:text-slate-900 border border-slate-200/60'
                      }`}
                    >
                      {active && <span className="absolute top-2 right-2 text-[11px] font-bold">✓</span>}
                      <div className="text-[13px] font-bold">{ar.label}</div>
                      <div className={`text-[10px] mt-0.5 ${active ? 'text-white/80' : 'text-slate-500'}`}>{ar.name}</div>
                    </button>
                  )
                })}
              </div>
            </Section>

            <Section title="⚡ 1-Click Cascade Animation Stagger">
              <div className="text-[11px] text-slate-500 mb-2">
                Automatically stagger layer entrance delays down the timeline for broadcast motion flow.
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const layers = model.layers.filter((l) => l.type !== 'background')
                    layers.forEach((l, idx) => {
                      updateAnimation(l.id, { delay: Math.round(idx * 0.08 * 100) / 100, duration: 0.45, easing: 'back-out' })
                    })
                  }}
                  className="flex flex-col items-center justify-center p-2 rounded-xl border border-slate-200 bg-white hover:border-[#1E56A0] hover:bg-blue-50/50 transition-all cursor-pointer text-center"
                >
                  <span className="text-xs font-bold text-slate-800">⚡ Snappy</span>
                  <span className="text-[9px] text-slate-400 mt-0.5">+0.08s · News</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const layers = model.layers.filter((l) => l.type !== 'background')
                    layers.forEach((l, idx) => {
                      updateAnimation(l.id, { delay: Math.round(idx * 0.22 * 100) / 100, duration: 0.8, easing: 'ease-in-out' })
                    })
                  }}
                  className="flex flex-col items-center justify-center p-2 rounded-xl border border-slate-200 bg-white hover:border-[#1E56A0] hover:bg-blue-50/50 transition-all cursor-pointer text-center"
                >
                  <span className="text-xs font-bold text-slate-800">🎬 Cinematic</span>
                  <span className="text-[9px] text-slate-400 mt-0.5">+0.22s · Smooth</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const layers = model.layers.filter((l) => l.type !== 'background')
                    layers.forEach((l, idx) => {
                      updateAnimation(l.id, { delay: Math.round(idx * 0.05 * 100) / 100, duration: 0.6, easing: 'elastic' })
                    })
                  }}
                  className="flex flex-col items-center justify-center p-2 rounded-xl border border-slate-200 bg-white hover:border-[#1E56A0] hover:bg-blue-50/50 transition-all cursor-pointer text-center"
                >
                  <span className="text-xs font-bold text-slate-800">🔥 Punchy</span>
                  <span className="text-[9px] text-slate-400 mt-0.5">+0.05s · Reels</span>
                </button>
              </div>
            </Section>

            <div ref={bumperRef} className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs transition-all">
              <button
                type="button"
                onClick={() => toggleBumperOpen(!bumperOpen)}
                className="flex w-full items-center justify-between text-[13px] font-bold text-slate-800 hover:text-slate-900"
              >
                <span>Bumper (brand break)</span>
                <span className="text-slate-400 transition-transform text-xs" style={{ transform: bumperOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▾</span>
              </button>
              {bumperOpen && (
                <div className="mt-2.5 space-y-3 pt-2.5 border-t border-slate-200/60">
                  <Field label="Enabled">
                    <Segmented
                      value={bumper?.enabled ? 'on' : 'off'}
                      onChange={(v) => updateBumper({ enabled: v === 'on' })}
                      options={[
                        { value: 'off', label: 'Off' },
                        { value: 'on', label: 'On' },
                      ]}
                    />
                  </Field>
                  {bumper?.enabled && (
                    <>
                      <BumperLivePreview bumper={bumper} />
                      <Field label="Logo entrance transition">
                        <div className="grid grid-cols-3 gap-1.5">
                          {ANIM_PRESETS.map((p) => {
                            const active = bumper.animation.type === p.anim.type
                            return (
                              <button
                                key={p.label}
                                type="button"
                                onClick={() => updateBumper({ animation: { ...p.anim } })}
                                className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-all cursor-pointer ${
                                  active ? 'bg-[#1E56A0] text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                              >
                                {active ? '✓ ' : ''}{p.label}
                              </button>
                            )
                          })}
                        </div>
                      </Field>
                      <Field label="Transition duration (s)">
                        <NumberInput value={bumper.animation.duration} onChange={(v) => updateBumper({ animation: { ...bumper.animation, duration: clamp(v, 0.1, 3) } })} min={0.1} max={3} step={0.1} />
                      </Field>
                      <Field label="Logo exit transition">
                        <div className="grid grid-cols-3 gap-1.5">
                          {OUT_PRESETS.map((p) => {
                            const active = (bumper.animationOut?.type ?? 'fade-out') === p.anim.type
                            return (
                              <button
                                key={p.label}
                                type="button"
                                onClick={() => updateBumper({ animationOut: { ...p.anim } })}
                                className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-all cursor-pointer ${
                                  active ? 'bg-[#1E56A0] text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                              >
                                {active ? '✓ ' : ''}{p.label}
                              </button>
                            )
                          })}
                        </div>
                      </Field>
                      <Field label="Exit duration (s)">
                        <NumberInput
                          value={(bumper.animationOut?.duration ?? 0.5)}
                          onChange={(v) => updateBumper({ animationOut: { ...(bumper.animationOut ?? { type: 'fade-out', duration: 0.5, delay: 0, easing: 'ease-out' }), duration: clamp(v, 0.1, 3) } })}
                          min={0.1}
                          max={3}
                          step={0.1}
                        />
                      </Field>
                      <Field label="Show at">
                        <div className="grid grid-cols-3 gap-1.5">
                          {([
                            { key: 'showIntro', label: 'Intro' },
                            { key: 'showInterstitial', label: 'Between' },
                            { key: 'showOutro', label: 'Outro' },
                          ] as { key: keyof BumperConfig; label: string }[]).map((t) => (
                            <button
                              key={t.key}
                              type="button"
                              onClick={() => updateBumper({ [t.key]: !bumper[t.key] } as Partial<BumperConfig>)}
                              className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-all ${
                                bumper[t.key] ? 'bg-[#1E56A0] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                            >
                              {bumper[t.key] ? '✓ ' : ''}{t.label}
                            </button>
                          ))}
                        </div>
                      </Field>
                      <Field label="Duration (seconds)" hint="Length of each bumper break">
                        <NumberInput value={bumper.duration} onChange={(v) => updateBumper({ duration: clamp(v, 0.2, 10) })} min={0.2} max={10} step={0.2} />
                      </Field>
                      <ColorInput label="Background" value={bumper.backgroundColor} onChange={(v) => updateBumper({ backgroundColor: v })} />
                      <ColorInput label="Accent" value={bumper.accentColor} onChange={(v) => updateBumper({ accentColor: v })} />
                      <Field label="Logo" hint="An image overrides the text below">
                        <BumperLogoPicker
                          value={bumper.logoImageUrl}
                          onChange={(v) => updateBumper({ logoImageUrl: v })}
                        />
                      </Field>
                      <Field label="Logo text">
                        <TextInput value={bumper.logoText} onChange={(v) => updateBumper({ logoText: v })} />
                      </Field>
                      <Field label="Slogan">
                        <TextInput value={bumper.slogan} onChange={(v) => updateBumper({ slogan: v })} />
                      </Field>
                    </>
                  )}
                </div>
              )}
            </div>

            <Section title="General">
              <div className="space-y-3">
                <Field label="Name">
                  <TextInput value={model.name} onChange={(v) => updateTemplate({ name: v })} />
                </Field>
                <Field label="Description">
                  <TextInput value={model.description} onChange={(v) => updateTemplate({ description: v })} />
                </Field>
              </div>
            </Section>

            <Section title="Video Settings">
              <div className="space-y-3">
                <Field label="Duration (seconds)">
                  <NumberInput value={model.duration} onChange={(v) => updateTemplate({ duration: clamp(v, 1, 60) })} min={1} max={60} step={0.5} />
                </Field>
                <Field label="Frame rate (FPS)">
                  <NumberInput value={model.fps} onChange={(v) => updateTemplate({ fps: clamp(Math.round(v), 15, 60) })} min={15} max={60} />
                </Field>
              </div>
            </Section>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="thin-scroll h-full overflow-y-auto p-4 pb-8">
      <div className="mb-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5 shadow-2xs">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-lg bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-[#1E56A0]">{LAYER_TYPE_LABELS[layer.type]}</span>
          {layer.type === 'logo' || layer.type === 'accentBar' || layer.type === 'footer' ? (
            <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
              Unchanged in next rounds
            </span>
          ) : (
            <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
              {activeRound ? activeRound.name : 'First Round'}
            </span>
          )}
        </div>
        <input
          value={layer.name}
          aria-label="Layer name"
          onChange={(e) => updateLayer(layer.id, { name: e.target.value })}
          className="mt-2 w-full bg-transparent text-[15px] font-bold text-slate-900 focus:outline-none"
        />
        {(layer.type === 'logo' || layer.type === 'accentBar' || layer.type === 'footer') && (
          <p className="mt-1 text-[11px] text-slate-400">
            This branding layer stays unchanged and persistent across all next rounds.
          </p>
        )}
      </div>

      <ContentEditor layer={layer} updateLayer={updateLayer} activeRound={activeRound} updateRound={updateRound} />

      <Section title="Position & size">
        <div className="space-y-2.5">
          {layer.type !== 'background' && (
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-2 space-y-1.5">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Quick Alignment & Tools</span>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  disabled={layer.locked}
                  onClick={() => alignLayerH ? alignLayerH(layer.id) : updateLayer(layer.id, { x: layer.width && layer.width > 0 ? Math.max(0, Math.min(100, Math.round((100 - layer.width) / 2))) : 50 })}
                  title={layer.locked ? 'Layer is locked' : 'Center layer horizontally'}
                  className="flex items-center justify-center gap-1 rounded-lg border border-slate-200/80 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-[#1E56A0]/40 hover:text-[#1E56A0] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <AlignHorizontalJustifyCenter size={12} className="text-slate-400" aria-hidden />
                  <span>Center H</span>
                </button>
                <button
                  type="button"
                  disabled={layer.locked}
                  onClick={() => alignLayerV ? alignLayerV(layer.id) : updateLayer(layer.id, { y: 50 })}
                  title={layer.locked ? 'Layer is locked' : 'Center layer vertically'}
                  className="flex items-center justify-center gap-1 rounded-lg border border-slate-200/80 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-[#1E56A0]/40 hover:text-[#1E56A0] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <AlignVerticalJustifyCenter size={12} className="text-slate-400" aria-hidden />
                  <span>Center V</span>
                </button>
                {duplicateLayer && (
                  <button
                    type="button"
                    onClick={() => duplicateLayer(layer.id)}
                    title="Duplicate layer (Ctrl+D)"
                    className="flex items-center justify-center gap-1 rounded-lg border border-slate-200/80 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-[#1E56A0]/40 hover:text-[#1E56A0] transition-all"
                  >
                    <Copy size={12} className="text-slate-400" aria-hidden />
                    <span>Duplicate</span>
                  </button>
                )}
              </div>
            </div>
          )}
          <Slider label="Left" value={layer.x} onChange={(v) => updateLayer(layer.id, { x: v })} min={0} max={100} unit="%" />
          <Slider label="Top" value={layer.y} onChange={(v) => updateLayer(layer.id, { y: v })} min={0} max={100} unit="%" />
          <Slider label="Width" value={layer.width} onChange={(v) => updateLayer(layer.id, { width: v })} min={0} max={100} unit="%" />
          <Field label="Align">
            <Segmented
              value={layer.textAlign}
              onChange={(v) => updateLayer(layer.id, { textAlign: v })}
              options={[
                { value: 'start', label: 'Right' },
                { value: 'center', label: 'Center' },
                { value: 'end', label: 'Left' },
              ]}
            />
          </Field>
          <Field label="Opacity">
            <Slider value={layer.opacity} onChange={(v) => updateLayer(layer.id, { opacity: v })} min={0} max={1} step={0.05} />
          </Field>
        </div>
      </Section>

      {/* Canva Shape & Object Deformation Studio */}
      {layer.type === 'shape' && (
        <Section title="Canva Shape Studio & Bending">
          <div className="space-y-3.5">
            <Field label="Shape Preset">
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { type: 'rounded-box', label: 'Card' },
                  { type: 'box', label: 'Square' },
                  { type: 'pill', label: 'Pill' },
                  { type: 'circle', label: 'Circle' },
                  { type: 'ribbon', label: 'Ribbon' },
                  { type: 'skewed-banner', label: 'Slanted' },
                  { type: 'speech-bubble', label: 'Bubble' },
                  { type: 'diagonal-badge', label: 'Diagonal' },
                ].map((s) => {
                  const active = (layer.shapeType || 'rounded-box') === s.type
                  return (
                    <button
                      key={s.type}
                      type="button"
                      onClick={() => {
                        const patch: Partial<Layer> = { shapeType: s.type as any }
                        if (s.type === 'skewed-banner' && !layer.skewX) patch.skewX = -12
                        if (s.type === 'circle') { patch.borderRadius = 9999; patch.height = 200; patch.width = 20 }
                        updateLayer(layer.id, patch)
                      }}
                      className={`rounded-xl py-2 px-1 text-[11px] font-bold transition-all cursor-pointer ${
                        active
                          ? 'bg-[#1E56A0] text-white shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {s.label}
                    </button>
                  )
                })}
              </div>
            </Field>

            {/* Canva Slant / Bending Controls */}
            <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Sparkles size={13} className="text-[#1E56A0]" />
                  <span>Canva Bending & Slant</span>
                </span>
                {(layer.skewX || layer.skewY || layer.rotation) ? (
                  <button
                    type="button"
                    onClick={() => updateLayer(layer.id, { skewX: 0, skewY: 0, rotation: 0 })}
                    className="text-[10px] font-bold text-[#1E56A0] hover:underline cursor-pointer"
                  >
                    Reset Transforms
                  </button>
                ) : null}
              </div>

              <Field label={`Horizontal Slant / Bend X (${layer.skewX || 0}°)`}>
                <Slider
                  value={layer.skewX || 0}
                  onChange={(v) => updateLayer(layer.id, { skewX: Math.round(v) })}
                  min={-60}
                  max={60}
                  unit="°"
                />
              </Field>

              <Field label={`Vertical Slant / Bend Y (${layer.skewY || 0}°)`}>
                <Slider
                  value={layer.skewY || 0}
                  onChange={(v) => updateLayer(layer.id, { skewY: Math.round(v) })}
                  min={-60}
                  max={60}
                  unit="°"
                />
              </Field>

              <Field label={`Rotation Angle (${layer.rotation || 0}°)`}>
                <Slider
                  value={layer.rotation || 0}
                  onChange={(v) => updateLayer(layer.id, { rotation: Math.round(v) })}
                  min={-180}
                  max={180}
                  unit="°"
                />
                <div className="flex gap-1.5 mt-1.5">
                  {[0, 45, 90, -45].map((ang) => (
                    <button
                      key={ang}
                      type="button"
                      onClick={() => updateLayer(layer.id, { rotation: ang })}
                      className={`flex-1 py-1 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${
                        (layer.rotation || 0) === ang
                          ? 'border-[#1E56A0] bg-blue-50 text-[#1E56A0]'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {ang}°
                    </button>
                  ))}
                </div>
              </Field>
            </div>

            {/* Dimensions */}
            <div className="grid grid-cols-2 gap-2">
              <Field label="Height (px)">
                <NumberInput
                  value={layer.height || 180}
                  onChange={(v) => updateLayer(layer.id, { height: clamp(v, 20, 1920) })}
                  min={20}
                  max={1920}
                  unit="px"
                />
              </Field>
              <Field label="Corner Radius (px)">
                <NumberInput
                  value={layer.borderRadius ?? 20}
                  onChange={(v) => updateLayer(layer.id, { borderRadius: clamp(v, 0, 200) })}
                  min={0}
                  max={200}
                  unit="px"
                />
              </Field>
            </div>

            {/* Fill & Color Mode */}
            <Field label="Fill Mode">
              <Segmented
                value={layer.fillType || 'gradient'}
                onChange={(v) => updateLayer(layer.id, { fillType: v as any })}
                options={[
                  { value: 'solid', label: 'Solid' },
                  { value: 'gradient', label: 'Gradient' },
                  { value: 'glass', label: 'Glass' },
                ]}
              />
            </Field>

            {layer.fillType === 'solid' && (
              <ColorInput
                label="Fill Color"
                value={layer.backgroundColor || '#1E56A0'}
                onChange={(v) => updateLayer(layer.id, { backgroundColor: v })}
              />
            )}

            {(layer.fillType === 'gradient' || !layer.fillType) && (
              <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-2.5">
                <Field label={`Gradient Angle (${layer.gradientAngle ?? 135}°)`}>
                  <Slider
                    value={layer.gradientAngle ?? 135}
                    onChange={(v) => updateLayer(layer.id, { gradientAngle: Math.round(v) })}
                    min={0}
                    max={360}
                    unit="°"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <ColorInput
                    label="Start Color"
                    value={layer.gradientColorStart || '#1E56A0'}
                    onChange={(v) => updateLayer(layer.id, { gradientColorStart: v })}
                  />
                  <ColorInput
                    label="End Color"
                    value={layer.gradientColorEnd || '#E63946'}
                    onChange={(v) => updateLayer(layer.id, { gradientColorEnd: v })}
                  />
                </div>
              </div>
            )}

            {layer.fillType === 'glass' && (
              <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-2.5">
                <ColorInput
                  label="Tint Color"
                  value={layer.backgroundColor || 'rgba(15,23,42,0.75)'}
                  onChange={(v) => updateLayer(layer.id, { backgroundColor: v })}
                />
                <Field label={`Frosted Blur (${layer.backdropBlur || 16}px)`}>
                  <Slider
                    value={layer.backdropBlur || 16}
                    onChange={(v) => updateLayer(layer.id, { backdropBlur: Math.round(v) })}
                    min={0}
                    max={40}
                    unit="px"
                  />
                </Field>
              </div>
            )}

            {/* Border & Stroke */}
            <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-2.5">
              <span className="text-xs font-bold text-slate-700">Border & Stroke</span>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Stroke (px)">
                  <NumberInput
                    value={layer.strokeWidth || 0}
                    onChange={(v) => updateLayer(layer.id, { strokeWidth: clamp(v, 0, 30) })}
                    min={0}
                    max={30}
                    unit="px"
                  />
                </Field>
                <ColorInput
                  label="Border Color"
                  value={layer.strokeColor || '#ffffff'}
                  onChange={(v) => updateLayer(layer.id, { strokeColor: v })}
                />
              </div>
            </div>

            {/* Shadows & Glow */}
            <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-2.5">
              <span className="text-xs font-bold text-slate-700">Shadows & Outer Glow</span>
              <Field label={`Drop Shadow Blur (${layer.shadowBlur || 0}px)`}>
                <Slider
                  value={layer.shadowBlur || 0}
                  onChange={(v) => updateLayer(layer.id, { shadowBlur: Math.round(v) })}
                  min={0}
                  max={60}
                  unit="px"
                />
              </Field>
              <Field label={`Outer Neon Glow Spread (${layer.glowSpread || 0}px)`}>
                <Slider
                  value={layer.glowSpread || 0}
                  onChange={(v) => updateLayer(layer.id, { glowSpread: Math.round(v) })}
                  min={0}
                  max={50}
                  unit="px"
                />
              </Field>
            </div>

            {/* Text Content inside Shape */}
            <Field label="Text / Label (Optional)">
              <TextInput
                value={layer.text || ''}
                onChange={(v) => updateLayer(layer.id, { text: v })}
                placeholder="Shape text..."
              />
            </Field>
          </div>
        </Section>
      )}

      <Section title="Appearance">
        <div className="space-y-3">
          {layer.type !== 'background' && layer.type !== 'accentBar' && layer.type !== 'shape' && (
            <>
              <Field label="Font size">
                <NumberInput value={layer.fontSize} onChange={(v) => updateLayer(layer.id, { fontSize: clamp(v, 8, 400) })} min={8} max={400} unit="px" />
              </Field>
              <Field label="Font weight">
                <Segmented
                  value={String(layer.fontWeight)}
                  onChange={(v) => updateLayer(layer.id, { fontWeight: Number(v) })}
                  options={[
                    { value: '400', label: 'Regular' },
                    { value: '500', label: 'Medium' },
                    { value: '700', label: 'Bold' },
                  ]}
                />
              </Field>
              <Field label="Arabic Font Family">
                <Select
                  value={layer.fontFamily || ARABIC_FONTS[0].family}
                  onChange={(v) => updateLayer(layer.id, { fontFamily: v })}
                  options={ARABIC_FONTS.map((f) => ({ value: f.family, label: f.name }))}
                />
              </Field>
              <Field label={`Kashida Tatweel (محاذاة الكشيدة) — ${layer.kashida || 0}%`}>
                <Slider
                  value={layer.kashida || 0}
                  onChange={(v) => updateLayer(layer.id, { kashida: Math.round(v) })}
                  min={0}
                  max={100}
                  step={5}
                  unit="%"
                />
              </Field>
              <Field label="Text Shadow Effect">
                <Segmented
                  value={layer.textShadow || 'none'}
                  onChange={(v) => updateLayer(layer.id, { textShadow: v })}
                  options={[
                    { value: 'none', label: 'None' },
                    { value: 'subtle', label: 'Subtle' },
                    { value: 'glow', label: 'Glow' },
                    { value: '3d', label: '3D Hard' },
                  ]}
                />
              </Field>
              <Field label="Broadcast Widget Preset">
                <Select
                  value={layer.widgetType || 'custom'}
                  onChange={(v) => updateLayer(layer.id, { widgetType: v === 'custom' ? undefined : v })}
                  options={[
                    { value: 'custom', label: 'Standard Layer' },
                    { value: 'breaking_ticker', label: 'Breaking News Ticker (شريط عاجل)' },
                    { value: 'speaker_card', label: 'Speaker Quote Box (بطاقة تصريح)' },
                    { value: 'progress_bar', label: 'Video Progress Line (شريط تقدم)' },
                  ]}
                />
              </Field>
              <ColorInput label="Color" value={layer.color} onChange={(v) => updateLayer(layer.id, { color: v })} />
            </>
          )}
          {(layer.type === 'label' || layer.type === 'accentBar') && (
            <ColorInput label="Fill" value={layer.backgroundColor ?? model.accentColor} onChange={(v) => updateLayer(layer.id, { backgroundColor: v })} />
          )}
          {layer.type === 'accentBar' && (
            <Field label="Height">
              <NumberInput value={layer.height ?? model.height} onChange={(v) => updateLayer(layer.id, { height: clamp(v, 10, model.height) })} min={10} max={model.height} unit="px" />
            </Field>
          )}
        </div>
      </Section>

      <Section title="Animation">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Presets</span>
            {layer.animation.type !== 'none' && (
              <button
                type="button"
                onClick={() => {
                  const el = document.querySelector(`[data-layer-type="${layer.type}"]`) as HTMLElement
                  if (el) {
                    const kfs = waaiKeyframes(layer.animation.type)
                    el.animate(kfs, {
                      duration: Math.max(10, layer.animation.duration * 1000),
                      easing: CSS_EASING[layer.animation.easing],
                      fill: 'both',
                    })
                  }
                }}
                className="flex items-center gap-1 text-[11px] font-bold text-[#1E56A0] bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors cursor-pointer shadow-2xs"
              >
                <Play size={11} className="fill-current" />
                <span>Preview Motion</span>
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {ANIM_PRESETS.map((p) => (
              <AnimPresetCard
                key={p.label}
                preset={p}
                selected={layer.animation.type === p.anim.type && layer.animation.duration === p.anim.duration}
                onSelect={() => updateAnimation(layer.id, p.anim)}
              />
            ))}
          </div>
          <Field label="Entrance">
            <Select
              value={layer.animation.type}
              onChange={(v) => updateAnimation(layer.id, { type: v as EntranceAnimation['type'] })}
              options={Object.entries(ANIMATION_LABELS).map(([value, label]) => ({ value, label }))}
            />
          </Field>
          {layer.animation.type !== 'none' && (
            <>
              <Field label="Easing">
                <Select
                  value={layer.animation.easing}
                  onChange={(v) => updateAnimation(layer.id, { easing: v as EntranceAnimation['easing'] })}
                  options={Object.entries(EASING_LABELS).map(([value, label]) => ({ value, label }))}
                />
              </Field>
              <Field label="Duration">
                <Slider value={layer.animation.duration} onChange={(v) => updateAnimation(layer.id, { duration: v })} min={0.2} max={3} step={0.1} unit="s" />
              </Field>
              <Field label="Delay">
                <Slider value={layer.animation.delay} onChange={(v) => updateAnimation(layer.id, { delay: v })} min={0} max={5} step={0.1} unit="s" />
              </Field>
              {layer.animation.type === 'word-stagger' && (
                <Field label="Word Stagger (delay between words)">
                  <Slider value={layer.animation.stagger ?? 0.08} onChange={(v) => updateAnimation(layer.id, { stagger: v })} min={0.02} max={0.3} step={0.01} unit="s" />
                </Field>
              )}
              {(layer.type === 'logo' || layer.type === 'accentBar' || layer.type === 'footer') && (
                <label className="flex items-center gap-2 pt-1 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={layer.animateFirstRoundOnly ?? true}
                    onChange={(e) => updateLayer(layer.id, { animateFirstRoundOnly: e.target.checked })}
                    className="rounded border-slate-300 text-[#1E56A0] focus:ring-[#1E56A0]"
                  />
                  <span>Animate in First Round only (stays steady in next rounds)</span>
                </label>
              )}
            </>
          )}
        </div>
      </Section>
    </div>
  )
}

function ContentEditor({
  layer,
  updateLayer,
  activeRound,
  updateRound,
}: {
  layer: Layer
  updateLayer: Props['updateLayer']
  activeRound?: TemplateRound
  updateRound: Props['updateRound']
}) {
  switch (layer.type) {
    case 'headline':
      return (
        <Section title="Content">
          <Field label="Headline text">
            <textarea
              value={activeRound ? activeRound.headline : (layer.text ?? '')}
              rows={3}
              onChange={(e) => {
                const val = e.target.value
                if (activeRound) updateRound(activeRound.id, { headline: val })
                updateLayer(layer.id, { text: val })
              }}
              className="preview-ar w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-[14px] text-slate-900 focus:border-[#1E56A0] focus:ring-2 focus:ring-[#1E56A0]/20 focus:outline-none"
            />
          </Field>
        </Section>
      )
    case 'subheadline':
      return (
        <Section title="Content">
          <Field label="Subheadline text">
            <textarea
              value={activeRound ? activeRound.subheadline : (layer.text ?? '')}
              rows={3}
              onChange={(e) => {
                const val = e.target.value
                if (activeRound) updateRound(activeRound.id, { subheadline: val })
                updateLayer(layer.id, { text: val })
              }}
              className="preview-ar w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-[14px] text-slate-900 focus:border-[#1E56A0] focus:ring-2 focus:ring-[#1E56A0]/20 focus:outline-none"
            />
          </Field>
        </Section>
      )
    case 'footer':
      return (
        <Section title="Content">
          <Field label="Footer text">
            <textarea
              value={layer.text ?? ''}
              rows={2}
              onChange={(e) => updateLayer(layer.id, { text: e.target.value })}
              className="preview-ar w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-[14px] text-slate-900 focus:border-[#1E56A0] focus:ring-2 focus:ring-[#1E56A0]/20 focus:outline-none"
            />
          </Field>
        </Section>
      )
    case 'timestamp':
      return (
        <Section title="Content">
          <Field label="Timestamp text">
            <TextInput
              value={activeRound ? activeRound.timestamp : (layer.text ?? '')}
              onChange={(val) => {
                if (activeRound) updateRound(activeRound.id, { timestamp: val })
                updateLayer(layer.id, { text: val })
              }}
            />
          </Field>
        </Section>
      )
    case 'logo':
      return <LogoImageEditor layer={layer} updateLayer={updateLayer} />
    case 'label':
      return (
        <Section title="Content">
          <div className="space-y-3">
            <Field label="Badge text (Arabic)">
              <TextInput
                value={activeRound ? activeRound.labelAr : (layer.labelAr ?? '')}
                onChange={(val) => {
                  if (activeRound) updateRound(activeRound.id, { labelAr: val })
                  updateLayer(layer.id, { labelAr: val })
                }}
              />
            </Field>
            <Field label="Badge text (English)">
              <TextInput
                value={activeRound ? activeRound.labelEn : (layer.labelEn ?? '')}
                onChange={(val) => {
                  if (activeRound) updateRound(activeRound.id, { labelEn: val })
                  updateLayer(layer.id, { labelEn: val })
                }}
              />
            </Field>
          </div>
        </Section>
      )
    case 'background':
      return <MediaEditor layer={layer} updateLayer={updateLayer} activeRound={activeRound} updateRound={updateRound} />
    default:
      return null
  }
}

function MediaEditor({
  layer,
  updateLayer,
  activeRound,
  updateRound,
}: {
  layer: Layer
  updateLayer: Props['updateLayer']
  activeRound?: TemplateRound
  updateRound: Props['updateRound']
}) {
  const media = activeRound?.backgroundMedia ?? layer.backgroundMedia
  const online = useBackendOnline()
  const [assets, setAssets] = useState<Asset[]>([])
  const [, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const refresh = async () => {
    setLoading(true)
    try {
      const all = await listAssets()
      setAssets(all.filter((a) => a.category === 'image' || a.category === 'video'))
    } catch {
      /* offline */
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setMedia = (patch: Partial<BackgroundMedia>) => {
    const updated = { ...(media ?? { type: 'image', url: '', fit: 'cover', scale: 1, posX: 50, posY: 50 }), ...patch }
    if (activeRound) updateRound(activeRound.id, { backgroundMedia: updated })
    updateLayer(layer.id, { backgroundMedia: updated })
  }

  const onUpload = async (file: File) => {
    const category = file.type.startsWith('video') ? 'video' : 'image'
    setUploading(true)
    try {
      const up = await uploadAsset(category, file)
      setMedia({ url: assetUrl(up.category, up.filename), type: category as BackgroundMedia['type'] })
      await refresh()
    } catch {
      setMedia({ url: URL.createObjectURL(file), type: category as BackgroundMedia['type'] })
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <Section title="Background media">
        <div className="space-y-3">
          {media?.url && (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              {media.type === 'video' ? (
                <video src={media.url} className="h-28 w-full object-cover" muted autoPlay loop playsInline />
              ) : (
                <img src={media.url} alt="background preview" className="h-28 w-full object-cover" />
              )}
            </div>
          )}
          <Field label="Media type">
            <Segmented
              value={media?.type ?? 'image'}
              onChange={(v) => setMedia({ type: v as BackgroundMedia['type'] })}
              options={[
                { value: 'image', label: 'Image' },
                { value: 'video', label: 'Video' },
              ]}
            />
          </Field>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onUpload(f)
              e.target.value = ''
            }}
          />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <RefreshCw size={14} className="animate-spin" aria-hidden /> : <UploadCloud size={14} aria-hidden />}
            {uploading ? 'Uploading…' : 'Upload image / video'}
          </Button>
          {!online && <p className="text-[11px] text-slate-500">Backend offline — uploads can't be saved (preview only).</p>}
          {assets.length > 0 && (
            <Field label="Saved assets">
              <select
                value={media?.url ?? ''}
                onChange={(e) => {
                  const a = assets.find((x) => assetUrl(x.category, x.filename) === e.target.value)
                  if (a) setMedia({ url: e.target.value, type: a.category as BackgroundMedia['type'] })
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-[13px] text-slate-900 focus:border-[#1E56A0] focus:ring-2 focus:ring-[#1E56A0]/20 focus:outline-none"
              >
                <option value="">— none —</option>
                {assets.map((a) => (
                  <option key={`${a.category}/${a.filename}`} value={assetUrl(a.category, a.filename)}>
                    {a.filename}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Fit">
            <Select
              value={media?.fit ?? 'cover'}
              onChange={(v) => setMedia({ fit: v as BackgroundMedia['fit'] })}
              options={[
                { value: 'cover', label: 'Cover (fill & crop)' },
                { value: 'contain', label: 'Contain (fit inside)' },
                { value: 'fill', label: 'Fill (stretch)' },
              ]}
            />
          </Field>
          <Slider label="Zoom" value={media?.scale ?? 1} onChange={(v) => setMedia({ scale: v })} min={0.5} max={3} step={0.1} />
          <Slider label="X pos" value={media?.posX ?? 50} onChange={(v) => setMedia({ posX: v })} min={0} max={100} unit="%" />
          <Slider label="Y pos" value={media?.posY ?? 50} onChange={(v) => setMedia({ posY: v })} min={0} max={100} unit="%" />
        </div>
      </Section>
      <Section title="Overlay">
        <Slider
          label="Strength"
          value={activeRound?.overlayOpacity ?? layer.overlayOpacity ?? 0.55}
          onChange={(v) => {
            if (activeRound) updateRound(activeRound.id, { overlayOpacity: v })
            updateLayer(layer.id, { overlayOpacity: v })
          }}
          min={0}
          max={1}
          step={0.05}
        />
      </Section>
    </>
  )
}

// Logo editor — optional image logo (replaces the text logo when set).
function LogoImageEditor({ layer, updateLayer }: { layer: Layer; updateLayer: Props['updateLayer'] }) {
  const online = useBackendOnline()
  const [assets, setAssets] = useState<Asset[]>([])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const refresh = async () => {
    try {
      const all = await listAssets()
      setAssets(all.filter((a) => a.category === 'image'))
    } catch {
      /* offline */
    }
  }
  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onUpload = async (file: File) => {
    setUploading(true)
    try {
      const up = await uploadAsset('image', file)
      updateLayer(layer.id, { imageUrl: assetUrl(up.category, up.filename) })
      await refresh()
    } catch {
      updateLayer(layer.id, { imageUrl: URL.createObjectURL(file) })
    } finally {
      setUploading(false)
    }
  }

  return (
    <Section title="Logo image">
      <div className="space-y-3">
        {layer.imageUrl ? (
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2">
            <img src={layer.imageUrl} alt="logo preview" className="h-12 w-auto object-contain" />
            <Button variant="ghost" onClick={() => updateLayer(layer.id, { imageUrl: undefined })}>
              Remove
            </Button>
          </div>
        ) : (
          <p className="text-[12px] text-slate-500">No image — the text logo is shown. Upload an image to replace it.</p>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onUpload(f)
            e.target.value = ''
          }}
        />
        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <RefreshCw size={14} className="animate-spin" aria-hidden /> : <UploadCloud size={14} aria-hidden />}
          {uploading ? 'Uploading…' : 'Upload logo image'}
        </Button>
        {!online && <p className="text-[11px] text-slate-500">Backend offline — uploads can't be saved (preview only).</p>}
        {assets.length > 0 && (
          <Field label="Saved images">
            <select
              value={layer.imageUrl ?? ''}
              onChange={(e) => {
                const a = assets.find((x) => assetUrl(x.category, x.filename) === e.target.value)
                if (a) updateLayer(layer.id, { imageUrl: e.target.value })
              }}
              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[13px] text-slate-700"
            >
              <option value="">— none —</option>
              {assets.map((a) => (
                <option key={`${a.category}/${a.filename}`} value={assetUrl(a.category, a.filename)}>
                  {a.filename}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
    </Section>
  )
}

// Round content editor — edits the content that fills the template's design
// layers for the currently active round.
function RoundEditor({
  round,
  updateRound,
  duplicateRound,
  deleteRound,
  moveRound,
  canMoveEarlier,
  canMoveLater,
  canDelete,
}: {
  round: TemplateRound
  updateRound: Props['updateRound']
  duplicateRound?: (id: string) => void
  deleteRound?: (id: string) => void
  moveRound?: (id: string, dir: -1 | 1) => void
  canMoveEarlier?: boolean
  canMoveLater?: boolean
  canDelete?: boolean
}) {
  const setMedia = (patch: Partial<BackgroundMedia>) => {
    updateRound(round.id, { backgroundMedia: { ...(round.backgroundMedia ?? { type: 'image', url: '', fit: 'cover', scale: 1, posX: 50, posY: 50 }), ...patch } })
  }

  return (
    <>
      <Section title={`Round · ${round.name}`}>
        <div className="space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Round Actions</span>
            <div className="flex items-center gap-1">
              {moveRound && (
                <>
                  <button
                    type="button"
                    title="Move round earlier"
                    aria-label="Move round earlier"
                    disabled={!canMoveEarlier}
                    onClick={() => moveRound(round.id, -1)}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 disabled:opacity-20"
                  >
                    <ChevronLeft size={13} aria-hidden />
                  </button>
                  <button
                    type="button"
                    title="Move round later"
                    aria-label="Move round later"
                    disabled={!canMoveLater}
                    onClick={() => moveRound(round.id, 1)}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 disabled:opacity-20"
                  >
                    <ChevronRight size={13} aria-hidden />
                  </button>
                </>
              )}
              {duplicateRound && (
                <button
                  type="button"
                  title="Duplicate round"
                  onClick={() => duplicateRound(round.id)}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-blue-50 hover:text-[#1E56A0] transition-colors"
                >
                  <Copy size={12} aria-hidden />
                  <span>Duplicate</span>
                </button>
              )}
              {deleteRound && (
                <button
                  type="button"
                  title="Delete round"
                  aria-label="Delete round"
                  disabled={!canDelete}
                  onClick={() => deleteRound(round.id)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-20"
                >
                  <Trash2 size={13} aria-hidden />
                </button>
              )}
            </div>
          </div>
          <Field label="Headline">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] text-slate-400">Main headline text</span>
              <button
                type="button"
                onClick={() => {
                  const extended = round.headline.replace(/([بتثجحخسشصضطظعغفقكلمنهي])([بتثجحخسشصضطظعغفقكلمنهيى])/g, '$1ـ$2')
                  updateRound(round.id, { headline: extended })
                }}
                className="text-[11px] font-bold text-[#1E56A0] bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-lg transition-colors cursor-pointer"
              >
                + Kashida (ـ)
              </button>
            </div>
            <textarea
              value={round.headline}
              rows={3}
              onChange={(e) => updateRound(round.id, { headline: e.target.value })}
              className="preview-ar w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[15px] font-bold text-slate-900 focus:border-[#1E56A0] focus:ring-2 focus:ring-[#1E56A0]/15 focus:outline-none leading-relaxed shadow-2xs"
              placeholder="Enter headline text… (use *word* to highlight)"
            />

            {/* 4-Mode Kashida & Word Highlight */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Kashida:</span>
              <button
                type="button"
                onClick={() => {
                  const cleaned = round.headline.replace(/ـ/g, '')
                  updateRound(round.id, { headline: cleaned })
                }}
                className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Off
              </button>
              <button
                type="button"
                onClick={() => {
                  const cleaned = round.headline.replace(/ـ/g, '')
                  const light = cleaned.replace(/([بتثجحخسشصضطظعغفقكلمنهي])([بتثجحخسشصضطظعغفقكلمنهيى])/g, (m, a, b, idx) => idx % 2 === 0 ? `${a}ـ${b}` : m)
                  updateRound(round.id, { headline: light })
                }}
                className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Light
              </button>
              <button
                type="button"
                onClick={() => {
                  const cleaned = round.headline.replace(/ـ/g, '')
                  const medium = cleaned.replace(/([بتثجحخسشصضطظعغفقكلمنهي])([بتثجحخسشصضطظعغفقكلمنهيى])/g, '$1ـ$2')
                  updateRound(round.id, { headline: medium })
                }}
                className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Medium
              </button>
              <button
                type="button"
                onClick={() => {
                  const cleaned = round.headline.replace(/ـ/g, '')
                  const max = cleaned.replace(/([بتثجحخسشصضطظعغفقكلمنهي])([بتثجحخسشصضطظعغفقكلمنهيى])/g, '$1ــ$2')
                  updateRound(round.id, { headline: max })
                }}
                className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Max
              </button>
              <button
                type="button"
                title="Wrap word with * for news broadcast highlight"
                onClick={() => {
                  if (!round.headline.includes('*')) {
                    updateRound(round.id, { headline: `*عاجل* ${round.headline}` })
                  }
                }}
                className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 hover:bg-amber-100 transition-colors cursor-pointer ml-auto"
              >
                ✨ *Highlight*
              </button>
            </div>

            {/* Readability & Word Count Meter */}
            <div className="mt-2 rounded-xl bg-slate-50 border border-slate-200/80 p-2.5">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 mb-1.5">
                <span>
                  {round.headline.length} chars · {round.headline.trim() ? round.headline.trim().split(/\s+/).length : 0} words
                </span>
                <span className={
                  round.headline.length >= 30 && round.headline.length <= 70
                    ? 'text-emerald-700 font-bold bg-emerald-100/70 px-2 py-0.5 rounded-full'
                    : round.headline.length < 30
                    ? 'text-amber-700 font-semibold bg-amber-100/70 px-2 py-0.5 rounded-full'
                    : 'text-rose-700 font-semibold bg-rose-100/70 px-2 py-0.5 rounded-full'
                }>
                  {round.headline.length >= 30 && round.headline.length <= 70
                    ? '✓ Optimal Pacing'
                    : round.headline.length < 30
                    ? 'Short'
                    : 'Long (Split)'}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 rounded-full ${
                    round.headline.length >= 30 && round.headline.length <= 70
                      ? 'bg-emerald-500'
                      : round.headline.length < 30
                      ? 'bg-amber-500'
                      : 'bg-rose-500'
                  }`}
                  style={{ width: `${Math.min(100, (round.headline.length / 80) * 100)}%` }}
                />
              </div>
            </div>
          </Field>
          <Field label="Subheadline / Source">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] text-slate-400">Location, speaker, or source handle</span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => updateRound(round.id, { subheadline: 'الرياض 📍' })}
                  className="text-[10px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                >
                  📍 Location
                </button>
                <button
                  type="button"
                  onClick={() => updateRound(round.id, { timestamp: '@account · 2026-08-30' })}
                  className="text-[10px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                >
                  📹 Source
                </button>
              </div>
            </div>
            <textarea
              value={round.subheadline}
              rows={2}
              onChange={(e) => updateRound(round.id, { subheadline: e.target.value })}
              className="preview-ar w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[14px] text-slate-900 focus:border-[#1E56A0] focus:ring-2 focus:ring-[#1E56A0]/15 focus:outline-none shadow-2xs"
              placeholder="e.g. Washington 📍 or speaker quote"
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Badge (Arabic)">
              <TextInput value={round.labelAr} onChange={(v) => updateRound(round.id, { labelAr: v })} placeholder="عاجل / مونديال" />
            </Field>
            <Field label="Badge (English)">
              <TextInput value={round.labelEn} onChange={(v) => updateRound(round.id, { labelEn: v })} placeholder="BREAKING" />
            </Field>
          </div>
          <Field label="Duration (seconds — 0 for auto)">
            <NumberInput value={round.duration} onChange={(v) => updateRound(round.id, { duration: clamp(v, 0, 60) })} min={0} max={60} step={0.5} unit="s" />
          </Field>
          <div className="pt-2 border-t border-slate-100">
            <RoundMediaEditor round={round} setMedia={setMedia} updateRound={updateRound} />
          </div>
        </div>
      </Section>
    </>
  )
}

function RoundMediaEditor({ round, setMedia, updateRound }: { round: TemplateRound; setMedia: (p: Partial<BackgroundMedia>) => void; updateRound: Props['updateRound'] }) {
  const media = round.backgroundMedia
  const online = useBackendOnline()
  const [assets, setAssets] = useState<Asset[]>([])
  const [, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showFraming, setShowFraming] = useState(false)
  const [extractedPalette, setExtractedPalette] = useState<ExtractedHarmonicPalette | null>(null)
  const [extracting, setExtracting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const refresh = async () => {
    setLoading(true)
    try {
      const all = await listAssets()
      setAssets(all.filter((a) => a.category === 'image' || a.category === 'video'))
    } catch {
      /* offline */
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onUpload = async (file: File) => {
    const category = file.type.startsWith('video') ? 'video' : 'image'
    setUploading(true)
    try {
      const up = await uploadAsset(category, file)
      setMedia({ url: assetUrl(up.category, up.filename), type: category as BackgroundMedia['type'] })
      await refresh()
    } catch {
      setMedia({ url: URL.createObjectURL(file), type: category as BackgroundMedia['type'] })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-700">Background Media</span>
        <button
          type="button"
          onClick={() => setShowFraming((s) => !s)}
          className="text-[11px] font-semibold text-[#1E56A0] hover:underline cursor-pointer"
        >
          {showFraming ? 'Hide framing' : 'Adjust framing ▾'}
        </button>
      </div>

      {media?.url && (
        <div className="space-y-2">
          <div className="relative overflow-hidden rounded-xl border border-slate-200 shadow-2xs group">
            {media.type === 'video' ? (
              <video src={media.url} className="h-24 w-full object-cover" muted autoPlay loop playsInline />
            ) : (
              <img src={media.url} alt="background preview" className="h-24 w-full object-cover" />
            )}
            <button
              type="button"
              onClick={() => setMedia({ url: undefined })}
              title="Remove media"
              className="absolute top-1.5 right-1.5 rounded-lg bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black"
            >
              <Trash2 size={12} aria-hidden />
            </button>
          </div>

          <Button
            variant="outline"
            onClick={async () => {
              if (!media?.url) return
              setExtracting(true)
              const pal = await extractHarmonicPalette(media.url)
              setExtractedPalette(pal)
              setExtracting(false)
            }}
            disabled={extracting}
            className="w-full justify-center text-xs font-bold"
          >
            <Sparkles size={13} className="text-amber-500" />
            <span>{extracting ? 'Analyzing Colors…' : '🪄 Extract Harmonic Theme'}</span>
          </Button>

          {extractedPalette && (
            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white space-y-2">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <span>Harmonic Swatches</span>
                <span className="text-[9px] text-emerald-400">✓ WCAG AAA</span>
              </div>
              <div className="flex items-center gap-1.5">
                {extractedPalette.swatches.map((c, i) => (
                  <div
                    key={i}
                    className="flex-1 h-7 rounded-lg shadow-inner cursor-pointer hover:scale-105 transition-transform"
                    style={{ background: c }}
                    title={`Click to copy: ${c}`}
                    onClick={() => navigator.clipboard.writeText(c)}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  updateRound(round.id, {
                    accentColor: extractedPalette.accent,
                    backgroundColor: extractedPalette.background,
                  })
                }}
                className="w-full py-1.5 rounded-lg bg-[#1E56A0] hover:bg-[#1E56A0]/90 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                Apply Palette to Scene
              </button>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Segmented
          value={media?.type ?? 'image'}
          onChange={(v) => setMedia({ type: v as BackgroundMedia['type'] })}
          options={[
            { value: 'image', label: 'Image' },
            { value: 'video', label: 'Video' },
          ]}
        />
        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <RefreshCw size={13} className="animate-spin" aria-hidden /> : <UploadCloud size={13} aria-hidden />}
          <span>{uploading ? 'Uploading…' : 'Upload'}</span>
        </Button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onUpload(f)
          e.target.value = ''
        }}
      />

      {assets.length > 0 && (
        <select
          value={media?.url ?? ''}
          onChange={(e) => {
            const a = assets.find((x) => assetUrl(x.category, x.filename) === e.target.value)
            if (a) setMedia({ url: e.target.value, type: a.category as BackgroundMedia['type'] })
          }}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 focus:border-[#1E56A0] focus:ring-2 focus:ring-[#1E56A0]/15 focus:outline-none"
        >
          <option value="">Choose saved asset…</option>
          {assets.map((a) => (
            <option key={`${a.category}/${a.filename}`} value={assetUrl(a.category, a.filename)}>
              {a.filename}
            </option>
          ))}
        </select>
      )}

      {!online && <p className="text-[10px] text-slate-400">Backend offline — preview only.</p>}

      {showFraming && (
        <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <Field label="Fit mode">
            <Select
              value={media?.fit ?? 'cover'}
              onChange={(v) => setMedia({ fit: v as BackgroundMedia['fit'] })}
              options={[
                { value: 'cover', label: 'Cover (fill & crop)' },
                { value: 'contain', label: 'Contain (fit inside)' },
                { value: 'fill', label: 'Fill (stretch)' },
              ]}
            />
          </Field>
          <Slider label="Zoom" value={media?.scale ?? 1} onChange={(v) => setMedia({ scale: v })} min={0.5} max={3} step={0.1} />
          <Slider label="X pos" value={media?.posX ?? 50} onChange={(v) => setMedia({ posX: v })} min={0} max={100} unit="%" />
          <Slider label="Y pos" value={media?.posY ?? 50} onChange={(v) => setMedia({ posY: v })} min={0} max={100} unit="%" />
          <Slider label="Dark overlay" value={round.overlayOpacity ?? 0.55} onChange={(v) => updateRound(round.id, { overlayOpacity: v })} min={0} max={1} step={0.05} />
        </div>
      )}
    </div>
  )
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

// Bumper logo picker — upload an image logo or keep the text branding.
// Uploads to the 'image' asset category (preview-only when backend is offline).
function BumperLogoPicker({ value, onChange }: { value?: string; onChange: (v: string | undefined) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const online = useBackendOnline()

  const upload = async (file: File) => {
    setUploading(true)
    try {
      const up = await uploadAsset('image', file)
      onChange(assetUrl(up.category, up.filename))
    } catch {
      onChange(URL.createObjectURL(file))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-2">
      {value && (
        <div className="rounded-lg border border-slate-200 bg-white p-2">
          <img src={value} alt="bumper logo preview" className="h-16 w-full object-contain" />
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) upload(f)
          e.target.value = ''
        }}
      />
      <div className="flex gap-1.5">
        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <RefreshCw size={14} className="animate-spin" aria-hidden /> : <UploadCloud size={14} aria-hidden />}
          {uploading ? 'Uploading…' : value ? 'Replace logo image' : 'Upload logo image'}
        </Button>
        {value && (
          <Button variant="outline" onClick={() => onChange(undefined)}>
            Use text
          </Button>
        )}
      </div>
      {!online && <p className="text-[11px] text-slate-500">Backend offline — image is preview-only.</p>}
    </div>
  )
}

function BumperLivePreview({ bumper }: { bumper: BumperConfig }) {
  const [animKey, setAnimKey] = useState(0)
  const logoRef = useRef<HTMLDivElement>(null)
  const sloganRef = useRef<HTMLDivElement>(null)
  const accentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const anim = bumper.animation ?? { type: 'zoom-in', duration: 0.6, easing: 'ease-out', delay: 0 }
    const animOut = bumper.animationOut ?? { type: 'fade-out', duration: 0.5, easing: 'ease-out', delay: 0 }
    const ease = CSS_EASING[anim.easing] ?? 'cubic-bezier(0.16, 1, 0.3, 1)'
    const easeOut = CSS_EASING[animOut.easing] ?? 'cubic-bezier(0.16, 1, 0.3, 1)'
    const bumperDur = Math.max(0.2, bumper.duration || 2)

    const logo = logoRef.current
    const slogan = sloganRef.current
    const accent = accentRef.current

    ;[logo, slogan, accent].forEach((el) => el?.getAnimations().forEach((a) => a.cancel()))

    if (logo && anim.type !== 'none') {
      logo.animate(waaiKeyframes(anim.type), {
        duration: Math.max(10, anim.duration * 1000),
        easing: ease,
        fill: 'both',
        delay: (anim.delay ?? 0) * 1000,
      })
    }

    if (logo && animOut.type !== 'none') {
      const outStart = Math.max(
        (anim.delay || 0) + (anim.duration || 0),
        bumperDur - animOut.duration - (animOut.delay || 0)
      )
      logo.animate(waaiOutKeyframes(animOut.type), {
        duration: Math.max(10, animOut.duration * 1000),
        easing: easeOut,
        fill: 'forwards',
        delay: outStart * 1000,
      })
    }

    if (slogan) {
      slogan.animate(
        [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'translateY(0px)' }],
        { duration: 500, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'both', delay: ((anim.delay ?? 0) + 0.1) * 1000 }
      )
    }

    if (accent) {
      accent.animate(
        [{ opacity: 0, transform: 'scaleX(0)' }, { opacity: 1, transform: 'scaleX(1)' }],
        { duration: 350, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'both' }
      )
    }
  }, [bumper, animKey])

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 shadow-inner my-2">
      <div
        className="h-44 w-full flex flex-col items-center justify-center p-4 transition-colors relative select-none"
        style={{ background: bumper.backgroundColor || '#0b0b0f' }}
        dir="rtl"
      >
        <div
          ref={accentRef}
          className="h-1.5 w-12 rounded-full mb-3 origin-center"
          style={{ background: bumper.accentColor || '#e63946' }}
        />
        <div ref={logoRef} className="flex items-center justify-center max-w-[80%] max-h-12">
          {bumper.logoImageUrl ? (
            <img src={bumper.logoImageUrl} alt="logo" className="max-h-12 max-w-full object-contain" />
          ) : (
            <div className="text-white text-2xl font-bold tracking-wider text-center drop-shadow-sm">
              {bumper.logoText || 'KASHIDA'}
            </div>
          )}
        </div>
        {bumper.slogan && (
          <div ref={sloganRef} className="text-white/70 text-xs font-medium mt-2 text-center">
            {bumper.slogan}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => setAnimKey((k) => k + 1)}
        className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/60 hover:bg-black/80 text-white/90 px-2 py-1 rounded-lg text-[10px] font-bold backdrop-blur-xs transition-colors cursor-pointer"
      >
        <RotateCcw size={11} aria-hidden /> Replay
      </button>
    </div>
  )
}
