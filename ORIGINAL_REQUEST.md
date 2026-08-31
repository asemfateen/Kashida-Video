# Original User Request

## 2026-08-30T12:12:46Z

A small focused team — this is a single self-contained fix and enhancement package; keep it small and focused.

Enhance and polish the Kashida Video zero-code template maker frontend and the multi-round Telegram bot with advanced UI/UX, workflow shortcuts, error resilience, and asset management.

Working directory: /home/asem/projects/Kashida Video
Integrity mode: demo

## Requirements

### R1. Frontend Editor Productivity & Shortcuts
Implement complete undo/redo state management (30-level history stack with Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y), canvas keyboard shortcuts (Space to toggle play/pause, Delete/Backspace to delete selected layer, Arrow keys with Shift modifier for position nudging, Ctrl+D for layer duplication, Ctrl+S for quick save), and one-click layer alignment tools (center horizontally and center vertically).

### R2. Round Management & UI Polish
Support round duplication (Duplicate Round), round reordering controls, fix the drag-and-drop final index calculation in the Layers panel, and integrate toast notifications with animated status feedback for saves and render events.

### R3. Telegram Bot Workflow & Error Recovery
Add single-round removal / undo (/undo and interactive inline button ↩️ تراجع عن آخر خبر), enrich finished video deliveries with detailed Arabic metadata captions (duration, round count, template used), provide user-friendly Arabic error explanations on render failures, and provide template guidance when /generate is triggered with an empty queue.

## Acceptance Criteria

### Frontend Quality & Ergonomics
- [ ] Undo and redo buttons and keyboard shortcuts revert and re-apply model mutations accurately.
- [ ] Keyboard shortcuts (Space, Delete, Arrows, Ctrl+D, Ctrl+S) operate when outside text inputs.
- [ ] Layer duplication and alignment actions position elements cleanly within bounds.
- [ ] Round duplication and reordering update both the canvas active round and sequencer timeline without drift.
- [ ] Frontend npm run build and npm test pass with 0 errors.

### Telegram Bot Experience
- [ ] /undo or inline undo removes the latest pending round and updates the waiting count.
- [ ] Delivered videos include informative caption metadata in Arabic.
- [ ] Celery task failures surface clear Arabic error descriptions rather than silent hangs.
- [ ] Backend pytest tests/ passes with 0 failures.
