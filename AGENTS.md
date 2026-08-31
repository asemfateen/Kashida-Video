# Kashida Video — Complete Agent Context & Handoff

> Read this first. It is the single source of truth for **why this repo exists**, **why the frontend must be rebuilt**, and **everything learned so far**. Written for a future agent to pick up the work without re-deriving context.

---

## 1. One-paragraph summary

This repo (`Kashida Video`) is the **video-generation side** of **kashida.io**, a product that auto-designs professional **Arabic news visuals**. The repo already contains a working backend that turns news text + media into a **1080×1920 Arabic news video (MP4)** by rendering a GSAP-animated HTML template in headless Chromium (Playwright) and stitching frames with FFmpeg. Delivery is via a **Telegram bot**. The **old frontend was deleted** (it had the wrong core purpose) and a **new zero-code frontend must be built** — a "template maker" that lets non-programmers visually create the HTML/GSAP templates the renderer uses. The backend was just upgraded to support **multiple news rounds in a single video**.

---

## 2. The real product (kashida.io) — and why this repo exists

**kashida.io** is a platform for **newsrooms and content creators** to generate Arabic news **images & designs automatically** in seconds. From the site's own meta description:

> كشيدة هي منصة متخصصة لغرف الأخبار وصناع المحتوى لإنشاء وتوليد صور وتصاميم الأخبار باللغة العربية تلقائياً عبر بوت تليجرام، واتساب، وجداول جوجل في ثوانٍ معدودة وبأعلى جودة للخطوط العربية ومحاذاة الكشيدة.

Key facts:
- **Output:** Arabic news *images/designs* (the original product) — video is this repo's extension.
- **Trigger:** *Automatic* — via **Telegram bot, WhatsApp, Google Sheets**.
- **Differentiator:** **top-tier Arabic typography + "kashida" alignment** (محاذاة الكشيدة) — the elongated Arabic-stroke justification. This typographic quality *is* the product's moat.
- **Target:** newsrooms & content creators (non-programmers).
- **Site routes:** `/`, `/login`, `/signup`, `/schedule-demo`. There is an authenticated dashboard behind login.
- **Note:** The public site is a thin JS SPA (its JS bundle contains **zero Arabic text**; content is client/API-rendered). The WhatsApp + Google Sheets integrations are **not** in this repo — only Telegram is implemented.

**Why this repo exists:** The user (our human) was tasked with building the **video** part of Kashida. It will later be **combined back** into the original kashida.io project.

---

## 3. Why the old frontend was wrong, and what the new one must be

### The old frontend (deleted)
It was a **manual "template studio"** — a drag-and-drop canvas, property inspector, layer positioning, JSON export. Its core purpose was *wrong*: it treated the product as "design a template in a browser," but the actual product is **"send a message → get a news visual."** Nobody at a newsroom wants to drag headline boxes; the pipeline should just work. The old frontend also had dead code (`TemplateStudio.tsx` ~1143 lines and `LeftSidebar.tsx` were never imported; `App.tsx` used newer split components instead).

### The NEW frontend = a **zero-code Template Maker** (locked decision)
The frontend exists for **one reason**: it is where news-video **templates get created and managed** — by people who do **not** code. Jobs:

1. **MAKE templates** (the hard part) — a fully visual builder that produces **real, renderable HTML + GSAP template files** (the kind in `backend/templates/breaking_news.html`).
2. **MANAGE templates** — list / save / load / version / export.

**Zero-code = the user never sees HTML or JS.** No code surface at all — everything is a widget (slider, color picker, font dropdown, drag). Mental model is Canva/Figma-like "layers," not HTML elements. Give great defaults; map friendly options ("slides in from right", "fades up", "zoom in") to real GSAP easings internally. Ship starter templates. Provide real-time preview + playback on the 1080×1920 canvas.

### The architecture that makes it tractable (recommended, agreed in principle)
Do **not** hand-write HTML from the editor. Split into three layers:

