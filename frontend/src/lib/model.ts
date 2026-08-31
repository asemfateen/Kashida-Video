// TemplateModel — the canonical JSON schema describing a video template design.
// The Visual Editor edits a model (never HTML); the Code Generator is the only
// thing that touches HTML. The model is also the save/load format.

export type LayerType =
  | 'headline' // main Arabic headline (content filled at render time)
  | 'subheadline' // secondary text (content filled at render time)
  | 'label' // badge with AR + EN text (content filled at render time)
  | 'logo' // brand text (كشيدة / kashida.io) — static design
  | 'accentBar' // accent-colored bar — static design
  | 'card' // frosted glass container / ticker box — static design
  | 'shape' // canva-style vector shape / ribbon / box object
  | 'background' // media image/video + overlay
  | 'footer' // bottom bar text — static design
  | 'timestamp' // timestamp text (content filled at render time)

export type ShapeType =
  | 'box' // standard rectangle
  | 'rounded-box' // rounded card / panel
  | 'pill' // stadium / pill capsule
  | 'circle' // circle / ellipse
  | 'ribbon' // broadcast news ribbon with folded 3D ends
  | 'skewed-banner' // slanted / bent news ticker bar
  | 'diagonal-badge' // corner banner
  | 'speech-bubble' // callout with tail
  | 'star' // multi-point star
  | 'bracket' // frame bracket

export type AnimationType =
  | 'none'
  | 'fade-in'
  | 'slide-up'
  | 'slide-down'
  | 'slide-right'
  | 'slide-left'
  | 'zoom-in'
  | 'pop-bounce'
  | 'wipe-rtl'
  | 'word-stagger'
  | 'flip-up'
  | 'blur-reveal'

export type BumperOutType =
  | 'none'
  | 'fade-out'
  | 'slide-up'
  | 'slide-down'
  | 'slide-left'
  | 'slide-right'
  | 'zoom-out'

export type ExitAnimationType =
  | 'none'
  | 'fade-out'
  | 'slide-down'
  | 'slide-up'
  | 'slide-left'
  | 'slide-right'
  | 'zoom-out'

export type EasingName =
  | 'ease-out'
  | 'ease-in-out'
  | 'ease-in'
  | 'back-out'
  | 'elastic'
  | 'spring'
  | 'expo-out'
  | 'linear'

export interface EntranceAnimation {
  type: AnimationType
  duration: number // seconds
  delay: number // seconds
  easing: EasingName
  stagger?: number // seconds per word (for word-stagger)
}

export interface ExitAnimation {
  type: ExitAnimationType
  duration: number // seconds
  delay: number // seconds from end of round (e.g. 0.5s before end)
  easing: EasingName
}

// The bumper logo's exit transition — how it animates OUT at the end of a bumper
// segment (mirrors EntranceAnimation but with its own out-direction presets).
export interface BumperExitAnimation {
  type: BumperOutType
  duration: number // seconds
  delay: number // seconds
  easing: EasingName
}

export type TextAlign = 'start' | 'center' | 'end'

export interface BackgroundMedia {
  type: 'image' | 'video'
  url: string
  fit: 'cover' | 'contain' | 'fill'
  scale: number // 0.5 .. 3
  posX: number // 0..100 (object-position)
  posY: number // 0..100
}

export type AspectRatioId = '9:16' | '1:1' | '16:9' | '4:5'

export interface AspectRatioPreset {
  id: AspectRatioId
  name: string
  width: number
  height: number
  label: string
}

export const ASPECT_RATIOS: AspectRatioPreset[] = [
  { id: '9:16', name: 'Reels / TikTok / Story (9:16)', width: 1080, height: 1920, label: '9:16' },
  { id: '1:1', name: 'Square Feed (1:1)', width: 1080, height: 1080, label: '1:1' },
  { id: '16:9', name: 'YouTube / Broadcast (16:9)', width: 1920, height: 1080, label: '16:9' },
  { id: '4:5', name: 'Portrait Feed (4:5)', width: 1080, height: 1350, label: '4:5' },
]

