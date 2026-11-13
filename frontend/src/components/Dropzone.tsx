import { useCallback, useEffect, useRef, useState } from 'react'
import { ClipboardPaste, FileImage, FileText, Loader2, Upload } from 'lucide-react'
import { gsap, reducedMotion } from '../lib/motion'

interface Props {
  busy: boolean
  onFile: (file: File) => void
}

const ACCEPT = 'image/png,image/jpeg,image/webp,image/bmp,image/tiff,application/pdf'

export default function Dropzone({ busy, onFile }: Props) {
  const [over, setOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const iconRef = useRef<HTMLDivElement>(null)

  // Ctrl+V anywhere on the page
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (busy) return
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.kind === 'file') {
          const f = item.getAsFile()
          if (f) {
            e.preventDefault()
            onFile(new File([f], f.name || 'pasted-screenshot.png', { type: f.type }))
            return
          }
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [busy, onFile])

  // Idle: icon bobs. Busy: icon spins via CSS; box pulses its glow.
  useEffect(() => {
    if (reducedMotion() || !iconRef.current || !boxRef.current) return
    const ctx = gsap.context(() => {
      if (busy) {
        gsap.to(boxRef.current, { boxShadow: '0 0 0 2px #C8FF4D, 0 0 60px -10px #C8FF4D', duration: 0.8, yoyo: true, repeat: -1, ease: 'sine.inOut' })
      } else {
        gsap.to(iconRef.current, { y: -6, duration: 1.4, yoyo: true, repeat: -1, ease: 'sine.inOut' })
      }
    })
    return () => ctx.revert()
  }, [busy])

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || !files[0] || busy) return
      onFile(files[0])
    },
    [busy, onFile],
  )

  return (
    <div
      ref={boxRef}
      role="button"
      tabIndex={0}
      aria-label="Upload a screenshot or PDF of a table"
      onClick={() => !busy && inputRef.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !busy) {
          e.preventDefault()
          inputRef.current?.click()
        }
      }}
      onDragOver={(e) => {
        e.preventDefault()
        if (!busy) setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        handleFiles(e.dataTransfer.files)
      }}
      className={[
        'group relative cursor-pointer rounded-3xl border-2 border-dashed p-8 text-center transition-colors sm:p-12',
        'bg-ink-800/80 backdrop-blur',
        over ? 'border-lime-500 bg-lime-500/10' : 'border-ink-600 hover:border-ink-300',
        busy ? 'cursor-wait' : '',
      ].join(' ')}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ''
        }}
      />

      <div ref={iconRef} className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-lime-500 text-ink-900 shadow-pop-lime" style={{ boxShadow: '6px 6px 0 0 #8B7CFF' }}>
        {busy ? <Loader2 className="h-8 w-8 animate-spin" /> : <Upload className="h-8 w-8" />}
      </div>

      <h3 className="mt-7 text-2xl font-bold text-ink-100">
        {busy ? 'Reading your table…' : 'Drop a screenshot or PDF'}
      </h3>
      <p className="mt-2 text-ink-300">
        {busy ? (
          'Cleaning pixels, finding the grid, reading every cell.'
        ) : (
          <>
            or <span className="font-semibold text-lime-500 underline-offset-4 group-hover:underline">browse files</span>
            {' '}· or press{' '}
            <kbd className="rounded-md border border-ink-600 bg-ink-900 px-1.5 py-0.5 font-mono text-xs text-ink-100">Ctrl</kbd>
            {' + '}
            <kbd className="rounded-md border border-ink-600 bg-ink-900 px-1.5 py-0.5 font-mono text-xs text-ink-100">V</kbd>
            {' '}to paste
          </>
        )}
      </p>

      <ul className="label-mono mt-7 flex flex-wrap justify-center gap-x-6 gap-y-2 text-ink-400">
        <li className="flex items-center gap-1.5"><FileImage className="h-3.5 w-3.5" /> PNG · JPG · WEBP</li>
        <li className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> PDF text / scanned</li>
        <li className="flex items-center gap-1.5"><ClipboardPaste className="h-3.5 w-3.5" /> Clipboard</li>
      </ul>
    </div>
  )
}