```
1. TemplateModel  — a JSON schema describing the design (layers, styles, colors, animation timeline)
2. Visual Editor  — a React app: drag/resize/configure the model on canvas, preview & scrub the animation
3. Code Generator — a deterministic, testable function that turns a TemplateModel into a real HTML+GSAP template file
```

The editor edits a **model**, never HTML. The **Code Generator is the only thing that touches HTML** — so the hard logic is a single testable function. Bonus: the model *is* the save format, giving save/load for free. The backend already has the template-storage half (file-based + versioning in `backend/api/templates.py`).

---

## 4. Backend architecture (current state)

Stack: **FastAPI + Celery + Redis + Playwright (headless Chromium) + FFmpeg + python-telegram-bot**.

```
Frontend/API/Bot → Celery task (Redis) → renderer.py → Playwright loads HTML, injects JSON,
                  seeks GSAP timeline per frame, screenshots JPEGs → FFmpeg stitches → MP4 → served/sent
```

Files:
| File | Role |
|---|---|
| `backend/api/main.py` | FastAPI app; CORS; static mounts `/videos` + `/assets`; `/health`; Telegram webhook; seeds default templates on startup |
| `backend/api/routes.py` | `POST /api/render-video` (Celery queue, **direct-thread fallback** if Redis down), `GET /api/render-video/{task_id}` status polling |
| `backend/api/contracts.py` | Pydantic models — **the canonical JSON contract** (see §7) |
| `backend/api/templates.py` + `template_routes.py` | File-based **versioned** template storage in `backend/data/templates/`; seeds 4 defaults |
| `backend/api/assets.py` + `asset_routes.py` | Upload/list/delete/validate media assets per category |
| `backend/api/bot.py` | Telegram bot (**polling mode**) — the accumulate-model multi-round flow (see §8) |
| `backend/api/telegram.py` | Older/simpler **webhook** handler (photo/text only, no templates) — **superseded** by `bot.py` |
| `backend/workers/celery_app.py` | Celery over Redis (broker + backend) |
| `backend/workers/tasks.py` | `render_video_task` — lifecycle QUEUED → STARTED → RENDERING → ENCODING → SUCCESS |
| `backend/workers/renderer.py` | The render engine (see §6) — **just refactored for multi-round** |
| `backend/templates/*.html` | 4 GSAP templates: `breaking_news`, `economy_report`, `opinion_quote`, `sports_highlight` (+ `gsap.min.js`) |

Data dirs: `backend/data/templates/` (JSON, versioned), `backend/data/assets/{image,video}/`, `backend/static/videos/` (rendered MP4s).

---

## 5. How to run it

```bash
cd backend
python -m venv venv && source venv/bin/activate      # venv already exists
pip install -r requirements.txt
venv/bin/python -m playwright install chromium        # NOTE: use the module form, see §10

# Redis (if not running)
redis-server --daemonize yes --port 6379

# Backend API
uvicorn api.main:app --reload --port 8001 &
# Celery worker
celery -A workers.celery_app.app worker --loglevel=info --pool=solo &
# Telegram bot (polling)
venv/bin/python -m api.bot &
```

`backend/.env` keys: `REDIS_URL`, `TELEGRAM_BOT_TOKEN`, `SECRET_KEY`, `CORS_ORIGINS`.
CORS defaults: `http://localhost:5173,http://localhost:8001`.
Frontend dev: `cd frontend && npm install && npm run dev` (port 5173).

**API endpoints:** `POST /api/render-video`, `GET /api/render-video/{task_id}`, `GET/POST /api/templates`, `GET/POST/DELETE /api/assets/...`, `GET /health`.

---

## 6. Renderer pipeline & the template HTML contract

