import { useEffect, useRef } from 'react'
import { Crop, FileDown, Grid3x3, ScanText, Sparkles, type LucideIcon } from 'lucide-react'
import { revealOnScroll } from '../lib/motion'

const STEPS: { icon: LucideIcon; title: string; body: string; color: string }[] = [
  { icon: Crop, title: 'Clean the image', color: 'bg-lime-500', body: 'Grayscale, straighten any tilt, enlarge small text and sharpen blurry photos so OCR gets a tidy input.' },
  { icon: Grid3x3, title: 'Find the grid', color: 'bg-violet-500', body: 'Detect ruled lines to build the row and column grid. For borderless tables, the gaps between words draw the grid instead.' },
  { icon: ScanText, title: 'Read every cell', color: 'bg-coral-500', body: 'PaddleOCR models read each text line and report where it sits, so every word lands in the right cell. Text PDFs skip OCR entirely.' },
  { icon: Sparkles, title: 'Tidy the data', color: 'bg-lime-500', body: '“₹1,200” becomes the number 1200, OCR slips like O/0 are repaired, headers are detected and merged cells preserved.' },
  { icon: FileDown, title: 'Edit and export', color: 'bg-violet-500', body: 'Fix anything in the live grid — uncertain cells are flagged — then download .xlsx or CSV.' },
]

const TRICKY = [
  ['Merged cells', 'A header spanning several columns is detected from the missing rule and written as a merged range.'],
  ['No borders', 'Rows come from line grouping, columns from vertical strips of white space between words.'],
  ['Tilted photos', 'The dominant line angle is measured and the image is rotated straight before reading.'],
  ['Multi-page PDFs', 'Tables that continue across pages are joined, and the repeated header is dropped.'],
]

export default function HowItWorks() {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => (ref.current ? revealOnScroll(ref.current) : undefined), [])

  return (
    <section ref={ref} id="how" className="pixel-bg-light bg-paper-100 text-paper-900">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:py-28">
        <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <p data-reveal className="label-mono text-violet-600">01 — How it works</p>
            <h2 data-reveal className="mt-3 text-4xl font-extrabold leading-[1.02] sm:text-6xl">
              Exactly what a person does. <span className="text-violet-600">Automated.</span>
            </h2>
          </div>
          <p data-reveal className="text-lg text-paper-900/70 lg:col-span-5">
            Someone retyping a table spots where it is, draws the grid in their head, reads each cell and types it in.
            SnapTable runs those same steps, in that order.
          </p>
        </div>

        <ol className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              data-reveal
              className="group relative rounded-3xl border-2 border-paper-900 bg-paper-50 p-6 transition-transform hover:-translate-y-1 hover:shadow-pop"
            >
              <div className="flex items-center justify-between">
                <span className={`flex h-11 w-11 items-center justify-center rounded-2xl border-2 border-paper-900 ${s.color} text-paper-900`}>
                  <s.icon className="h-5 w-5" />
                </span>
                <span className="font-mono text-sm text-paper-900/40">{String(i + 1).padStart(2, '0')}</span>
              </div>
              <h3 className="mt-5 text-lg font-bold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-paper-900/70">{s.body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-20 grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <p data-reveal className="label-mono text-coral-600">02 — The tricky cases</p>
            <h2 data-reveal className="mt-3 text-3xl font-extrabold sm:text-4xl">Where copy-paste gives up</h2>
          </div>
          <ul data-reveal className="grid gap-px overflow-hidden rounded-3xl border-2 border-paper-900 bg-paper-900 sm:grid-cols-2 lg:col-span-8">
            {TRICKY.map(([t, b]) => (
              <li key={t} className="bg-paper-50 p-6 transition-colors hover:bg-lime-500">
                <h4 className="font-display text-lg font-bold">{t}</h4>
                <p className="mt-2 text-sm text-paper-900/70">{b}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
