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
  return GATEWAY_DOWN.has(res.status)
    ? 'The server is waking up after being idle — this takes about a minute. Please try again.'
    : `Request failed (${res.status}).`
}

export type Phase = 'waking' | 'reading'

const GATEWAY_DOWN = new Set([502, 503, 504])
const WAKE_TIMEOUT_MS = 150_000
const WAKE_POLL_MS = 4_000

/** Poll /health until the backend answers, or give up after WAKE_TIMEOUT_MS. */
async function waitForBackend(signal?: AbortSignal): Promise<boolean> {
  const deadline = Date.now() + WAKE_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (signal?.aborted) return false
    if (await pingHealth(signal)) return true
    await new Promise((r) => setTimeout(r, WAKE_POLL_MS))
  }
  return false
}

/**
 * Upload a file and get tables back. If the backend is asleep (free hosting idles
 * out after 15 min and the gateway answers 502/503/504), wait for it to wake and
 * retry once instead of making the person click again.
 */
export async function extractTables(
  file: File,
  signal?: AbortSignal,
  onPhase?: (phase: Phase) => void,
): Promise<ExtractResponse> {
  const send = async () => {
    const form = new FormData()
    form.append('file', file, file.name || 'upload.png')
    onPhase?.('reading')
    return request('/api/extract', { method: 'POST', body: form, signal })
  }

  let res = await send()
  if (GATEWAY_DOWN.has(res.status)) {
    onPhase?.('waking')
    const awake = await waitForBackend(signal)
    if (!awake) {
      throw new ApiError(res.status, 'The server is taking too long to wake up. Please try again in a minute.')
    }
    res = await send()
  }
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

export async function pingHealth(signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await request('/health', { cache: 'no-store', signal })
    return res.ok
  } catch {
    return false
  }
}