`renderer.py::render_video(task_id, json_data, output_path, progress_callback)`:
1. Resolves template `.html` from `json_data["template"]` (falls back to `breaking_news.html`).
2. Launches headless Chromium at the requested resolution (default 1080×1920).
3. `page.goto("file://<template>.html")`.
4. Injects news data via `window.loadNewsData(data)`.
5. Loops frames: `window.seekToFrame(frameNum, fps)` then `page.screenshot(...jpeg...)`.
6. Encodes frames → MP4 (`libx264`, `yuv420p`, `crf 23`).
7. **Multi-round (new):** renders each round's frames into a sub-dir, encodes each as a segment MP4, then **concatenates** via the FFmpeg concat demuxer (`c=copy`). Single-round = one segment.

**Template contract — every template `.html` MUST expose two globals (this is the whole contract):**
- `window.loadNewsData(data)` — applies headline, subheadline, colors, badge labels, background media (`videoUrl`/`imageUrl`), positions, overlay opacity, etc.
- `window.seekToFrame(frameNumber, fps)` — pauses a GSAP timeline and `seek`s to `frameNumber/fps`; also seeks background `<video>` currentTime.
- Templates use a `gsap.timeline({ paused: true })` (e.g. `window.mainTimeline`) that is seeked per frame.

`breaking_news.html` shows the pattern: `@font-face` for Arabic fonts, layers (`#topLine`, `#logoArea`, `#accentBar`, `#breakingLabel`, `.headline-area`, `#timestamp`, `#bottomBar`), a paused GSAP timeline, and `loadNewsData`/`seekToFrame` that read the JSON fields.

---

## 7. The JSON contract — `backend/api/contracts.py`

