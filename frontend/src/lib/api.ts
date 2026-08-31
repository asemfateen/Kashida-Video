// API client for the Kashida backend. The template maker saves to the backend
// only (no localStorage fallback), so this client tracks live backend
// reachability and lets the UI react to it ("Connected" / "Backend offline —
// cannot save").

export interface TemplateMeta {
  id: string
  name: string
  description: string
  version: number
  created_at: number
  updated_at: number
  tags: string[]
}

export interface TemplateRecord {
  meta: TemplateMeta
  data: Record<string, unknown>
}

export interface Asset {
  category: string
  filename: string
  size: number
  mime: string
}

// --- Backend connectivity ---------------------------------------------------
// Set by every request: any HTTP response (even 4xx/5xx) means the backend is
// reachable; a network failure means it is not. Updated eagerly via
// `checkBackend()` on app mount. Component code should use `useBackendOnline()`
// (see lib/useBackend.ts) so the UI re-renders when the state changes.

let connected = true
const listeners = new Set<() => void>()

export function isOnline(): boolean {
  return connected
}

export function subscribeBackend(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function setOnline(v: boolean): void {
  if (v === connected) return
  connected = v
  for (const l of listeners) l()
}

// Explicit reachability check against the backend health endpoint.
export async function checkBackend(): Promise<boolean> {
  try {
    await request<{ status: string }>('/api/health')
    return true
  } catch {
    try {
      await request<{ status: string }>('/health')
      return true
    } catch {
      return false
    }
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      headers: init?.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
      ...init,
    })
  } catch (e) {
    setOnline(false)
    throw e
  }
// A reached server counts as online, even if it answers with a 4xx error.
// 5xx responses are treated as offline: the Vite dev proxy answers 502 when
// the backend isn't running, and a 500/503 backend is not usable for saving.
if (!res.ok) {
  const detail = await res.text().catch(() => '')
  setOnline(res.status < 500)
  throw new Error(`${res.status}: ${detail}`)
}
  return (await res.json()) as T
}

// --- Templates (backend-only) ------------------------------------------------
export async function listTemplates(): Promise<TemplateMeta[]> {
  return (await request<{ templates: TemplateMeta[] }>('/api/templates')).templates
}

export async function getTemplate(id: string): Promise<TemplateRecord> {
  return request<TemplateRecord>(`/api/templates/${id}`)
}

export interface VersionResult {
  template_id: string
  version: number
  data: Record<string, unknown>
}

export async function getVersion(id: string, version: number): Promise<VersionResult> {
  return request<VersionResult>(`/api/templates/${id}/versions/${version}`)
}

export async function saveTemplate(
  id: string,
  data: Record<string, unknown>,
  name?: string,
  description?: string,
  tags: string[] = [],
  html?: string,
  createVersion = true,
): Promise<TemplateRecord> {
  // Backend-only save. The backend upserts (creates or updates) and writes the
  // generated HTML to backend/templates/<id>.html so the bot/renderer can use it.
  // When `createVersion` is false the update happens in place (same version) —
  // autosaves use this so they don't spam the version history; manual saves
  // create a checkpoint.
  const body = JSON.stringify({ id, name, description, tags, data, html, create_version: createVersion })
  return request<TemplateRecord>('/api/templates', { method: 'POST', body })
}

// Best-effort save fired right before the page unloads (tab close / refresh /
// Back). Uses a keepalive fetch so it can survive the navigation, and only the
// current data + HTML are written (no version bump, no waiting on the response).
export function flushSaveTemplate(
  id: string,
  data: Record<string, unknown>,
  html: string,
): void {
  const body = JSON.stringify({ id, data, html, create_version: false })
  try {
    fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    })
  } catch {
    // Best-effort only — if this fails the regular autosave covers it later.
  }
}

export async function deleteTemplate(id: string): Promise<void> {
  await request(`/api/templates/${id}`, { method: 'DELETE' })
}

// --- Assets ------------------------------------------------------------------
export async function listAssets(category?: string): Promise<Asset[]> {
  const q = category ? `?category=${encodeURIComponent(category)}` : ''
  return (await request<{ assets: Asset[] }>(`/api/assets${q}`)).assets
}

export async function uploadAsset(category: string, file: File): Promise<Asset> {
  const form = new FormData()
  form.append('file', file)
  const res = await request<{ category: string; filename: string; size: number; mime: string }>(
    `/api/assets/${category}`,
    { method: 'POST', body: form },
  )
  return res
}

export async function deleteAsset(category: string, filename: string): Promise<void> {
  await request(`/api/assets/${category}/${filename}`, { method: 'DELETE' })
}

export function assetUrl(category: string, filename: string): string {
  return `/assets/${category}/${filename}`
}

// --- Render ------------------------------------------------------------------
export interface RenderTask {
  task_id: string
  status: string
  progress?: number
  percent?: number
  message?: string
  video_url?: string
  output_url?: string
  output_path?: string
  error?: string
}

export async function requestRender(payload: Record<string, unknown>): Promise<RenderTask> {
  return request<RenderTask>('/api/render-video', { method: 'POST', body: JSON.stringify(payload) })
}

export async function getRenderStatus(taskId: string): Promise<RenderTask> {
  return request<RenderTask>(`/api/render-video/${taskId}`)
}