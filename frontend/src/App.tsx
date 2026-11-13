import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, ArrowDown, ArrowRight, Menu, X } from 'lucide-react'
import Dropzone from './components/Dropzone'
import HeroArt from './components/HeroArt'
import ResultGrid from './components/ResultGrid'
import HowItWorks from './components/HowItWorks'
import ReportIssue from './components/ReportIssue'
import { ApiError, exportTables, extractTables, pingHealth, type Phase } from './lib/api'
import { gsap, magnetic, reducedMotion, splitWords } from './lib/motion'
import type { ExtractResponse, TableData } from './lib/types'

const SAMPLES = [
  { label: 'Ruled table with merged header', file: '/samples/bordered_merged.png' },
  { label: 'Borderless table', file: '/samples/borderless.png' },
]

// inputs → outputs, then a divider before the loop repeats
const MARQUEE = ['PNG', 'JPG', 'WEBP', 'PDF', 'Scans', 'Phone photos', 'Slides', '→', 'XLSX · CSV', '✦']

export default function App() {
  const [result, setResult] = useState<ExtractResponse | null>(null)
  const [active, setActive] = useState(0)
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState<Phase>('reading')
  const [elapsed, setElapsed] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [backendUp, setBackendUp] = useState<boolean | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const heroRef = useRef<HTMLElement>(null)
  const headlineRef = useRef<HTMLHeadingElement>(null)
  const ctaRef = useRef<HTMLAnchorElement>(null)
  const marqueeRef = useRef<HTMLDivElement>(null)

  // Wake the backend early (free hosting sleeps when idle).
  useEffect(() => {
    pingHealth().then(setBackendUp)
  }, [])

  // Seconds counter while a conversion is in progress.
  useEffect(() => {
    if (!busy) return
    setElapsed(0)
    const t0 = Date.now()
    const id = window.setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000)
    return () => window.clearInterval(id)
  }, [busy])

  // Hero choreography: headline words rise, supporting copy fades, marquee rolls, CTA is magnetic.
  useEffect(() => {
    if (!heroRef.current || !headlineRef.current) return
    if (reducedMotion()) {
      heroRef.current.querySelectorAll<HTMLElement>('[data-hero]').forEach((el) => (el.style.opacity = '1'))
      return
    }
    const words = splitWords(headlineRef.current)
    const ctx = gsap.context(() => {
      gsap.set('[data-hero]', { opacity: 0, y: 18 })
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
      tl.from(words, { yPercent: 110, duration: 0.9, stagger: 0.05 }, 0.1)
        .to('[data-hero]', { opacity: 1, y: 0, duration: 0.7, stagger: 0.1 }, 0.5)
      if (marqueeRef.current) {
        const track = marqueeRef.current
        gsap.to(track, { xPercent: -50, duration: 28, ease: 'none', repeat: -1 })
      }
    }, heroRef)
    const unMag = ctaRef.current ? magnetic(ctaRef.current, 0.25) : () => {}
    return () => {
      ctx.revert()
      unMag()
    }
  }, [])

  const onFile = useCallback(async (file: File) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setBusy(true)
    setPhase('reading')
    setError(null)
    try {
      const res = await extractTables(file, ctrl.signal, setPhase)
      setResult(res)
      setActive(0)
      setBackendUp(true)
      requestAnimationFrame(() => document.getElementById('result')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setError(e instanceof ApiError ? e.message : 'Could not reach the server. Is the backend running?')
    } finally {
      setBusy(false)
    }
  }, [])

  async function loadSample(path: string) {
    const blob = await fetch(path).then((r) => r.blob())
    onFile(new File([blob], path.split('/').pop() ?? 'sample.png', { type: blob.type }))
  }

  function onTableChange(t: TableData) {
    if (!result) return
    setResult({ ...result, tables: result.tables.map((x, i) => (i === active ? t : x)) })
  }

  async function onExport(format: 'xlsx' | 'csv', filename: string) {
    if (!result) return
    setExporting(true)
    setError(null)
    try {
      const tables = format === 'csv' ? [result.tables[active]] : result.tables
      await exportTables(tables, format, filename.trim() || 'snaptable')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed.')
    } finally {
      setExporting(false)
    }
  }

  function reset() {
    setResult(null)
    setError(null)
    document.getElementById('convert')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="min-h-dvh">
      {/* ------------------------------------------------------------ nav */}
      <header className="sticky top-0 z-40 border-b border-ink-600/60 bg-ink-900/80 backdrop-blur-md">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <a href="#top" className="flex items-center gap-2.5 font-display text-lg font-extrabold tracking-tight">
            <img src="/favicon.svg" alt="" className="h-8 w-8" />
            SnapTable
          </a>
          <ul className="label-mono hidden items-center gap-8 text-ink-300 md:flex">
            <li><a className="transition-colors hover:text-lime-500" href="#convert">Convert</a></li>
            <li><a className="transition-colors hover:text-lime-500" href="#how">How it works</a></li>
            <li><a className="transition-colors hover:text-lime-500" href="#report">Report an issue</a></li>
            <li>
              <a href="#convert" className="btn-primary px-4 py-2 normal-case tracking-normal">Try it now</a>
            </li>
          </ul>
          <button className="md:hidden" aria-label="Menu" onClick={() => setMenuOpen((v) => !v)}>
            {menuOpen ? <X /> : <Menu />}
          </button>
        </nav>
        {menuOpen && (
          <ul className="label-mono space-y-1 border-t border-ink-600 px-4 py-3 md:hidden" onClick={() => setMenuOpen(false)}>
            <li><a className="block rounded-lg px-3 py-2.5 hover:bg-ink-700" href="#convert">Convert</a></li>
            <li><a className="block rounded-lg px-3 py-2.5 hover:bg-ink-700" href="#how">How it works</a></li>
            <li><a className="block rounded-lg px-3 py-2.5 hover:bg-ink-700" href="#report">Report an issue</a></li>
          </ul>
        )}
      </header>

      {/* ----------------------------------------------------------- hero */}
      <section ref={heroRef} id="top" className="pixel-bg relative overflow-hidden">
        <div className="pointer-events-none absolute -left-40 top-10 h-[480px] w-[480px] rounded-full bg-violet-500/20 blur-[120px]" />
        <div className="pointer-events-none absolute -right-40 bottom-0 h-[420px] w-[420px] rounded-full bg-lime-500/15 blur-[120px]" />

        <div className="mx-auto max-w-6xl px-4 pb-10 pt-16 sm:pt-24 lg:pb-12">
          <p data-hero className="label-mono text-lime-500">OCR + table detection</p>
          <h1
            ref={headlineRef}
            className="mt-5 max-w-5xl font-extrabold leading-[0.95] tracking-[-0.04em]"
            style={{ fontSize: 'clamp(2rem, 8.4vw, 5.5rem)' }}
          >
            Screenshot in. Spreadsheet out.
          </h1>
        </div>
        <div className="mx-auto grid max-w-6xl items-start gap-12 px-4 pb-16 lg:grid-cols-12 lg:pb-20">
          <div className="lg:col-span-7">
            <p data-hero className="max-w-xl text-lg text-ink-300 sm:text-xl">
              A table in a PDF, image or slide can't be copied properly. Paste a picture of it and get a clean,
              editable <span className="font-mono text-ink-100">.xlsx</span> or <span className="font-mono text-ink-100">.csv</span> back — in seconds.
            </p>
            <div data-hero className="mt-8 flex flex-wrap items-center gap-4">
              <a ref={ctaRef} href="#convert" className="btn-primary px-6 py-3 text-base">
                Convert a table <ArrowDown className="h-4 w-4" />
              </a>
              <a href="#how" className="btn-outline px-6 py-3 text-base">See how it works</a>
            </div>
            <ul data-hero className="label-mono mt-10 flex flex-wrap gap-x-6 gap-y-2 text-ink-400">
              <li>No sign-up</li>
              <li>Files never stored</li>
              <li>Review every cell</li>
            </ul>
          </div>
          <div className="flex justify-center lg:col-span-5 lg:-mt-16 lg:justify-end">
            <HeroArt />
          </div>
        </div>

        {/* marquee */}
        <div className="border-y border-ink-600/60 bg-ink-950/60 py-3" aria-hidden="true">
          <div ref={marqueeRef} className="marquee-track label-mono gap-10 text-ink-300">
            {[...MARQUEE, ...MARQUEE].map((m, i) => (
              <span key={i} className={m === '→' || m === 'XLSX · CSV' ? 'text-lime-500' : m === '✦' ? 'text-ink-600' : ''}>{m}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------- converter */}
      <main id="convert" className="scroll-mt-20">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:py-24">
          {!result && (
            <div className="mb-8 text-center">
              <p className="label-mono text-violet-500">Try it</p>
              <h2 className="mt-3 text-3xl font-extrabold sm:text-4xl">Give it a table</h2>
            </div>
          )}
          {result ? (
            <ResultGrid
              tables={result.tables}
              active={active}
              onActive={setActive}
              onChange={onTableChange}
              onExport={onExport}
              onReset={reset}
              exporting={exporting}
              meta={result.meta}
            />
          ) : (
            <>
              <Dropzone busy={busy} phase={phase} elapsed={elapsed} onFile={onFile} />
              <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-ink-300">
                <span>No table handy? Try a sample:</span>
                {SAMPLES.map((s) => (
                  <button key={s.file} disabled={busy} onClick={() => loadSample(s.file)} className="inline-flex items-center gap-1 font-medium text-lime-500 underline-offset-4 hover:underline disabled:opacity-50">
                    {s.label} <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                ))}
              </div>
            </>
          )}

          {error && (
            <div role="alert" className="mt-5 flex items-start gap-3 rounded-2xl border border-coral-500/40 bg-coral-500/10 p-4 text-sm text-coral-500">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}
          {backendUp === false && !error && (
            <p className="label-mono mt-5 text-center text-ink-400">
              Waking the server — the first conversion can take ~30s
            </p>
          )}
        </div>
      </main>

      <HowItWorks />
      <ReportIssue />

      {/* --------------------------------------------------------- footer */}
      <footer className="border-t border-ink-600/60 bg-ink-950 text-ink-400">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm sm:flex-row">
          <p>© {new Date().getFullYear()} SnapTable</p>
          <ul className="label-mono flex gap-6">
            <li><a className="hover:text-lime-500" href="#how">How it works</a></li>
            <li><a className="hover:text-lime-500" href="#report">Report an issue</a></li>
          </ul>
        </div>
      </footer>
    </div>
  )
}