export interface Layer {
  id: string
  name: string
  type: LayerType
  visible: boolean
  locked: boolean
  // Position & size as percentages of the canvas (0..100).
  x: number
  y: number
  width: number // 0 = auto (natural text width)
  textAlign: TextAlign
  // Typography / colour (text layers).
  fontSize: number // px, relative to a 1080-wide canvas
  fontWeight: number
  fontFamily?: string // Custom Arabic font
  kashida?: number // 0..100 Tatweel extension
  textShadow?: string // 'none' | 'subtle' | 'glow' | '3d'
  textStroke?: string // e.g. '2px #000000'
  gradient?: string // gradient fill
  color: string
  opacity: number // 0..1 base opacity
  animation: EntranceAnimation
  animationOut?: ExitAnimation
  // Multi-round persistence:
  persistentStyle?: boolean
  animateFirstRoundOnly?: boolean
  // Type-specific content & styling.
  text?: string // headline / subheadline / logo / footer / timestamp (default text)
  imageUrl?: string // logo — optional image logo (replaces text when set)
  labelAr?: string // label — Arabic badge text (default)
  labelEn?: string // label — English badge text (default)
  backgroundColor?: string // label, accentBar, card, shape
  border?: string // card border (e.g. "2px solid rgba(255,183,3,0.35)")
  borderRadius?: number // card/shape border-radius (px)
  backdropBlur?: number // card/shape backdrop-filter blur (px)
  height?: number // accentBar, card, or shape height (px)
  widgetType?: string // breaking_ticker, speaker_card, match_score, location_tag, progress_bar
  // Canva Shape & Object Deformation Properties:
  shapeType?: ShapeType
  rotation?: number // -180..180 deg
  skewX?: number // -60..60 deg (Horizontal Bend / Slant)
  skewY?: number // -60..60 deg (Vertical Bend / Slant)
  fillType?: 'solid' | 'gradient' | 'glass'
  gradientAngle?: number // 0..360 deg
  gradientColorStart?: string
  gradientColorEnd?: string
  strokeWidth?: number // px
  strokeColor?: string
  strokeStyle?: 'solid' | 'dashed' | 'dotted'
  shadowBlur?: number // px
  shadowColor?: string
  shadowOffsetX?: number // px
  shadowOffsetY?: number // px
  glowColor?: string
  glowSpread?: number // px
  ribbonFold?: boolean // 3D folded ends for broadcast ribbons
  // background
  backgroundMedia?: BackgroundMedia
  overlayOpacity?: number // 0..1
}

// A round is one news item within a multi-round video. The template's layers
// define the *design* (positions, styles, animations); each round supplies the
// *content* that fills those layers at render time. A template with a single
// round behaves exactly like the legacy single-headline flow.
export interface TemplateRound {
  id: string
  name: string
  headline: string
  subheadline: string
  labelAr: string
  labelEn: string
  timestamp: string
  accentColor: string
  backgroundColor: string
  backgroundMedia?: BackgroundMedia
  overlayOpacity: number // 0..1
  duration: number // seconds; 0 = derive from media at render time
}

export interface TemplateModel {
  id: string
  name: string
  description: string
  width: number
  height: number
  fps: number
  duration: number // seconds (render length)
  backgroundColor: string
  accentColor: string
  layers: Layer[]
  rounds: TemplateRound[]
  // Optional brand "bumper" — a logo + transition interstitial that can play
  // before the first round (intro), between rounds (interstitial), and after
  // the last round (outro). Absent/disabled = no bumpers (legacy behaviour).
  bumper?: BumperConfig
}

// Bumper config — the brand break screen between news rounds. Fully edited in
// the template maker (never hardcoded): the logo entrance transition is the
// "transition" the user picks, and duration is user-settable.
export interface BumperConfig {
  enabled: boolean
  showIntro: boolean // before the first round
  showInterstitial: boolean // between each pair of rounds
  showOutro: boolean // after the last round
  duration: number // seconds per bumper
  backgroundColor: string
  accentColor: string
  logoImageUrl?: string // optional image logo (replaces text)
  logoText: string // branding text fallback
  slogan: string // e.g. "كشيدة · kashida.io"
  animation: EntranceAnimation // the logo entrance transition
  animationOut: BumperExitAnimation // how the logo exits at the end of the bumper
}

// A bumper that produces no extra segments (a clean default for legacy data).
export function defaultBumper(overrides: Partial<BumperConfig> = {}): BumperConfig {
  return {
    enabled: false,
    showIntro: true,
    showInterstitial: true,
    showOutro: true,
    duration: 2,
    backgroundColor: '#0b0b0f',
    accentColor: '#e63946',
    logoText: 'KASHIDA',
    slogan: 'كشيدة · kashida.io',
    animation: { type: 'zoom-in', duration: 0.6, delay: 0, easing: 'ease-out' },
    animationOut: { type: 'fade-out', duration: 0.5, delay: 0, easing: 'ease-out' },
    ...overrides,
  }
}

