// Unit tests for the multi-segment "between the rounds" timeline logic.
// This is the source of truth that both the editor preview and the backend
// renderer mirror, so the ordering/timing of bumpers vs news rounds MUST be
// exactly right here.

import { describe, it, expect } from 'vitest'
import {
  buildTimeline,
  timelineDuration,
  resolveFrame,
  type TimelineSegment,
} from './timeline'
import type { BumperConfig, TemplateRound } from './model'

function round(id: string, dur: number): TemplateRound {
  return {
    id,
    name: id,
    headline: `headline ${id}`,
    subheadline: '',
    labelAr: 'NEWS',
    labelEn: 'ALERT',
    timestamp: '',
    accentColor: '#e63946',
    backgroundColor: '#0b0b0f',
    overlayOpacity: 0.55,
    duration: dur,
  }
}

const dur = (r: TemplateRound) => r.duration

function bumper(overrides: Partial<BumperConfig> = {}): BumperConfig {
  return {
    enabled: true,
    showIntro: true,
    showInterstitial: true,
    showOutro: true,
    duration: 2,
    backgroundColor: '#0b0b0f',
    accentColor: '#e63946',
    logoText: 'KASHIDA',
    slogan: '',
    animation: { type: 'zoom-in', duration: 0.6, delay: 0, easing: 'ease-out' },
    animationOut: { type: 'fade-out', duration: 0.5, delay: 0, easing: 'ease-out' },
    ...overrides,
  }
}

// Kind + roundIndex sequence helper (rounds are labelled by index).
function kinds(segs: TimelineSegment[]): string[] {
  return segs.map((s) =>
    s.kind === 'bumper' ? 'B' : `R${s.roundIndex}`,
  )
}

describe('buildTimeline — no bumper (legacy)', () => {
  it('single round → one news segment starting at 0', () => {
    const segs = buildTimeline([round('a', 5)], dur)
    expect(kinds(segs)).toEqual(['R0'])
    expect(segs[0].start).toBe(0)
    expect(segs[0].duration).toBe(5)
    expect(timelineDuration(segs)).toBe(5)
  })

  it('two rounds → two segments, contiguous', () => {
    const segs = buildTimeline([round('a', 3), round('b', 2)], dur)
    expect(kinds(segs)).toEqual(['R0', 'R1'])
    expect(segs[0].start).toBe(0)
    expect(segs[1].start).toBe(3)
    expect(timelineDuration(segs)).toBe(5)
  })
})

describe('buildTimeline — bumper (the part between rounds)', () => {
  it('intro + interstitial + outro around two rounds', () => {
    const segs = buildTimeline([round('a', 3), round('b', 2)], dur, bumper())
    // B R0 B R1 B
    expect(kinds(segs)).toEqual(['B', 'R0', 'B', 'R1', 'B'])
    // starts: 0,2,5,7,9
    expect(segs.map((s) => s.start)).toEqual([0, 2, 5, 7, 9])
    expect(timelineDuration(segs)).toBe(11)
  })

  it('single round with bumper → intro + round + outro only (no interstitial)', () => {
    const segs = buildTimeline([round('a', 4)], dur, bumper())
    expect(kinds(segs)).toEqual(['B', 'R0', 'B'])
    expect(segs.map((s) => s.start)).toEqual([0, 2, 6])
  })

  it('disabled bumper behaves like legacy (rounds only)', () => {
    const segs = buildTimeline([round('a', 3), round('b', 2)], dur, bumper({ enabled: false }))
    expect(kinds(segs)).toEqual(['R0', 'R1'])
  })

  it('showIntro=false drops the intro bumper', () => {
    const segs = buildTimeline([round('a', 3), round('b', 2)], dur, bumper({ showIntro: false }))
    // R0 B R1 B
    expect(kinds(segs)).toEqual(['R0', 'B', 'R1', 'B'])
  })

  it('showOutro=false drops the outro bumper', () => {
    const segs = buildTimeline([round('a', 3), round('b', 2)], dur, bumper({ showOutro: false }))
    // B R0 B R1
    expect(kinds(segs)).toEqual(['B', 'R0', 'B', 'R1'])
  })

  it('showInterstitial=false drops the between-round bumper', () => {
    const segs = buildTimeline([round('a', 3), round('b', 2)], dur, bumper({ showInterstitial: false }))
    // B R0 R1 B
    expect(kinds(segs)).toEqual(['B', 'R0', 'R1', 'B'])
  })
})

describe('resolveFrame — mapping a global frame to a segment', () => {
  const fps = 30
  // timeline: B(2s) R0(3s) B(2s) R1(2s) B(2s) → total 11s, 330 frames
  const segs = buildTimeline([round('a', 3), round('b', 2)], dur, bumper({ duration: 2 }))
  const total = Math.round(timelineDuration(segs) * fps)

  it('intro bumper frame → bumper', () => {
    const f = resolveFrame(10, fps, segs) // t=0.333s inside intro
    expect(f.segmentType).toBe('bumper')
    expect(f.localFrame).toBe(10)
  })

  it('first round frame → news round 0', () => {
    const f = resolveFrame(60, fps, segs) // t=2.0s → start of R0
    expect(f.segmentType).toBe('news')
    expect(f.roundIndex).toBe(0)
    expect(f.localFrame).toBe(0)
  })

  it('interstitial frame → bumper (between rounds)', () => {
    const f = resolveFrame(150, fps, segs) // t=5s → inside interstitial B
    expect(f.segmentType).toBe('bumper')
  })

  it('second round frame → news round 1', () => {
    const f = resolveFrame(210, fps, segs) // t=7s → R1 start
    expect(f.segmentType).toBe('news')
    expect(f.roundIndex).toBe(1)
  })

  it('last frame of the video stays within the timeline', () => {
    const f = resolveFrame(total - 1, fps, segs)
    // Last segment is outro bumper.
    expect(f.segmentType).toBe('bumper')
    expect(f.localFrame).toBeGreaterThanOrEqual(0)
  })

  it('frame beyond the end falls back to last news round (safe default)', () => {
    const f = resolveFrame(total + 100, fps, segs)
    expect(f.segmentType).toBe('bumper')
  })
})

describe('timelineDuration', () => {
  it('sums bumper + round segments correctly', () => {
    const segs = buildTimeline([round('a', 3), round('b', 2)], dur, bumper({ duration: 1.5 }))
    // 1.5 + 3 + 1.5 + 2 + 1.5 = 9.5
    expect(timelineDuration(segs)).toBeCloseTo(9.5)
  })
})
