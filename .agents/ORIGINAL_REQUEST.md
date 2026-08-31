# Original User Request

## Initial Request — 2026-08-30T12:13:00Z

Enhance and polish the Kashida Video zero-code template maker frontend and the multi-round Telegram bot with advanced UI/UX, workflow shortcuts, error resilience, and asset management.

Requirements:
1. R1. Frontend Editor Productivity & Shortcuts: Complete undo/redo state management (30-level history stack with Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y), canvas keyboard shortcuts (Space to toggle play/pause, Delete/Backspace to delete selected layer, Arrow keys with Shift modifier for position nudging, Ctrl+D for layer duplication, Ctrl+S for quick save), and one-click layer alignment tools (center horizontally and center vertically).
2. R2. Round Management & UI Polish: Round duplication (Duplicate Round), round reordering controls, fix drag-and-drop final index calculation in Layers panel, toast notifications with animated status feedback for saves and render events.
3. R3. Telegram Bot Workflow & Error Recovery: Single-round removal / undo (/undo and interactive inline button ↩️ تراجع عن آخر خبر), enrich finished video deliveries with detailed Arabic metadata captions (duration, round count, template used), user-friendly Arabic error explanations on render failures, template guidance when /generate is triggered with an empty queue.

Acceptance Criteria:
- Frontend: Undo/redo revert/re-apply mutations; keyboard shortcuts outside text inputs; layer duplication and alignment within bounds; round duplication/reordering update canvas & timeline; npm run build and npm test pass with 0 errors.
- Telegram Bot: /undo or inline undo removes latest round and updates waiting count; delivered videos include Arabic caption metadata; Celery failures surface clear Arabic error descriptions; backend pytest tests/ passes with 0 failures.