// Whether a template currently produces bumpers (fast check used by UI).
export function bumperEnabled(m: TemplateModel): boolean {
  return !!(m.bumper && m.bumper.enabled)
}

export const MODEL_VERSION = 1
export const CANVAS_WIDTH = 1080
export const CANVAS_HEIGHT = 1920

export function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

export const LAYER_TYPE_LABELS: Record<LayerType, string> = {
  headline: 'Headline',
  subheadline: 'Subheadline',
  label: 'Badge / Label',
  logo: 'Logo',
  accentBar: 'Accent bar',
  card: 'Glass Card',
  shape: 'Graphic Shape / Object',
  background: 'Background media',
  footer: 'Footer',
  timestamp: 'Timestamp',
}

export const ANIMATION_LABELS: Record<AnimationType, string> = {
  none: 'None',
  'fade-in': 'Fade in',
  'slide-up': 'Slide up',
  'slide-down': 'Slide down (from top)',
  'slide-right': 'Slide in from right',
  'slide-left': 'Slide in from left',
  'zoom-in': 'Zoom in',
  'pop-bounce': 'Pop & Bounce',
  'wipe-rtl': 'Wipe Reveal (RTL)',
  'word-stagger': 'Word-by-Word Stagger',
  'flip-up': '3D Flip Up',
  'blur-reveal': 'Blur Reveal',
}

export const EASING_LABELS: Record<EasingName, string> = {
  'ease-out': 'Ease out (smooth)',
  'ease-in-out': 'Ease in-out (cinematic)',
  'ease-in': 'Ease in (accelerate)',
  'back-out': 'Back out (overshoot)',
  elastic: 'Elastic (bouncy)',
  spring: 'Spring (dynamic)',
  'expo-out': 'Expo out (snappy)',
  linear: 'Linear (constant)',
}

export function defaultAnimation(): EntranceAnimation {
  return { type: 'fade-in', duration: 0.6, delay: 0, easing: 'ease-out' }
}

export function newLayer(type: LayerType, overrides: Partial<Layer> = {}): Layer {
  const base: Layer = {
    id: uid(),
    name: LAYER_TYPE_LABELS[type],
    type,
    visible: true,
    locked: false,
    x: 10,
    y: 50,
    width: 0,
    textAlign: 'center',
    fontSize: 72,
    fontWeight: 700,
    color: '#ffffff',
    opacity: 1,
    animation: defaultAnimation(),
    persistentStyle: type === 'logo' || type === 'accentBar' || type === 'footer',
    animateFirstRoundOnly: type === 'logo' || type === 'accentBar' || type === 'footer',
  }
  switch (type) {
    case 'headline':
      base.text = 'Main Headline'
      base.textAlign = 'center'
      base.fontSize = 72
      base.width = 84
      base.x = 8
      base.y = 62
      break
    case 'subheadline':
      base.text = 'Secondary details appear here'
      base.textAlign = 'center'
      base.fontSize = 38
      base.fontWeight = 400
      base.color = 'rgba(255,255,255,0.65)'
      base.width = 84
      base.x = 8
      base.y = 74
      break
    case 'label':
      base.labelAr = 'NEWS'
      base.labelEn = 'ALERT'
      base.backgroundColor = '#e63946'
      base.x = 8
      base.y = 84
      base.textAlign = 'start'
      break
    case 'logo':
      base.text = 'KASHIDA'
      base.textAlign = 'start'
      base.fontSize = 64
      base.x = 8
      base.y = 5
      break
    case 'accentBar':
      base.backgroundColor = '#e63946'
      base.width = 1.5
      base.height = 100
      base.x = 92
      base.y = 0
      base.textAlign = 'start'
      break
    case 'card':
      base.backgroundColor = 'rgba(15,23,42,0.85)'
      base.border = '2px solid rgba(255,183,3,0.3)'
      base.borderRadius = 28
      base.backdropBlur = 16
      base.width = 88
      base.height = 420
      base.x = 6
      base.y = 52
      base.animation = { type: 'slide-up', duration: 0.8, delay: 0.6, easing: 'ease-out' }
      break
    case 'shape':
      base.name = 'Shape Object'
      base.shapeType = 'rounded-box'
      base.x = 10
      base.y = 40
      base.width = 80
      base.height = 180
      base.backgroundColor = 'rgba(30,86,160,0.85)'
      base.borderRadius = 24
      base.fillType = 'gradient'
      base.gradientAngle = 135
      base.gradientColorStart = '#1E56A0'
      base.gradientColorEnd = '#E63946'
      base.rotation = 0
      base.skewX = 0
      base.skewY = 0
      base.shadowBlur = 25
      base.shadowColor = 'rgba(0,0,0,0.5)'
      base.shadowOffsetY = 10
      base.persistentStyle = true
      base.animation = { type: 'zoom-in', duration: 0.6, delay: 0.2, easing: 'back-out' }
      break
    case 'background':
      base.x = 0
      base.y = 0
      base.width = 100
      base.height = 100
      base.overlayOpacity = 0.55
      base.animation = { type: 'none', duration: 0, delay: 0, easing: 'linear' }
      break
    case 'footer':
      base.text = 'kashida.io'
      base.textAlign = 'start'
      base.fontSize = 24
      base.fontWeight = 400
      base.color = 'rgba(255,255,255,0.35)'
      base.x = 8
      base.y = 95.5
      break
    case 'timestamp':
      base.text = ''
      base.textAlign = 'start'
      base.fontSize = 22
      base.fontWeight = 400
      base.color = 'rgba(255,255,255,0.3)'
      base.y = 91
      break
  }
  return { ...base, ...overrides }
}

