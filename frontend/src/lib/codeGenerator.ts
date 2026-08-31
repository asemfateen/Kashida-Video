// Code Generator — the ONLY thing that touches HTML.
// Deterministic: TemplateModel -> self-contained HTML + GSAP template string.
// The emitted template satisfies the renderer contract: it exposes
// `window.loadNewsData(data)` and `window.seekToFrame(frame, fps)`.

import type { TemplateModel, Layer, TextAlign } from './model'
import { gsapFrom, gsapOut, GSAP_EASING } from './animations'
import { applyKashida } from './fonts'

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function cssAlign(ta: TextAlign): string {
  switch (ta) {
    case 'center':
      return 'center'
    case 'end':
      return 'left'
    case 'start':
    default:
      return 'right'
  }
}

// A layer's background (or null for pure-text layers).
function bgColor(layer: Layer): string | null {
  return layer.backgroundColor ?? null
}

export interface GeneratedTemplate {
  html: string
  filename: string
}

export function templateFilename(model: TemplateModel): string {
  const id = model.id.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase() || 'template'
  return `${id}.html`
}

export function generateTemplateHTML(model: TemplateModel): GeneratedTemplate {
  const w = model.width || 1080
  const h = model.height || 1920
  const layers = model.layers
  const nonBg = layers.filter((l) => l.type !== 'background')
  const bg = layers.find((l) => l.type === 'background')

  // --- CSS ------------------------------------------------------------------
  const cssLines: string[] = []
  cssLines.push(`html, body { width:${w}px; height:${h}px; overflow:hidden; margin:0; padding:0; background:${model.backgroundColor}; font-family:'Thmanyah Sans','Plus Jakarta Sans',system-ui,sans-serif; direction:rtl; }`)
  cssLines.push(`.container{position:relative;width:${w}px;height:${h}px;background:${model.backgroundColor};overflow:hidden;}`)
  cssLines.push(`.bg-media{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;}`)
  cssLines.push(`.bg-overlay{position:absolute;inset:0;z-index:1;background:linear-gradient(180deg,rgba(11,11,15,.25) 0%,rgba(11,11,15,.15) 40%,rgba(11,11,15,.9) 100%);pointer-events:none;}`)
  cssLines.push(`.el{position:absolute;box-sizing:border-box;will-change:opacity,transform;overflow:visible;}`)

  // Bumper scene — the brand logo + transition interstitial between rounds. The
  // logo entrance animation IS the transition (no crossfade/xfade needed). This
  // scene lives in the same HTML document; only one scene is visible at a time.
  const bFont = Math.max(24, Math.round((w * 120) / 1080))
  const bSlogan = Math.max(16, Math.round((w * 34) / 1080))
  cssLines.push(`.news-scene{position:absolute;inset:0;z-index:2;}`)
  cssLines.push(`.bumper-scene{position:absolute;inset:0;z-index:3;display:none;overflow:hidden;}`)
  cssLines.push(`#bAcc{position:absolute;left:50%;top:33%;transform:translateX(-50%);width:${Math.max(40, Math.round(w * 0.13))}px;height:8px;border-radius:10px;}`)
  cssLines.push(`#b0{position:absolute;left:0;right:0;top:40%;text-align:center;font-weight:700;font-size:${bFont}px;line-height:1.1;color:#fff;}`)
  cssLines.push(`#b0 img{max-width:64%;height:auto;object-fit:contain;}`)
  cssLines.push(`#b1{position:absolute;left:0;right:0;top:56%;text-align:center;font-weight:400;font-size:${bSlogan}px;color:rgba(255,255,255,.55);}`)

  nonBg.forEach((l, i) => {
    const id = `l${i}`
    const width = l.width && l.width > 0 ? l.width + '%' : 'auto'
    const align = cssAlign(l.textAlign)
    const shadowStyle = l.textShadow === '3d'
      ? 'text-shadow:0 4px 0 #000, 0 8px 20px rgba(0,0,0,0.8);'
      : l.textShadow === 'glow'
      ? `text-shadow:0 0 20px ${l.color || '#fff'}, 0 0 40px ${model.accentColor};`
      : l.textShadow === 'subtle'
      ? 'text-shadow:0 2px 8px rgba(0,0,0,0.6);'
      : ''
    const strokeStyle = l.textStroke ? `-webkit-text-stroke:${l.textStroke};` : ''
    const familyStyle = l.fontFamily ? `font-family:${l.fontFamily};` : ''
    const gradientStyle = l.gradient ? `background:${l.gradient};-webkit-background-clip:text;-webkit-text-fill-color:transparent;` : ''
    const isText = l.type !== 'accentBar' && l.type !== 'card'
    const fontStyles = isText
      ? `font-size:${l.fontSize}px;font-weight:${l.fontWeight};color:${l.color};${familyStyle}${shadowStyle}${strokeStyle}${gradientStyle}`
      : (l.color ? `color:${l.color};` : '')
    const lineHeight = (l.type === 'headline' || l.type === 'subheadline')
      ? 'line-height:1.6;'
      : ''
    const bidiStyle = isText ? 'unicode-bidi:plaintext;' : ''
    const bgStyle = l.backgroundColor && l.type !== 'accentBar' && l.type !== 'card' && l.type !== 'label'
      ? `background:${l.backgroundColor};border-radius:${l.borderRadius ?? 20}px;padding:12px 24px;display:inline-flex;align-items:center;justify-content:${l.textAlign === 'center' ? 'center' : l.textAlign === 'end' ? 'flex-end' : 'flex-start'};line-height:1.2;box-shadow:0 8px 24px rgba(0,0,0,0.35);`
      : ''
    const heightStyle = l.height && l.type !== 'background' && l.type !== 'accentBar' && l.type !== 'card' ? `height:${l.height}px;` : ''
    cssLines.push(`#${id}{left:${l.x}%;top:${l.y}%;width:${width};text-align:${align};${lineHeight}${bidiStyle}${fontStyles}${bgStyle}${heightStyle}opacity:${l.opacity};z-index:${i + 2};}`)
    if (l.type === 'label') {
      cssLines.push(`#${id} .lb{display:inline-flex;align-items:center;gap:14px;background:${bgColor(l) ?? model.accentColor};padding:14px 30px;color:#fff;line-height:1;}`)
      cssLines.push(`#${id} .lb-ar{font-size:${l.fontSize}px;font-weight:700;}`)
      cssLines.push(`#${id} .lb-en{font-size:${Math.round(l.fontSize * 0.62)}px;font-weight:700;opacity:.85;text-transform:uppercase;letter-spacing:3px;}`)
      cssLines.push(`#${id} .tournament-badge-wrap{display:inline-flex;position:relative;filter:drop-shadow(0 14px 28px rgba(0,0,0,0.55));}`)
      cssLines.push(`#${id} .tournament-badge{display:inline-flex;direction:ltr;align-items:stretch;background:${bgColor(l) ?? '#7C3AED'};border-radius:0 9999px 9999px 0;height:76px;}`)
      cssLines.push(`#${id} .fifa-tab{background:#000000;border-radius:14px 0 0 0;position:relative;padding:8px 14px 4px 14px;display:flex;align-items:center;justify-content:center;}`)
      cssLines.push(`#${id} .fifa-tail{position:absolute;bottom:-16px;left:0;width:0;height:0;border-top:16px solid #000000;border-right:18px solid transparent;}`)
      cssLines.push(`#${id} .tournament-text{padding:0 34px 0 22px;display:flex;align-items:center;justify-content:center;font-size:38px;font-weight:900;color:#ffffff;direction:rtl;letter-spacing:2px;font-family:'Thmanyah Sans',system-ui,sans-serif;}`)
    }
    if (l.type === 'timestamp' && l.text && l.text.includes('@')) {
      cssLines.push(`#${id} .credit-box{display:flex;flex-direction:column;align-items:flex-end;gap:6px;}`)
      cssLines.push(`#${id} .credit-pill{display:inline-flex;direction:ltr;align-items:stretch;border-radius:10px;overflow:hidden;box-shadow:0 6px 16px rgba(0,0,0,0.45);}`)
      cssLines.push(`#${id} .credit-pill .handle{background:#0B0F19;color:#ffffff;font-size:20px;font-weight:800;padding:6px 14px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;display:flex;align-items:center;}`)
      cssLines.push(`#${id} .credit-pill .cam-icon{background:#FF4500;padding:6px 12px;display:flex;align-items:center;justify-content:center;color:#ffffff;}`)
      cssLines.push(`#${id} .date-txt{font-size:20px;font-weight:800;color:#ffffff;text-shadow:0 2px 10px rgba(0,0,0,0.85);font-family:'Plus Jakarta Sans',system-ui,sans-serif;letter-spacing:0.5px;text-align:right;}`)
    }
    if (l.text && l.text.includes('📍')) {
      cssLines.push(`#${id} .location-pin-badge{display:inline-flex;align-items:center;gap:10px;filter:drop-shadow(0 4px 10px rgba(0,0,0,0.7));}`)
      cssLines.push(`#${id} .loc-text{font-size:32px;font-weight:900;color:#ffffff;letter-spacing:1px;font-family:'Thmanyah Sans',sans-serif;}`)
      cssLines.push(`#${id} .loc-pin{display:flex;flex-direction:column;align-items:center;position:relative;}`)
      cssLines.push(`#${id} .loc-dash{width:18px;height:5px;background:#7C3AED;border-radius:3px;margin-top:-2px;}`)
    }
    if (l.widgetType === 'breaking_ticker') {
      cssLines.push(`#${id} .ticker-box{display:flex;align-items:center;background:#DC2626;color:#fff;padding:8px 24px;border-radius:12px;box-shadow:0 10px 25px rgba(220,38,38,0.4);font-weight:900;gap:16px;}`)
      cssLines.push(`#${id} .ticker-flash{background:#fff;color:#DC2626;padding:4px 12px;border-radius:6px;font-size:0.8em;text-transform:uppercase;animation:pulse 1s infinite;}`)
    }
    if (l.widgetType === 'speaker_card') {
      cssLines.push(`#${id} .speaker-tag{display:flex;align-items:center;gap:14px;background:rgba(15,23,42,0.85);padding:10px 20px;border-radius:18px;border-right:5px solid ${model.accentColor};box-shadow:0 12px 30px rgba(0,0,0,0.5);}`)
      cssLines.push(`#${id} .speaker-name{font-size:1.1em;font-weight:900;color:#fff;}`)
      cssLines.push(`#${id} .speaker-role{font-size:0.8em;opacity:0.85;color:${model.accentColor};}`)
    }
    if (l.widgetType === 'progress_bar') {
      cssLines.push(`#${id} .bar-track{width:100%;height:8px;background:rgba(255,255,255,0.2);border-radius:4px;overflow:hidden;}`)
      cssLines.push(`#${id} .bar-fill{height:100%;background:${model.accentColor};width:0%;border-radius:4px;}`)
    }
    if (l.type === 'accentBar') {
      cssLines.push(`#${id}{height:${l.height ?? h}px;background:${bgColor(l) ?? model.accentColor};}`)
    }
    if (l.type === 'card') {
      cssLines.push(`#${id}{height:${l.height ? l.height + 'px' : 'auto'};background:${l.backgroundColor || 'rgba(15,23,42,0.85)'};border:${l.border || '1px solid rgba(255,255,255,0.15)'};border-radius:${l.borderRadius ?? 28}px;backdrop-filter:blur(${l.backdropBlur ?? 16}px);box-shadow:0 25px 50px rgba(0,0,0,0.6);}`)
    }
    if (l.type === 'shape') {
      const radius = l.shapeType === 'circle' ? '50%' : l.shapeType === 'pill' ? '9999px' : `${l.borderRadius ?? 20}px`
      let bg = l.backgroundColor || model.accentColor || '#1E56A0'
      if (l.fillType === 'gradient') {
        const start = l.gradientColorStart || model.accentColor || '#1E56A0'
        const end = l.gradientColorEnd || '#E63946'
        const angle = l.gradientAngle ?? 135
        bg = `linear-gradient(${angle}deg, ${start}, ${end})`
      } else if (l.fillType === 'glass') {
        bg = l.backgroundColor || 'rgba(15,23,42,0.75)'
      }
      let clip = ''
      switch (l.shapeType) {
        case 'triangle':
          clip = 'clip-path:polygon(50% 0%, 0% 100%, 100% 100%);-webkit-clip-path:polygon(50% 0%, 0% 100%, 100% 100%);'
          break
        case 'star':
          clip = 'clip-path:polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);-webkit-clip-path:polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);'
          break
        case 'hexagon':
          clip = 'clip-path:polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);-webkit-clip-path:polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);'
          break
        case 'ribbon':
        case 'banner':
          clip = 'clip-path:polygon(0% 0%, 92% 0%, 100% 50%, 92% 100%, 0% 100%, 8% 50%);-webkit-clip-path:polygon(0% 0%, 92% 0%, 100% 50%, 92% 100%, 0% 100%, 8% 50%);'
          break
        case 'arrow':
          clip = 'clip-path:polygon(0% 25%, 65% 25%, 65% 0%, 100% 50%, 65% 100%, 65% 75%, 0% 75%);-webkit-clip-path:polygon(0% 25%, 65% 25%, 65% 0%, 100% 50%, 65% 100%, 65% 75%, 0% 75%);'
          break
      }
      const blur = l.backdropBlur || (l.fillType === 'glass' ? 16 : 0)
      const blurStyle = blur ? `backdrop-filter:blur(${blur}px);-webkit-backdrop-filter:blur(${blur}px);` : ''
      const border = l.strokeWidth ? `border:${l.strokeWidth}px ${l.strokeStyle || 'solid'} ${l.strokeColor || '#ffffff'};` : (l.border ? `border:${l.border};` : '')
      const shadows: string[] = []
      if (l.shadowBlur) {
        shadows.push(`${l.shadowOffsetX ?? 0}px ${l.shadowOffsetY ?? 10}px ${l.shadowBlur}px ${l.shadowColor || 'rgba(0,0,0,0.5)'}`)
      }
      if (l.glowSpread) {
        shadows.push(`0 0 ${l.glowSpread}px ${l.glowColor || model.accentColor}`)
      }
      const shadowStyle = shadows.length > 0 ? `box-shadow:${shadows.join(', ')};` : ''
      const height = l.height ? `${l.height}px` : (l.shapeType === 'circle' ? '220px' : '180px')
      const aspectRatio = l.shapeType === 'circle' ? 'aspect-ratio:1/1;' : ''
      const transforms: string[] = []
      if (l.rotation) transforms.push(`rotate(${l.rotation}deg)`)
      if (l.skewX) transforms.push(`skewX(${l.skewX}deg)`)
      if (l.skewY) transforms.push(`skewY(${l.skewY}deg)`)
      const transformStyle = transforms.length > 0 ? `transform:${transforms.join(' ')};` : ''
      cssLines.push(`#${id}{height:${height};background:${bg};border-radius:${radius};${border}${blurStyle}${shadowStyle}${clip}${aspectRatio}${transformStyle}}`)
    }
  })

  // --- Body -----------------------------------------------------------------
  const mediaHtml =
    `<video class="bg-media" id="bgVideo" autoplay loop muted playsinline style="display:none"></video>
     <img class="bg-media" id="bgImage" style="display:none" />`
  const layersHtml = nonBg
    .map((l, i) => {
      const id = `l${i}`
      const inner = innerHtml(l)
      return `<div class="el" id="${id}" data-type="${l.type}">${inner}</div>`
    })
  // --- JS: timeline + contract -------------------------------------------------
  const tlCalls: string[] = []
  nonBg.forEach((l, i) => {
    if (l.type === 'background') return
    const id = `#l${i}`
    if (l.animation.type !== 'none') {
      if (l.animation.type === 'word-stagger') {
        tlCalls.push(
          `  tl.fromTo('${id} .w', { opacity: 0, y: 25 }, { opacity: 1, y: 0, duration: ${l.animation.duration}, ease: '${GSAP_EASING[l.animation.easing]}', stagger: ${l.animation.stagger ?? 0.08} }, ${l.animation.delay});`
        )
      } else if (l.animation.type === 'wipe-rtl') {
        tlCalls.push(
          `  tl.fromTo('${id}', { opacity: 0, scaleX: 0, transformOrigin: 'right center' }, { opacity: ${l.opacity}, scaleX: 1, duration: ${l.animation.duration}, ease: '${GSAP_EASING[l.animation.easing]}' }, ${l.animation.delay});`
        )
      } else if (l.animation.type === 'pop-bounce') {
        tlCalls.push(
          `  tl.fromTo('${id}', { opacity: 0, scale: 0.4 }, { opacity: ${l.opacity}, scale: 1, duration: ${l.animation.duration}, ease: 'back.out(2)' }, ${l.animation.delay});`
        )
      } else if (l.animation.type === 'flip-up') {
        tlCalls.push(
          `  tl.fromTo('${id}', { opacity: 0, y: 35, rotationX: 55, transformPerspective: 600 }, { opacity: ${l.opacity}, y: 0, rotationX: 0, duration: ${l.animation.duration}, ease: '${GSAP_EASING[l.animation.easing]}' }, ${l.animation.delay});`
        )
      } else if (l.animation.type === 'blur-reveal') {
        tlCalls.push(
          `  tl.fromTo('${id}', { opacity: 0, scale: 1.08, filter: 'blur(10px)' }, { opacity: ${l.opacity}, scale: 1, filter: 'blur(0px)', duration: ${l.animation.duration}, ease: '${GSAP_EASING[l.animation.easing]}' }, ${l.animation.delay});`
        )
      } else {
        const from = gsapFrom(l.animation.type)
        const fromStr = Object.keys(from)
          .map((k) => `${k}: ${from[k as keyof typeof from]}`)
          .join(', ')
        tlCalls.push(
          `  tl.fromTo('${id}', { ${fromStr} }, { opacity: ${l.opacity}, x: 0, y: 0, scale: 1, duration: ${l.animation.duration}, ease: '${GSAP_EASING[l.animation.easing]}' }, ${l.animation.delay});`
        )
      }
    }

    // Layer Exit Transition
    if (l.animationOut && l.animationOut.type !== 'none') {
      const out = gsapOut(l.animationOut.type)
      const outDur = l.animationOut.duration || 0.5
      const outDelay = l.animationOut.delay ?? 0.4
      const outStr = Object.keys(out)
        .map((k) => `${k}: ${out[k as keyof typeof out]}`)
        .join(', ')
      const outStart = Math.min(
        Math.max(0, model.duration - outDur),
        Math.max((l.animation.delay || 0) + (l.animation.duration || 0), model.duration - outDur - outDelay)
      )
      tlCalls.push(
        `  tl.fromTo('${id}', { opacity: ${l.opacity}, x: 0, y: 0, scale: 1 }, { ${outStr}, duration: ${outDur}, ease: '${GSAP_EASING[l.animationOut.easing]}' }, ${outStart.toFixed(3)});`
      )
    }
  })

  const loadFn = buildLoadFn(nonBg, bg)

  // Layers whose entrance animation only plays in the first round (logo,
  // accent bar, footer). On later rounds they must be held at their end state
  // (fully visible) instead of re-animating, matching the Canvas preview.
  // Indices are 1-based layer ids (#l0..#lN) for the animated non-bg layers.
  const persistent = nonBg
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.animateFirstRoundOnly && l.animation.type !== 'none')
  const persistentHold = persistent
    .map(({ l, i }) => `gsap.set('#l${i}', { opacity: ${l.opacity}, x: 0, y: 0, scale: 1 });`)
    .join('\n      ')

  // Bumper scene timeline — animates the brand logo (#b0), slogan (#b1) and a
  // short accent sweep (#bAcc). The logo entrance animation is the "transition"
  // between rounds; duration/delay/easing come from the template's bumper config.
  const b = model.bumper
  const bAnim = b?.animation ?? { type: 'zoom-in', duration: 0.6, delay: 0, easing: 'ease-out' }
  const bAnimOut = b?.animationOut ?? { type: 'fade-out', duration: 0.5, delay: 0, easing: 'ease-out' }
  const bumperDur = b?.duration ?? 2
  const bumperTlCalls: string[] = []
  // The logo entrance IS the transition. For type 'none' we skip the #b0 tween
  // entirely (it would otherwise emit a malformed `fromTo('#b0', {  }, ...)`),
  // leaving the logo at its static CSS state — mirroring how the news-layer
  // timeline skips type 'none'. The slogan/accent sweep stay built-in.
  if (bAnim.type !== 'none') {
    const bFrom = gsapFrom(bAnim.type)
    const bFromStr = Object.keys(bFrom)
      .map((k) => `${k}: ${bFrom[k as keyof typeof bFrom]}`)
      .join(', ')
    bumperTlCalls.push(
      `  bt.fromTo('#b0', { ${bFromStr} }, { opacity: 1, x: 0, y: 0, scale: 1, duration: ${bAnim.duration}, ease: '${GSAP_EASING[bAnim.easing]}' }, ${bAnim.delay});`
    )
  }
  bumperTlCalls.push(
    `  bt.fromTo('#b1', { opacity: 0, y: 24 }, { opacity: 1, x: 0, y: 0, scale: 1, duration: 0.6, ease: 'power2.out' }, ${bAnim.delay + 0.1});`,
    `  bt.fromTo('#bAcc', { opacity: 0, scaleX: 0 }, { opacity: 1, scaleX: 1, transformOrigin: 'center', duration: 0.35, ease: 'power2.out' }, 0);`
  )
  // Logo EXIT — the logo animates OUT as the bumper ends. Positioned so it
  // completes exactly at the bumper's end (entrance finish + out-delay is
  // honored, and the whole tween fits inside the bumper duration). Type 'none'
  // leaves the logo fully visible until the cut, matching the preview.
  if (bAnimOut.type !== 'none') {
    const bOut = gsapOut(bAnimOut.type)
    const bOutStr = Object.keys(bOut)
      .map((k) => `${k}: ${bOut[k as keyof typeof bOut]}`)
      .join(', ')
    const outStart = Math.max(
      (bAnim.delay || 0) + (bAnim.duration || 0),
      bumperDur - bAnimOut.duration - (bAnimOut.delay || 0)
    )
    bumperTlCalls.push(
      `  bt.fromTo('#b0', { opacity: 1, x: 0, y: 0, scale: 1 }, { ${bOutStr}, duration: ${bAnimOut.duration}, ease: '${GSAP_EASING[bAnimOut.easing]}' }, ${outStart.toFixed(3)});`
    )
  }

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=${w}, height=${h}">
<title>${esc(model.name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Almarai:wght@400;700;800&family=Cairo:wght@400;700;900&family=IBM+Plex+Sans+Arabic:wght@400;600;700&family=Noto+Naskh+Arabic:wght@400;700&family=Plus+Jakarta+Sans:wght@700;800;900&family=Readex+Pro:wght@400;600;700&family=Tajawal:wght@400;700;900&display=swap" rel="stylesheet">
<style>
@font-face{font-family:'Thmanyah Sans';src:url('./fonts/ThmanyahSans-Bold.woff2') format('woff2');font-weight:700;font-style:normal;font-display:swap;}
@font-face{font-family:'Thmanyah Sans';src:url('./fonts/ThmanyahSans-Regular.woff2') format('woff2');font-weight:400;font-style:normal;font-display:swap;}
@font-face{font-family:'Thmanyah Sans';src:url('./fonts/ThmanyahSans-Medium.woff2') format('woff2');font-weight:500;font-style:normal;font-display:swap;}
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box;}
${cssLines.join('\n')}
</style>
</head>
<body>
<div class="container">
  <div class="bg-media">${mediaHtml}</div>
  <div class="bg-overlay" id="bgOverlay"></div>
  <div class="news-scene" id="newsScene">
${layersHtml}
  </div>
  <div class="bumper-scene" id="bumperScene">
    <div id="bAcc"></div>
    <div id="b0">KASHIDA</div>
    <div id="b1"></div>
  </div>
</div>
<script src="./gsap.min.js"></script>
<script>
(function() {
  var tl = gsap.timeline({ paused: true });
${tlCalls.join('\n')}
  window.mainTimeline = tl;

  // --- Bumper scene timeline (paused, seeked only in bumper mode) --------------
  var bt = gsap.timeline({ paused: true });
${bumperTlCalls.join('\n')}
  window.bumperTimeline = bt;

  // Current scene mode: true → bumper scene, false → news scene.
  var __isBumperMode = false;
  window.__isBumperMode = false;

  // Resolve an image before the first screenshot so it is never blank.
  function preloadImage(url) {
    if (!url) return Promise.resolve();
    return new Promise(function(resolve) {
      var im = new Image();
      im.onload = function() { resolve(); };
      im.onerror = function() { console.warn('Background image failed to load:', url); resolve(); };
      im.src = url;
    });
  }

  window.loadNewsData = async function(data) {
    data = data || {};
    var newsScene = document.getElementById('newsScene');
    var bumperScene = document.getElementById('bumperScene');
    var isBumper = !!data.isBumper;
    __isBumperMode = isBumper;
    window.__isBumperMode = isBumper;

    // Reset BOTH timelines so no residual inline styles leak between scenes
    // when switching modes (or when reloading a new round within a mode).
    window.mainTimeline.pause();
    window.mainTimeline.seek(0);
    window.bumperTimeline.pause();
    window.bumperTimeline.seek(0);

    var setText = function(sel, val) {
      var el = document.querySelector(sel);
      if (el && val) el.textContent = val;
    };
    var setWords = function(sel, val) {
      var el = document.querySelector(sel);
      if (el && val) {
        var words = String(val).trim().split(/\s+/);
        el.innerHTML = words.map(function(w){ return '<span class="w" style="display:inline-block">' + w + '</span>'; }).join(' ');
      }
    };
    var setProp = function(sel, fn) {
      var el = document.querySelector(sel);
      if (el) fn(el);
    };

    if (isBumper) {
      // --- Bumper scene ---
      newsScene.style.display = 'none';
      bumperScene.style.display = 'block';
      bumperScene.style.background = data.backgroundColor || '${model.backgroundColor}';
      var b0 = document.getElementById('b0');
      if (data.logoImageUrl) {
        b0.textContent = '';
        var logoImg = document.createElement('img');
        logoImg.src = data.logoImageUrl;
        logoImg.alt = 'logo';
        logoImg.style.cssText = 'max-width:64%;height:auto;object-fit:contain;';
        b0.appendChild(logoImg);
      } else {
        b0.textContent = data.logoText || 'KASHIDA';
      }
      document.getElementById('b1').textContent = data.slogan || '';
      document.getElementById('bAcc').style.background = data.accentColor || '${model.accentColor}';
      var bgv = document.getElementById('bgVideo'); if (bgv) bgv.style.display = 'none';
      var bgi = document.getElementById('bgImage'); if (bgi) bgi.style.display = 'none';
      var bgo = document.getElementById('bgOverlay'); if (bgo) bgo.style.display = 'none';
      await preloadImage(data.logoImageUrl);
      return;
    }

    // --- News scene ---
    bumperScene.style.display = 'none';
    newsScene.style.display = 'block';
    var bgo = document.getElementById('bgOverlay'); if (bgo) bgo.style.display = 'block';

    // Track which news round we are rendering (0 = first round). Round index is
    // injected by the renderer for each round segment; bumpers skip this branch.
    window.__newsRoundIndex = (typeof data.roundIndex === 'number') ? data.roundIndex : 0;

    ${loadFn}

    // Render-time position overrides (legacy + generic).
    var pos = function(type) {
      var map = { headline: 'headlinePos', label: 'badgePos', logo: 'logoPos' };
      var key = map[type];
      var generic = data.layerPositions && data.layerPositions[type];
      return generic || (data[key] ? { x: data[key].x, y: data[key].y } : null);
    };
    ['headline', 'label', 'logo'].forEach(function(type) {
      var p = pos(type);
      if (!p) return;
      var el = document.querySelector('[data-type="' + type + '"]');
      if (!el) return;
      el.style.left = p.x + '%';
      el.style.top = p.y + '%';
    });

    // Background media.
    var mediaUrl = data.videoUrl || data.imageUrl || '';
    var isVideo = mediaUrl && (data.videoUrl && !data.videoUrl.match(/\\.(jpg|jpeg|png|webp|gif)(\\?.*)?$/i) || mediaUrl.match(/\\.(mp4|webm|mov|m4v)(\\?.*)?$/i));
    var vid = document.getElementById('bgVideo');
    var img = document.getElementById('bgImage');
    if (isVideo && mediaUrl) {
      vid.src = mediaUrl; vid.style.display = 'block'; img.style.display = 'none';
      if (data.videoFit) vid.style.objectFit = data.videoFit;
      vid.style.objectPosition = (data.videoPositionX ?? 50) + '% ' + (data.videoPositionY ?? 50) + '%';
      vid.style.transform = 'scale(' + (data.videoScale ?? 1) + ')';
      // Wait for video metadata so seekToFrame can seek correctly
      await new Promise(function(resolve) {
        if (vid.readyState >= 1) { resolve(); return; }
        vid.onloadedmetadata = function() { resolve(); };
        setTimeout(resolve, 3000);
      });
    } else if (mediaUrl) {
      img.src = mediaUrl; img.style.display = 'block'; vid.style.display = 'none';
      var imgFit = data.imageFit || data.videoFit;
      if (imgFit) img.style.objectFit = imgFit;
      var imgX = data.imagePositionX ?? data.videoPositionX ?? 50;
      var imgY = data.imagePositionY ?? data.videoPositionY ?? 50;
      img.style.objectPosition = imgX + '% ' + imgY + '%';
      var imgScale = data.imageScale ?? data.videoScale ?? 1;
      img.style.transform = 'scale(' + imgScale + ')';
    }
    if (data.overlayOpacity !== undefined) {
      document.getElementById('bgOverlay').style.opacity = data.overlayOpacity;
    }
    // Ensure any image background is decoded before the first screenshot.
    await preloadImage(mediaUrl);
  };

  window.seekToFrame = function(frameNumber, fps) {
    var timeInSeconds = frameNumber / fps;
    if (__isBumperMode) {
      // Seek the bumper timeline (logo entrance = the transition).
      window.bumperTimeline.pause();
      window.bumperTimeline.seek(timeInSeconds);
      return;
    }
    window.mainTimeline.pause();
    window.mainTimeline.seek(timeInSeconds);
    // On rounds after the first, hold "animateFirstRoundOnly" layers at their
    // end state so they don't replay their entrance animation (matches preview).
    if (window.__newsRoundIndex > 0) {
      ${persistentHold}
    }
    var vid = document.getElementById('bgVideo');
    if (vid && vid.src) {
      try {
        vid.pause();
        if (vid.duration && !isNaN(vid.duration)) vid.currentTime = timeInSeconds % vid.duration;
        else vid.currentTime = timeInSeconds;
      } catch (e) {}
    }
  };
})();
</script>
</body>
</html>`

  return { html, filename: templateFilename(model) }
}

function innerHtml(l: Layer): string {
  const rawText = l.text ?? ''
  const textVal = l.kashida && l.kashida > 0 ? applyKashida(rawText, l.kashida) : rawText

  if (l.widgetType === 'breaking_ticker') {
    return `<div class="ticker-box"><span class="ticker-flash">عاجل</span><span>${esc(textVal || 'خبر عاجل')}</span></div>`
  }
  if (l.widgetType === 'speaker_card') {
    const parts = textVal.split('·')
    const name = parts[0]?.trim() || textVal || 'صاحب التصريح'
    const role = parts[1]?.trim() || ''
    return `<div class="speaker-tag"><div class="speaker-info"><div class="speaker-name">${esc(name)}</div>${role ? `<div class="speaker-role">${esc(role)}</div>` : ''}</div></div>`
  }
  if (l.widgetType === 'progress_bar') {
    return `<div class="bar-track"><div class="bar-fill"></div></div>`
  }

  switch (l.type) {
    case 'headline':
    case 'subheadline': {
      if (textVal && textVal.includes('📍')) {
        const locName = textVal.replace(/📍/g, '').trim()
        return `<span class="location-pin-badge"><span class="loc-text">${esc(locName)}</span><span class="loc-pin"><svg viewBox="0 0 24 24" width="24" height="24" fill="#FFFFFF"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg><span class="loc-dash"></span></span></span>`
      }
      if (l.animation.type === 'word-stagger' && textVal) {
        return textVal
          .trim()
          .split(/\s+/)
          .map((w) => `<span class="w" style="display:inline-block">${esc(w)}</span>`)
          .join(' ')
      }
      return esc(textVal)
    }
    case 'timestamp': {
      if (textVal && textVal.includes('@')) {
        const parts = textVal.split('·')
        const handle = parts[0]?.trim().replace(/🎥/g, '').trim() || '@20minxo'
        const date = parts[1]?.trim() || '2026-07-10'
        return `<div class="credit-box"><div class="credit-pill"><span class="handle">${esc(handle)}</span><span class="cam-icon">📹</span></div><div class="date-txt">${esc(date)}</div></div>`
      }
      return esc(textVal)
    }
    case 'card': {
      if (l.animation.type === 'word-stagger' && textVal) {
        return textVal
          .trim()
          .split(/\s+/)
          .map((w) => `<span class="w" style="display:inline-block">${esc(w)}</span>`)
          .join(' ')
      }
      return esc(textVal)
    }
    case 'logo':
      if (l.imageUrl) return `<img src="${esc(l.imageUrl)}" alt="logo" style="width:100%;height:auto;object-fit:contain;" />`
      return esc(textVal)
    case 'label':
      if (l.labelAr && l.labelAr.includes('مونديال')) {
        return `<span class="tournament-badge-wrap"><span class="tournament-badge"><span class="fifa-tab"><svg viewBox="0 0 44 54" width="44" height="54" fill="none"><text x="7" y="24" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-weight="900" font-size="28" fill="#FFFFFF">2</text><text x="25" y="24" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-weight="900" font-size="28" fill="#FFFFFF">6</text><path d="M18 6C18 4 20 2 22 2C24 2 26 4 26 6C26 8 28 10 28 14C28 18 24 21 22 21C20 21 16 18 16 14C16 10 18 8 18 6Z" fill="#F59E0B"/><path d="M19 21H25V28H19V21Z" fill="#D97706"/><rect x="17" y="28" width="10" height="4" rx="1" fill="#FFFFFF"/><text x="22" y="44" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-weight="900" font-size="10" fill="#FFFFFF" text-anchor="middle" letter-spacing="1.5">FIFA</text></svg><span class="fifa-tail"></span></span><span class="tournament-text">${esc(l.labelAr.replace(/🏆/g, '').trim())}</span></span></span>`
      }
      return `<span class="lb"><span class="lb-ar">${esc(l.labelAr ?? '')}</span><span class="lb-en">${esc(l.labelEn ?? '')}</span></span>`
    case 'shape':
      if (l.widgetType === 'breaking_ticker') {
        const badge = l.tickerConfig?.badgeText || l.labelAr || 'عاجل'
        const badgeBg = l.tickerConfig?.badgeColor || '#E63946'
        const content = l.tickerConfig?.ribbonText || textVal || 'خبر عاجل: تغطية إخبارية شاملة ومستمرة على مدار الساعة'
        return `<div class="ticker-box" style="display:flex;align-items:center;width:100%;height:100%;overflow:hidden;background:#030712;border-radius:24px;border:1px solid rgba(255,255,255,0.2);box-shadow:0 20px 40px rgba(0,0,0,0.8);"><div class="ticker-badge" style="display:flex;align-items:center;gap:12px;padding:0 28px;height:100%;background:${badgeBg};color:#fff;font-weight:900;font-size:32px;flex-shrink:0;z-index:10;"><span style="width:12px;height:12px;border-radius:50%;background:#fff;display:inline-block;"></span><span>${esc(badge)}</span></div><div class="ticker-ribbon" style="flex:1;overflow:hidden;padding:0 24px;white-space:nowrap;font-weight:700;font-size:32px;color:#fff;"><span class="ticker-txt">${esc(content)}</span></div></div>`
      }
      if (l.widgetType === 'audio_waveform') {
        const barCount = l.audioWaveform?.barCount || 24
        const barColor = l.audioWaveform?.color || '#1E56A0'
        return `<div class="waveform-box" style="display:flex;align-items:center;justify-content:center;gap:8px;width:100%;height:100%;padding:16px;background:rgba(15,23,42,0.85);border-radius:24px;border:1px solid rgba(255,255,255,0.15);">${Array.from({ length: barCount }).map((_, i) => `<div class="wave-bar" style="flex:1;height:${25 + (i % 5) * 15}%;background:${barColor};border-radius:9999px;"></div>`).join('')}</div>`
      }
      return textVal ? `<div class="shape-content" style="display:flex;align-items:center;justify-content:center;height:100%;width:100%;font-size:${l.fontSize}px;font-weight:${l.fontWeight};color:${l.color};">${esc(textVal)}</div>` : ''
    default:
      return ''
  }
}

// Build the loadNewsData body mapping render-time data to layers by specific layer ID.
function buildLoadFn(nonBg: Layer[], bg: Layer | undefined): string {
  const fns: string[] = []
  
  // Find which subheadline layer should receive data.subheadline (the last non-decorative subheadline)
  const subheadlineIndices = nonBg
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.type === 'subheadline' && l.text !== '“' && !l.text?.startsWith('📊') && !l.text?.startsWith('🏆'))
    .map(({ i }) => i)
  
  const targetSubheadlineIdx = subheadlineIndices.length > 0 ? subheadlineIndices[subheadlineIndices.length - 1] : -1

  nonBg.forEach((l, i) => {
    const id = `#l${i}`
    const textFn = l.animation.type === 'word-stagger' ? 'setWords' : 'setText'
    if (l.type === 'headline') {
      fns.push(`${textFn}('${id}', data.headline);`)
    } else if (l.type === 'subheadline' && i === targetSubheadlineIdx) {
      fns.push(`${textFn}('${id}', data.subheadline);`)
    } else if (l.type === 'timestamp') {
      fns.push(`setText('${id}', data.timestamp);`)
    } else if (l.type === 'label') {
      fns.push(`setText('${id} .lb-ar', data.labelAr);`)
      fns.push(`setText('${id} .lb-en', data.labelEn);`)
    }
  })

  // Colors
  fns.push(`if (data.accentColor) {`)
  nonBg.forEach((l, i) => {
    const id = `#l${i}`
    if (l.type === 'accentBar') {
      fns.push(`  setProp('${id}', function(e){ e.style.background = data.accentColor; });`)
    } else if (l.type === 'label') {
      fns.push(`  setProp('${id} .lb', function(e){ e.style.background = data.accentColor; });`)
    }
  })
  fns.push(`}`)

  // Background container color
  fns.push(`if (data.backgroundColor) { var c = document.querySelector('.container'); if(c) c.style.background = data.backgroundColor; document.body.style.background = data.backgroundColor; }`)

  // Background overlay opacity default comes from the model.
  if (bg && bg.overlayOpacity !== undefined) {
    fns.push(`document.getElementById('bgOverlay').style.opacity = ${bg.overlayOpacity};`)
  }
  return fns.join('\n    ')
}
