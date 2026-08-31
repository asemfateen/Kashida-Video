// Timeline mapping — the single source of truth for how a multi-segment video
// (intro bumper, news rounds, interstitial bumpers, outro bumper) maps onto a
// global playhead. Used by the editor preview/scrubbing. The Python renderer
// mirrors this exact algorithm in workers/renderer.py so the on-screen preview
// and the rendered MP4 always agree about where each frame falls.

import type { BumperConfig, TemplateRound } from './model'

export interface TimelineSegment {
  kind: 'round' | 'bumper'
  roundIndex?: number // present for kind === 'round'
  start: number // seconds (global)
  duration: number // seconds
}

export interface ResolvedFrame {
  segmentType: 'news' | 'bumper'
  localFrame: number // frame index within the segment (0-based)
  roundIndex: number // meaningful when segmentType === 'news'
}

export type RoundDurationFn = (round: TemplateRound) => number

// Build the ordered segment list given the rounds and (optional) bumper config.
// No bumper / bumper.disabled -> just the rounds (legacy behaviour).
export function buildTimeline(
  rounds: TemplateRound[],
  roundDuration: RoundDurationFn,
  bumper?: BumperConfig,
): TimelineSegment[] {
  const segs: TimelineSegment[] = []
  let cursor = 0

  const pushBumper = () => {
    const dur = Math.max(0.2, bumper?.duration ?? 2)
    segs.push({ kind: 'bumper', start: cursor, duration: dur })
    cursor += dur
  }

  const pushRound = (r: TemplateRound, idx: number) => {
    const dur = Math.max(0.2, roundDuration(r))
    segs.push({ kind: 'round', roundIndex: idx, start: cursor, duration: dur })
    cursor += dur
  }

  const useBumper = !!(bumper && bumper.enabled)

  if (useBumper && bumper.showIntro) pushBumper()

  rounds.forEach((r, idx) => {
    pushRound(r, idx)
    // Interstitial between this round and the next (not after the last).
    if (useBumper && bumper.showInterstitial && idx < rounds.length - 1) pushBumper()
  })

  if (useBumper && bumper.showOutro) pushBumper()

  return segs
}

export function timelineDuration(segs: TimelineSegment[]): number {
  const last = segs[segs.length - 1]
  return last ? last.start + last.duration : 0
}

// Map a global frame number to which segment it belongs to and its local frame.
export function resolveFrame(
  globalFrame: number,
  fps: number,
  segs: TimelineSegment[],
): ResolvedFrame {
  const t = globalFrame / Math.max(1, fps)
  let seg = segs[segs.length - 1]
  for (const s of segs) {
    if (t >= s.start && t < s.start + s.duration) {
      seg = s
      break
    }
  }
  if (!seg) {
    // Fallback: treat as the last news round at its first frame.
    const lastRound = [...segs].reverse().find((s) => s.kind === 'round')
    return {
      segmentType: lastRound ? 'news' : 'bumper',
      localFrame: 0,
      roundIndex: lastRound?.roundIndex ?? 0,
    }
  }
  const localTime = Math.max(0, Math.min(seg.duration - 1e-6, t - seg.start))
  const localFrame = Math.round(localTime * fps)
  if (seg.kind === 'bumper') {
    return { segmentType: 'bumper', localFrame, roundIndex: 0 }
  }
  return { segmentType: 'news', localFrame, roundIndex: seg.roundIndex ?? 0 }
}