export function defaultTemplate(): TemplateModel {
  return {
    id: 'new-template',
    name: 'New Template',
    description: '',
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    fps: 30,
    duration: 5,
    backgroundColor: '#0b0b0f',
    accentColor: '#e63946',
    layers: [
      newLayer('background'),
      newLayer('logo'),
      newLayer('accentBar'),
      newLayer('label'),
      newLayer('headline'),
      newLayer('subheadline'),
      newLayer('timestamp'),
      newLayer('footer'),
    ],
    rounds: [defaultRound({ name: 'First Round' })],
    bumper: defaultBumper(),
  }
}

// A fresh round seeded from the template's current design defaults.
export function defaultRound(overrides: Partial<TemplateRound> = {}): TemplateRound {
  return {
    id: uid(),
    name: 'First Round',
    headline: 'Main Headline',
    subheadline: 'Secondary details appear here',
    labelAr: 'NEWS',
    labelEn: 'ALERT',
    timestamp: '',
    accentColor: '#e63946',
    backgroundColor: '#0b0b0f',
    overlayOpacity: 0.55,
    duration: 0,
    ...overrides,
  }
}

// Seed a round from a template's design defaults (used when loading a saved
// template that predates the rounds feature).
export function roundFromTemplate(t: TemplateModel): TemplateRound {
  const hl = t.layers.find((l) => l.type === 'headline')
  const sh = t.layers.find((l) => l.type === 'subheadline')
  const lb = t.layers.find((l) => l.type === 'label')
  const ts = t.layers.find((l) => l.type === 'timestamp')
  const bg = t.layers.find((l) => l.type === 'background')
  return defaultRound({
    headline: hl?.text || 'Main Headline',
    subheadline: sh?.text || '',
    labelAr: lb?.labelAr || 'NEWS',
    labelEn: lb?.labelEn || 'ALERT',
    timestamp: ts?.text || '',
    accentColor: t.accentColor,
    backgroundColor: t.backgroundColor,
    backgroundMedia: bg?.backgroundMedia,
    overlayOpacity: bg?.overlayOpacity ?? 0.55,
  })
}

// Map a round's content onto a copy of the template's layers so the canvas can
// preview exactly what that round will render. Returns a new layers array.
export function applyRoundToLayers(layers: Layer[], round: TemplateRound): Layer[] {
  return layers.map((l) => {
    switch (l.type) {
      case 'headline':
        return { ...l, text: round.headline }
      case 'subheadline':
        return { ...l, text: round.subheadline }
      case 'label':
        return { ...l, labelAr: round.labelAr, labelEn: round.labelEn, backgroundColor: l.backgroundColor ?? round.accentColor }
      case 'timestamp':
        return { ...l, text: round.timestamp }
      case 'accentBar':
        return { ...l, backgroundColor: l.backgroundColor ?? round.accentColor }
      case 'background':
        return { ...l, backgroundMedia: round.backgroundMedia, overlayOpacity: round.overlayOpacity }
      default:
        return l
    }
  })
}

