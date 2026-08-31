// Pure state history manager for undo/redo with 30-level cap.

export const MAX_HISTORY_LEVELS = 30

export interface HistoryState<T> {
  past: T[]
  present: T
  future: T[]
}

export function createHistory<T>(initial: T): HistoryState<T> {
  return {
    past: [],
    present: JSON.parse(JSON.stringify(initial)),
    future: [],
  }
}

export function pushHistory<T>(state: HistoryState<T>, nextPresent: T): HistoryState<T> {
  // If nothing changed in the JSON representation, avoid dirtying the history stack
  if (JSON.stringify(state.present) === JSON.stringify(nextPresent)) {
    return state
  }

  const newPast = [...state.past, JSON.parse(JSON.stringify(state.present))]
  if (newPast.length > MAX_HISTORY_LEVELS) {
    newPast.splice(0, newPast.length - MAX_HISTORY_LEVELS)
  }

  return {
    past: newPast,
    present: JSON.parse(JSON.stringify(nextPresent)),
    future: [],
  }
}

export function undoHistory<T>(state: HistoryState<T>): HistoryState<T> {
  if (state.past.length === 0) return state

  const previous = state.past[state.past.length - 1]
  const newPast = state.past.slice(0, -1)
  const newFuture = [JSON.parse(JSON.stringify(state.present)), ...state.future].slice(0, MAX_HISTORY_LEVELS)

  return {
    past: newPast,
    present: JSON.parse(JSON.stringify(previous)),
    future: newFuture,
  }
}

export function redoHistory<T>(state: HistoryState<T>): HistoryState<T> {
  if (state.future.length === 0) return state

  const next = state.future[0]
  const newFuture = state.future.slice(1)
  const newPast = [...state.past, JSON.parse(JSON.stringify(state.present))].slice(-MAX_HISTORY_LEVELS)

  return {
    past: newPast,
    present: JSON.parse(JSON.stringify(next)),
    future: newFuture,
  }
}

export function canUndo<T>(state: HistoryState<T>): boolean {
  return state.past.length > 0
}

export function canRedo<T>(state: HistoryState<T>): boolean {
  return state.future.length > 0
}
