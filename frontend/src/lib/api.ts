import type { ExtractResponse, TableData } from './types'

// Backend base URL, from the VITE_API_URL env key (e.g. https://snaptable-api.onrender.com).
// When it is empty, requests go to the same origin: Vite's dev proxy locally, or the
// vercel.json rewrite in production. When it is set but unreachable (typo, CORS, DNS),
// `request` retries once via the same-origin path so the site keeps working.
const DIRECT = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/$/, '')
const BASES = DIRECT ? [DIRECT, ''] : ['']

async function request(path: string, init: RequestInit): Promise<Response> {
  let lastErr: unknown
  for (const base of BASES) {
    try {
      return await fetch(`${base}${path}`, init)
    } catch (err) {
      // Only network-level failures (TypeError) fall through to the next base.
      if ((err as Error).name === 'AbortError' || !(err instanceof TypeError)) throw err
      lastErr = err
    }
  }
  throw lastErr
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json()
    if (typeof body?.detail === 'string') return body.detail
    if (Array.isArray(body?.detail)) return body.detail.map((d: { msg: string }) => d.msg).join('; ')
  } catch {
    /* non-JSON body */
  }
  return res.status === 503 || res.status === 502
    ? 'The server is waking up after being idle. Try again in ~30 seconds.'
    : `Request failed (${res.status}).`
}

export async function extractTables(file: File, signal?: AbortSignal): Promise<ExtractResponse> {
  const form = new FormData()
  form.append('file', file, file.name || 'upload.png')
  const res = await request('/api/extract', { method: 'POST', body: form, signal })
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  return res.json()
}

export async function exportTables(
  tables: TableData[],
  format: 'xlsx' | 'csv',
  filename: string,
): Promise<void> {
  const res = await request('/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      format,
      filename,
      tables: tables.map((t) => ({
        name: t.name,
        rows: t.rows,
        has_header: t.has_header,
        merges: t.merges,
      })),
    }),
  })
  if (!res.ok) throw new ApiError(res.status, await readError(res))
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.${format}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function pingHealth(): Promise<boolean> {
  try {
    const res = await request('/health', { cache: 'no-store' })
    return res.ok
  } catch {
    return false
  }
}
