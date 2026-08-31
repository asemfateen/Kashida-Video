import { describe, it, expect } from 'vitest'
import {
  createHistory,
  pushHistory,
  undoHistory,
  redoHistory,
  canUndo,
  canRedo,
} from './history'
import {
  calculateDropIndex,
  alignLayerH,
  alignLayerV,
  duplicateLayerModel,
  duplicateRoundModel,
  newLayer,
  defaultRound,
  type Layer,
  type TemplateRound,
} from './model'

describe('History State Manager', () => {
  it('initializes with present state and empty stacks', () => {
    const initial = { count: 0 }
    const history = createHistory(initial)
    expect(history.present).toEqual({ count: 0 })
    expect(history.past).toEqual([])
    expect(history.future).toEqual([])
    expect(canUndo(history)).toBe(false)
    expect(canRedo(history)).toBe(false)
  })

  it('pushes new state, clears future, and caps at 30 levels', () => {
    let history = createHistory({ val: 0 })
    for (let i = 1; i <= 35; i++) {
      history = pushHistory(history, { val: i })
    }
    expect(history.present).toEqual({ val: 35 })
    expect(history.past.length).toBe(30)
    expect(history.past[0]).toEqual({ val: 5 }) // Oldest kept item
    expect(history.past[29]).toEqual({ val: 34 })
    expect(canUndo(history)).toBe(true)
    expect(canRedo(history)).toBe(false)
  })

  it('handles undo and redo sequence correctly', () => {
    let history = createHistory('step-0')
    history = pushHistory(history, 'step-1')
    history = pushHistory(history, 'step-2')

    expect(canUndo(history)).toBe(true)
    expect(canRedo(history)).toBe(false)

    // Undo step-2 -> step-1
    history = undoHistory(history)
    expect(history.present).toBe('step-1')
    expect(history.future).toEqual(['step-2'])
    expect(canUndo(history)).toBe(true)
    expect(canRedo(history)).toBe(true)

    // Undo step-1 -> step-0
    history = undoHistory(history)
    expect(history.present).toBe('step-0')
    expect(history.future).toEqual(['step-1', 'step-2'])
    expect(canUndo(history)).toBe(false)
    expect(canRedo(history)).toBe(true)

    // Redo step-0 -> step-1
    history = redoHistory(history)
    expect(history.present).toBe('step-1')
    expect(history.future).toEqual(['step-2'])

    // New mutation while in history branch clears future
    history = pushHistory(history, 'step-1-modified')
    expect(history.present).toBe('step-1-modified')
    expect(history.future).toEqual([])
    expect(canRedo(history)).toBe(false)
  })
  it('ignores pushing identical JSON state to avoid stack pollution', () => {
    const initial = { a: 1, b: 'text' }
    let history = createHistory(initial)
    history = pushHistory(history, { a: 1, b: 'text' })
    expect(history.past.length).toBe(0)
    expect(history.future.length).toBe(0)
    expect(canUndo(history)).toBe(false)
  })

  it('guarantees deep cloning isolation between past, present, and future', () => {
    const state0 = { layers: [{ id: '1', x: 10 }] }
    let history = createHistory(state0)
    const state1 = { layers: [{ id: '1', x: 20 }] }
    history = pushHistory(history, state1)

    // Mutate state1 in place externally
    state1.layers[0].x = 999
    expect(history.present.layers[0].x).toBe(20)

    history = undoHistory(history)
    expect(history.present.layers[0].x).toBe(10)

    // Mutate state0 externally
    state0.layers[0].x = 888
    expect(history.present.layers[0].x).toBe(10)

    history = redoHistory(history)
    expect(history.present.layers[0].x).toBe(20)
  })

  it('survives rapid hammering (60 pushes, 30 undos, 30 redos)', () => {
    let history = createHistory(0)
    for (let i = 1; i <= 60; i++) {
      history = pushHistory(history, i)
    }
    expect(history.present).toBe(60)
    expect(history.past.length).toBe(30)
    expect(history.past[0]).toBe(30) // Oldest kept (60 - 30)

    // Undo all 30 steps
    for (let i = 59; i >= 30; i--) {
      expect(canUndo(history)).toBe(true)
      history = undoHistory(history)
      expect(history.present).toBe(i)
    }
    expect(canUndo(history)).toBe(false)
    expect(history.future.length).toBe(30)

    // Redo all 30 steps
    for (let i = 31; i <= 60; i++) {
      expect(canRedo(history)).toBe(true)
      history = redoHistory(history)
      expect(history.present).toBe(i)
    }
    expect(canRedo(history)).toBe(false)
  })
})

