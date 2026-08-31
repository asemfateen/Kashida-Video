// Playback clock for the live preview. Uses requestAnimationFrame to advance a
// playhead held in a ref (mutable, no React re-render per frame), and invokes an
// `onFrame` callback imperatively so the canvas can scrub Web-Animations without
// re-rendering layers — keeping playback cheap on low-power machines.

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { Layer } from './model'

export interface PlaybackClock {
  playheadRef: MutableRefObject<number>
  time: number
  playing: boolean
  play: () => void
  pause: () => void
  seek: (t: number) => void
}

export function usePlaybackClock(
  duration: number,
  onFrame?: (t: number) => void,
): PlaybackClock {
  const playheadRef = useRef(0)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const rafRef = useRef<number | undefined>(undefined)
  const lastRef = useRef<number | undefined>(undefined)
  const commitRef = useRef(0)
  const onFrameRef = useRef(onFrame)
  onFrameRef.current = onFrame

  const stop = useCallback(() => {
    if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current)
    rafRef.current = undefined
    lastRef.current = undefined
    setPlaying(false)
  }, [])

  const loop = useCallback(
    (now: number) => {
      if (lastRef.current == null) lastRef.current = now
      const dt = (now - lastRef.current) / 1000
      lastRef.current = now
      playheadRef.current = Math.min(duration, playheadRef.current + dt)
      if (onFrameRef.current) onFrameRef.current(playheadRef.current)
      if (now - commitRef.current >= 32) {
        commitRef.current = now
        setTime(playheadRef.current)
      }
      if (playheadRef.current >= duration) {
        setTime(duration)
        stop()
        return
      }
      rafRef.current = requestAnimationFrame(loop)
    },
    [duration, stop],
  )

  const play = useCallback(() => {
    if (playheadRef.current >= duration) {
      playheadRef.current = 0
      setTime(0)
    }
    lastRef.current = undefined
    commitRef.current = 0
    setPlaying(true)
    rafRef.current = requestAnimationFrame(loop)
  }, [loop, duration])

  const pause = useCallback(() => stop(), [stop])
  const seek = useCallback(
    (t: number) => {
      playheadRef.current = Math.max(0, Math.min(duration, t))
      setTime(playheadRef.current)
      if (onFrameRef.current) onFrameRef.current(playheadRef.current)
    },
    [duration],
  )

  useEffect(() => stop, [stop])

  return { playheadRef, time, playing, play, pause, seek }
}

// Map a playhead time (seconds) to a WAAPI animation currentTime for a layer's
// entrance animation, given the delay/duration. Returns null when there is no
// entrance animation.
export function playheadToAnimTime(layer: Layer, timeSeconds: number): number | null {
  if (layer.animation.type === 'none') return null
  const startMs = layer.animation.delay * 1000
  const durMs = layer.animation.duration * 1000
  let ct = timeSeconds * 1000 - startMs
  if (ct < 0) ct = 0
  if (ct > durMs) ct = durMs
  return ct
}