// Coerce arbitrary saved template data into a valid TemplateModel.
// New saves store a TemplateModel; legacy backend seeds store a VideoRequest
// shape (no `layers`). Detect and convert so both open cleanly.
export function coerceTemplate(data: Record<string, unknown>): TemplateModel {
  if (Array.isArray(data.layers)) {
    const t = JSON.parse(JSON.stringify(data)) as TemplateModel
    // Backward compatibility: older saved templates have no `rounds`.
    if (!Array.isArray(t.rounds) || t.rounds.length === 0) {
      t.rounds = [roundFromTemplate(t)]
    }
    // Backward compatibility: templates that predate the bumper feature have
    // no `bumper` — keep it absent so they render exactly as before.
    if (t.bumper) {
      // Backward compatibility: older bumpers only stored the entrance
      // animation. Backfill the exit transition so the editor + preview don't
      // crash on `animationOut`.
      const b = t.bumper
      if (!b.animationOut) {
        b.animationOut = { type: 'fade-out', duration: 0.5, delay: 0, easing: 'ease-out' }
      }
      if (!b.animation) {
        b.animation = { type: 'zoom-in', duration: 0.6, delay: 0, easing: 'ease-out' }
      }
    }
    return t
  }
  const t = defaultTemplate()
  t.id = String(data.id ?? t.id)
  t.name = String(data.name ?? data.template ?? t.name)
  t.description = String(data.description ?? '')
  t.duration = Number(data.duration ?? t.duration)
  t.fps = Number(data.fps ?? t.fps)
  t.accentColor = String(data.accentColor ?? t.accentColor)
  t.backgroundColor = String(data.backgroundColor ?? t.backgroundColor)
  if (typeof data.resolution === 'object' && data.resolution) {
    const r = data.resolution as { width?: number; height?: number }
    if (r.width) t.width = r.width
    if (r.height) t.height = r.height
  }
  for (const l of t.layers) {
    if (l.type === 'headline') l.text = String(data.headline ?? l.text)
    if (l.type === 'subheadline') l.text = String(data.subheadline ?? l.text)
    if (l.type === 'label') {
      l.labelAr = String(data.labelAr ?? l.labelAr)
      l.labelEn = String(data.labelEn ?? l.labelEn)
    }
    if (l.type === 'timestamp') l.text = String(data.timestamp ?? '')
  }
  // Seed the first round from the legacy VideoRequest content.
  t.rounds = [roundFromTemplate(t)]
  return t
}

// Calculates the new array index when reordering layers in the layer stack.
// Keeps background locked at index 0 if present.
export function calculateDropIndex(
  fromIndex: number,
  targetIndex: number,
  position: 'above' | 'below',
  totalLayers: number,
  hasBackground = true
): number {
  if (fromIndex < 0 || targetIndex < 0 || totalLayers <= 0) return fromIndex

  const desiredPosition = position === 'below' ? targetIndex + 1 : targetIndex
  let finalIndex = desiredPosition
  if (fromIndex < desiredPosition) {
    finalIndex -= 1
  }

  const minIndex = hasBackground ? 1 : 0
  const maxIndex = Math.max(minIndex, totalLayers - 1)
  return Math.max(minIndex, Math.min(maxIndex, finalIndex))
}

// Align layer horizontally centered within canvas bounds (0..100%).
export function alignLayerH(layer: Layer): { x: number } {
  const width = layer.width && layer.width > 0 ? layer.width : 0
  const x = width > 0 ? Math.max(0, Math.min(100, Math.round((100 - width) / 2))) : 50
  return { x }
}

// Align layer vertically centered within canvas bounds (0..100%).
export function alignLayerV(layer: Layer, canvasHeight = CANVAS_HEIGHT): { y: number } {
  let heightPct = 0
  if (layer.height && layer.height > 0) {
    heightPct = (layer.height / canvasHeight) * 100
  }
  const y = heightPct > 0 ? Math.max(0, Math.min(100, Math.round((100 - heightPct) / 2))) : 50
  return { y }
}

// Duplicate a layer with a new unique ID and slight offset within canvas bounds.
export function duplicateLayerModel(layer: Layer): Layer {
  const isBg = layer.type === 'background'
  return {
    ...JSON.parse(JSON.stringify(layer)),
    id: uid(),
    name: isBg ? layer.name : `${layer.name} (Copy)`,
    x: isBg ? layer.x : Math.max(0, Math.min(100, Math.round(layer.x + 3))),
    y: isBg ? layer.y : Math.max(0, Math.min(100, Math.round(layer.y + 3))),
  }
}

// Duplicate a round with a new unique ID and copy name.
export function duplicateRoundModel(round: TemplateRound): TemplateRound {
  return {
    ...JSON.parse(JSON.stringify(round)),
    id: uid(),
    name: `${round.name} (Copy)`,
  }
}