describe('Model Alignment & Duplication Helpers', () => {
  it('alignLayerH centers layer horizontally within [0, 100]', () => {
    const layer: Layer = {
      ...newLayer('headline'),
      x: 10,
      width: 60,
    }
    const aligned = alignLayerH(layer)
    expect(aligned.x).toBe(20) // (100 - 60) / 2 = 20

    const fullWidthLayer: Layer = {
      ...newLayer('headline'),
      x: 20,
      width: 100,
    }
    expect(alignLayerH(fullWidthLayer).x).toBe(0)

    // Zero width layer falls back to center (50)
    const zeroWidthLayer: Layer = {
      ...newLayer('logo'),
      x: 10,
      width: 0,
    }
    expect(alignLayerH(zeroWidthLayer).x).toBe(50)
  })

  it('alignLayerV centers layer vertically within [0, 100]', () => {
    const layer: Layer = {
      ...newLayer('headline'),
      y: 10,
      fontSize: 80,
    }
    const aligned = alignLayerV(layer, 1920)
    expect(aligned.y).toBe(50)

    const cardLayer: Layer = {
      ...newLayer('card'),
      y: 10,
      height: 480, // 480 / 1920 = 25% -> (100 - 25) / 2 = 37.5 -> 38
    }
    const alignedCard = alignLayerV(cardLayer, 1920)
    expect(alignedCard.y).toBe(38)
  })

  it('duplicateLayerModel clones layer with new id, name suffix, and offset', () => {
    const layer: Layer = {
      ...newLayer('headline'),
      id: 'head-1',
      name: 'Main Headline',
      x: 10,
      y: 20,
    }
    const dup = duplicateLayerModel(layer)
    expect(dup.id).not.toBe('head-1')
    expect(dup.name).toBe('Main Headline (Copy)')
    expect(dup.x).toBe(13)
    expect(dup.y).toBe(23)

    // Background layer should not have suffix or offset
    const bgLayer: Layer = {
      ...newLayer('background'),
      id: 'bg-1',
      name: 'Background media',
      x: 0,
      y: 0,
    }
    const dupBg = duplicateLayerModel(bgLayer)
    expect(dupBg.name).toBe('Background media')
    expect(dupBg.x).toBe(0)
    expect(dupBg.y).toBe(0)
  })

  it('duplicateRoundModel clones round with new id and name suffix', () => {
    const round: TemplateRound = {
      ...defaultRound({ name: 'Round 1' }),
      id: 'round-1',
      headline: 'Breaking News',
    }
    const dup = duplicateRoundModel(round)
    expect(dup.id).not.toBe('round-1')
    expect(dup.name).toBe('Round 1 (Copy)')
    expect(dup.headline).toBe('Breaking News')
  })

  it('calculateDropIndex computes valid drop positions and respects background lock', () => {
    // Shifting item downwards (from 1 to below 2):
    // targetIndex = 2, position = 'below' -> desired = 3. from < 3 so final = 2
    expect(calculateDropIndex(1, 2, 'below', 4, true)).toBe(2)

    // Shifting item upwards (from 3 to above 1):
    // targetIndex = 1, position = 'above' -> desired = 1. from > 1 so final = 1
    expect(calculateDropIndex(3, 1, 'above', 4, true)).toBe(1)

    // Attempting to drop onto background layer (index 0) when background exists
    expect(calculateDropIndex(2, 0, 'above', 4, true)).toBe(1) // clamped to 1
    expect(calculateDropIndex(2, 0, 'below', 4, true)).toBe(1)

    // When hasBackground is false, dropping to index 0 is allowed
    expect(calculateDropIndex(2, 0, 'above', 4, false)).toBe(0)

    // Boundary edge cases (negative index, out of bounds)
    expect(calculateDropIndex(-1, 2, 'above', 4, true)).toBe(-1)
    expect(calculateDropIndex(1, -1, 'above', 4, true)).toBe(1)
    expect(calculateDropIndex(1, 10, 'below', 4, true)).toBe(3)
    expect(calculateDropIndex(0, 0, 'below', 1, false)).toBe(0)
  })

  it('alignLayerH and alignLayerV clamp bounds correctly for oversized dimensions', () => {
    const oversizedH: Layer = {
      ...newLayer('card'),
      x: 10,
      width: 120, // > 100%
    }
    expect(alignLayerH(oversizedH).x).toBe(0) // Math.max(0, (100 - 120)/2) = 0

    const oversizedV: Layer = {
      ...newLayer('card'),
      y: 10,
      height: 2500, // > 1920
    }
    expect(alignLayerV(oversizedV, 1920).y).toBe(0)
  })
})