**`VideoRequest`** (legacy single-round fields — **all still valid, backward-compatible**):
`template`, `headline` (required), `subheadline`, `accentColor` (#hex), `backgroundColor` (#hex), `duration` (1–30), `fps` (15–60), `resolution{width,height}` (120–3840), `labelAr`, `labelEn`, `timestamp`, `imageUrl`, `videoUrl`, `videoScale` (0.5–3), `videoPositionX/Y` (0–100), `videoFit` ("cover"), `overlayOpacity` (0–1).

**NEW — `NewsRound`** (per-round, for multi-round videos):
`headline` (required), `subheadline`, `accentColor`, `backgroundColor`, `duration` (0–60; **0 = derive from media**), `labelAr`, `labelEn`, `timestamp`, `imageUrl`, `videoUrl`, `videoScale`, `videoPositionX/Y`, `videoFit`, `overlayOpacity`.

**NEW — `VideoRequest.rounds: list[NewsRound] = []`** — optional. When non-empty, the renderer renders & concatenates each round. When empty → legacy single-round flow. Frame-cap check (≤1800) only applies to single-round now.

**VideoRequest Pydantic validation** is only enforced on the HTTP API path (`/api/render-video`). The bot calls the Celery task directly with a raw dict, bypassing Pydantic.

---

## 8. Bot behavior (current, after the multi-round change) — `backend/api/bot.py`

**Accumulate model** (locked decision):

| Command / input | Behavior |
|---|---|
| `/start` | Welcome + template keyboard (per-user template remembered in `USER_TEMPLATES`) |
| `/templates` | Inline keyboard template selection (**one template per video**, all rounds share it) |
| text + **no media** | ❌ **Rejected** — "نسمح فقط بالخبر المرفق مع صورة أو مقطع فيديو" (text-only not allowed) |
| text + image/video | **Appends a round** to `PENDING_ROUNDS[chat_id]` (image → 5s, video → clip length) |
| `/generate` | Builds `{template, fps:30, resolution:1080x1920, rounds:[...]}`, dispatches Celery, polls, sends MP4 back, clears the queue |
| `/rounds` | Lists queued headlines |
| `/clear` | Empties the queue |

- Timing derived from each round's media (see §6); no more hardcoded `duration: 5`.
- `data/assets/video/breaking_loop.mp4` (`DEFAULT_LOOP_PATH`) is now **dead code** (was the old text-only fallback) — harmless, left in place.

---

## 9. Multi-round feature — decisions locked this session

1. **Full independence per round** — each round can have its own headline, background media, colors, badge labels (all share the video's template).
2. **Keep the old single-headline API working** — bot + old flows stay valid (verified: legacy payload renders 5s).
3. **Timing = derived from media**: video round → the clip's real length (ffprobe); image round → **5s**; explicit `duration` override wins.
4. **No text-only rounds** — every round must carry an image or video ("the image is already on the original kashida.io").
5. **Bot = accumulate model** with `/generate`, `/clear`, `/rounds`; **one template per video**.

**Verified by smoke tests:** multi-round `video(3s)+image(5s)+video(2s)` → single **10.0s / 300-frame MP4**; legacy single-round → **5.0s MP4**. Chromium was installed into `~/.cache/ms-playwright`.

---

## 10. Environment / ops notes

- Node v26.7.0, npm 11.19.0; Python 3.14 venv at `backend/venv/`.
- **Playwright install quirk:** the venv's `playwright` CLI script (`backend/venv/bin/playwright`) is broken (its shebang embeds a path with a space / resolves a bad `python3`). **Always install/run via the module:** `venv/bin/python -m playwright install chromium`. Chromium is now installed at `~/.cache/ms-playwright/`.
- System has `ffmpeg`/`ffprobe` at `/usr/bin/ffmpeg` (n9.0.1).
- **Git:** repo initialized but has **zero commits** (branch `master`, nothing committed yet). Consider an initial commit.
- No services were running at the time of this write-up (backend/frontend/Redis all stopped).

---

## 11. Known issues / observations (not yet fixed)

- **✅ Fonts FIXED:** `backend/templates/fonts/` now contains `ThmanyahSans-Regular/Medium/Bold.woff2` (downloaded from kashida.io's `/fonts/Thmanyah-Font-Family/thmanyah-typeface/thmanyahsans/woff2/`). Verified via Playwright that all three weights load and the computed font-family resolves to "Thmanyah Sans". Rendered videos now use the real Arabic typeface.
- **`breaking_loop.mp4`** in `data/assets/video/` is now unused by the bot (text-only rejected).
- **Stray file** `KASHIDA VIDEO` (108 KB) in repo root is a pasted research conversation about JSON→video engines (Editly, Remotion, Motion Canvas, FFCreator, MoviePy) — design notes, likely shouldn't be committed.
- **Old frontend deleted** — `frontend/` now contains a fresh but **incomplete scaffold** (package.json, vite.config.ts, tsconfigs, no src yet). If you decide to build the template-maker, start from there.

---

## 12. What's next / open questions

1. **✅ Template Maker frontend built** — TemplateModel schema → Code Generator (model→HTML+GSAP) → editor canvas → wired to template storage (`/api/templates`). See §14.
2. **✅ Code Generator reconciled with renderer contract** — emits templates exposing `loadNewsData` + `seekToFrame`.
3. **✅ Arabic fonts fixed** — Thmanyah Sans woff2 files now in `backend/templates/fonts/`.
4. **✅ Multi-round in the web UI** — the template maker now supports multiple rounds per template (see §14). Each round carries its own content (headline, subheadline, badge, media, colors); the design layers are shared. Test-render sends all rounds to the backend.
5. **WhatsApp + Google Sheets** integrations (part of the kashida.io vision) are not implemented here.

---

## 13. Decisions log (why things are the way they are)

- **Backend render approach = Playwright + GSAP + FFmpeg** (chosen over Remotion/Editly/FFCreator/MoviePy from the `KASHIDA VIDEO` research doc). Rationale: reuses HTML/CSS/GSAP, existing investment, no heavy new dependency.
- **New frontend purpose = zero-code template maker**, not a manual design studio, not a plain dashboard. Confirmed by the human after examining the real kashida.io product.
- **Multi-round backend** implemented with full backward compatibility; timing derived from media; no text-only.
- **Bot switched to accumulate model** to support multi-round in chat.

---

## 14. Multi-round in the web UI (template maker)

The template maker now supports **multiple rounds per template** — the design layers are shared, and each round supplies its own *content* (headline, subheadline, badge labels, timestamp, colors, background media, overlay, optional duration).

**Model (`frontend/src/lib/model.ts`):**
- `TemplateRound` — one news item's content. Fields: `id`, `name`, `headline`, `subheadline`, `labelAr`, `labelEn`, `timestamp`, `accentColor`, `backgroundColor`, `backgroundMedia?`, `overlayOpacity`, `duration` (0 = derive from media).
- `TemplateModel.rounds: TemplateRound[]` — always present; a single-round template behaves like the legacy flow.
- Helpers: `defaultRound()`, `roundFromTemplate(t)` (seed a round from design defaults), `applyRoundToLayers(layers, round)` (map a round's content onto the design layers for canvas preview).
- `coerceTemplate` back-fills `rounds` for older saved templates that predate the feature.

**Editor (`frontend/src/components/Editor.tsx`):**
- Round selector bar (add / delete / reorder / switch active round) between the toolbar and the canvas.
- The canvas previews the **active round's** content via `applyRoundToLayers`.
- `doRender` builds a `rounds` payload (each round → backend `NewsRound` shape) and sends it to `POST /api/render-video`.

**Inspector (`frontend/src/components/Inspector.tsx`):**
- When no layer is selected, shows a **Round content editor** (name, headline, subheadline, badge, timestamp, colors, duration) plus a **round media editor** (upload/select image or video, fit, zoom, position, overlay strength).
- Selecting the **logo** layer shows a **Logo image editor** — upload/select an image logo that replaces the text logo (model field `Layer.imageUrl`; rendered as `<img>` on canvas and in generated HTML).

**Backward compatibility:** existing saved templates (no `rounds`) open with a single round seeded from their design defaults. The renderer's legacy single-round path is untouched.

**Canvas drag fix (important):** the canvas layer element uses `className="el"`, but the `.el` rule (`position:absolute`) only existed in the **code generator's** generated HTML, not the frontend CSS. So layers rendered with `position:static` and `left`/`top` had no effect — **dragging updated state but the layer never moved visually**. Fixed by adding the `.el { position:absolute; box-sizing:border-box; will-change:opacity,transform; }` rule to `frontend/src/index.css`. Verified via Playwright: dragging now moves layers on screen.

---

## 15. Recent UI fixes (verify live at localhost:5173)

- **Round selector chip** — removed the redundant numeric index badge. Chips now render just the round name (`Round 1` instead of `1 Round 1`). Edit in `frontend/src/components/Editor.tsx` (round selector `<button>`).
- **Background layer selection** — the background `.el` layer previously rendered with **0 height** (invisible), so it couldn't be selected by clicking the canvas. Now the background layer fills the canvas (`width/height: 100%`, `cursor: pointer`) so it is a proper selectable "artboard" layer. Note: the background *media* (image/video) was never the problem — it renders as a sibling behind the layers in `Canvas.tsx`. Edit in `frontend/src/components/Canvas.tsx` (LayerView `style`).
- **Layers panel expand** — `onToggleCollapsed` was passed but never called, so a collapsed (icon-only) layers panel had **no way to expand back**, and it broke `npm run build` (TS6133 unused var). Added an expand button (`PanelLeftClose`) at the top of the collapsed view in `frontend/src/components/LayersPanel.tsx`. `tsc -b` now passes.

**Known "issues" that are actually NOT bugs (don't re-"fix"):**
- The background "SAVED ASSETS — none —" is a `<select>` dropdown's default/placeholder option, not an empty-state — the assets are its options. Not a bug.
- Background media display already works (rendered separately in `Canvas.tsx`).

**Not yet addressed (deferred):** the web tool's UI is English while the bot/templates are Arabic (i18n — a larger task). Flagged for the human.

---

*Authored from a live agent session. For corrections or additions, edit this file and keep the human in the loop.*
