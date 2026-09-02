// Unit tests for the code generator's multi-round behavior.
// Focus: the generated template must match the Canvas preview's handling of
// `animateFirstRoundOnly` layers — logo / accent bar / footer should replay their
// entrance animation ONLY in the first round and stay static on later rounds.

import { describe, it, expect } from 'vitest'
import { generateTemplateHTML } from './codeGenerator'
import { defaultTemplate, newLayer } from './model'
import type { Layer } from './model'

describe('generateTemplateHTML — animateFirstRoundOnly (between rounds)', () => {
  function modelWithLayers(extra: Partial<Layer> = {}): ReturnType<typeof defaultTemplate> {
    const m = defaultTemplate()
    // Keep a small known layer set: a headline (not persistent) + a logo (persistent).
    m.layers = [
      newLayer('headline'),
      { ...newLayer('logo'), ...extra },
    ]
    return m
  }

  it('emits a persistent hold that only triggers on later rounds', () => {
    const { html } = generateTemplateHTML(modelWithLayers())
    // loadNewsData must track the injected round index.
    expect(html).toContain('window.__newsRoundIndex =')
    expect(html).toContain("typeof data.roundIndex === 'number'")
    // seekToFrame must hold persistent layers static on rounds > 0.
    expect(html).toContain('if (window.__newsRoundIndex > 0) {')
    expect(html).toMatch(/gsap\.set\('#l1', \{ opacity: 1, x: 0, y: 0, scale: 1 \}\)/)
  })

  it('emits NO persistent hold when no layer is animateFirstRoundOnly', () => {
    const m = defaultTemplate()
    m.layers = [newLayer('headline')]
    const { html } = generateTemplateHTML(m)
    // Headline is not persistent → no hold block should reference it.
    expect(html).not.toMatch(/gsap\.set\('#l0'/)
  })

  it('emits a hold for each persistent layer index', () => {
    const m = defaultTemplate()
    m.layers = [
      newLayer('headline'),
      newLayer('accentBar'),
      newLayer('logo'),
    ]
    const { html } = generateTemplateHTML(m)
    // accentBar = l1, logo = l2 (both animateFirstRoundOnly by default).
    expect(html).toMatch(/gsap\.set\('#l1'/)
    expect(html).toMatch(/gsap\.set\('#l2'/)
    // headline = l0 must not be held.
    expect(html).not.toMatch(/gsap\.set\('#l0'/)
  })

  it('holds the layer at its configured end opacity', () => {
    const { html } = generateTemplateHTML(
      modelWithLayers({ opacity: 0.85 }),
    )
    expect(html).toMatch(/gsap\.set\('#l1', \{ opacity: 0\.85, x: 0, y: 0, scale: 1 \}\)/)
  })
})

describe('generateTemplateHTML — bumper scene', () => {
  function bumperModel(animType: 'none' | 'zoom-in'): ReturnType<typeof defaultTemplate> {
    const m = defaultTemplate()
    // For a fully-static logo ('none' entrance) also use 'none' exit so no #b0
    // tween of any kind is emitted (mirrors the "static logo" scenario).
    const outType = animType === 'none' ? 'none' : 'fade-out'
    m.bumper = {
      ...m.bumper!,
      enabled: true,
      animation: { type: animType, duration: 0.6, easing: 'ease-out', delay: 0 },
      animationOut: { type: outType, duration: 0.5, easing: 'ease-out', delay: 0 },
    }
    return m
  }

  it('emits a logo entrance tween for a real animation type', () => {
    const { html } = generateTemplateHTML(bumperModel('zoom-in'))
    expect(html).toMatch(/bt\.fromTo\('#b0', \{ opacity: 0, scale: 0\.8 \}/)
  })

  it('slides the logo in from the left for a "slide-left" entrance', () => {
    const m = defaultTemplate()
    m.bumper = {
      ...m.bumper!,
      enabled: true,
      animation: { type: 'slide-left', duration: 0.6, easing: 'ease-out', delay: 0 },
      animationOut: { type: 'none', duration: 0, easing: 'linear', delay: 0 },
    }
    const { html } = generateTemplateHTML(m)
    // Entrance from x:-120 (slides in from the left); exit is 'none' so no out tween.
    expect(html).toMatch(/bt\.fromTo\('#b0', \{ opacity: 0, x: -120 \}/)
    expect(html).not.toMatch(/x: 120, duration/)
  })

  it('skips the logo tween (no malformed empty from-object) for animation type "none"', () => {
    const { html } = generateTemplateHTML(bumperModel('none'))
    // No #b0 tween at all → no `fromTo('#b0', {  }, ...)` with an empty from.
    expect(html).not.toMatch(/bt\.fromTo\('#b0'/)
    // The built-in slogan + accent sweep tweens are still emitted.
    expect(html).toMatch(/bt\.fromTo\('#b1'/)
    expect(html).toMatch(/bt\.fromTo\('#bAcc'/)
  })

  it('emits a logo exit tween (slide out to the right) positioned at the bumper end', () => {
    const m = defaultTemplate()
    m.bumper = {
      ...m.bumper!,
      enabled: true,
      duration: 2,
      animation: { type: 'zoom-in', duration: 0.6, easing: 'ease-out', delay: 0 },
      animationOut: { type: 'slide-right', duration: 0.5, easing: 'ease-out', delay: 0 },
    }
    const { html } = generateTemplateHTML(m)
    // Exit tween slides the logo out to x:120 and fades it. Bumper is 2s, exit
    // duration 0.5 → starts at 1.5s so it completes exactly at the bumper end.
    expect(html).toMatch(/bt\.fromTo\('#b0', \{ opacity: 1, x: 0, y: 0, scale: 1 \}, \{ opacity: 0, x: 120, duration: 0\.5, ease: 'power2\.out' \}, 1\.5(00)?\)/)
  })

  it('skips the exit tween for exit type "none" (logo stays visible until the cut)', () => {
    const m = defaultTemplate()
    m.bumper = {
      ...m.bumper!,
      enabled: true,
      animation: { type: 'zoom-in', duration: 0.6, easing: 'ease-out', delay: 0 },
      animationOut: { type: 'none', duration: 0, easing: 'linear', delay: 0 },
    }
    const { html } = generateTemplateHTML(m)
    // Entrance tween present, but no exit tween.
    expect(html).toMatch(/bt\.fromTo\('#b0', \{ opacity: 0, scale: 0\.8 \}/)
    expect(html).not.toMatch(/x: 120, duration/)
  })
})

describe('generateTemplateHTML — all starter templates emit bumper and contract compliance', () => {
  it('generates compliant HTML and JSON for all starter broadcast templates', async () => {
    const { STARTER_TEMPLATES } = await import('./starterTemplates')

    for (const tmpl of STARTER_TEMPLATES) {
      const { html } = generateTemplateHTML(tmpl)
      expect(html).toContain('window.loadNewsData')
      expect(html).toContain('window.seekToFrame')
      expect(html).toContain('bumperScene')
      expect(html).toContain('window.bumperTimeline')
    }
  })
})
