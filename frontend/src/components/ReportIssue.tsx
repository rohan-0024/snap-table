import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CheckCircle2, LifeBuoy, Loader2, Send, ShieldOff } from 'lucide-react'
import { revealOnScroll } from '../lib/motion'

// Where reports go is configured in frontend/.env (never shown on the page):
//   VITE_WEB3FORMS_KEY   free relay key from web3forms.com, bound to the support inbox
//   VITE_SUPPORT_EMAIL   fallback: opens the visitor's mail app pre-filled, when no key is set
const WEB3FORMS_KEY = import.meta.env.VITE_WEB3FORMS_KEY as string | undefined
const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL as string | undefined
const CONFIGURED = Boolean(WEB3FORMS_KEY || SUPPORT_EMAIL)

const CATEGORIES = ['Wrong cells or columns', 'Table not detected', 'Export problem', 'Website bug', 'Feature request', 'Other']

type Status = 'idle' | 'sending' | 'sent' | 'error'

export default function ReportIssue() {
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const ref = useRef<HTMLElement>(null)
  useEffect(() => (ref.current ? revealOnScroll(ref.current) : undefined), [])

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    const name = String(data.get('name') ?? '')
    const email = String(data.get('email') ?? '')
    const category = String(data.get('category') ?? '')
    const message = String(data.get('message') ?? '')

    if (!WEB3FORMS_KEY) {
      if (!SUPPORT_EMAIL) {
        setStatus('error')
        setError('The report form is not configured yet.')
        return
      }
      const subject = encodeURIComponent(`[SnapTable] ${category}`)
      const body = encodeURIComponent(`From: ${name} <${email}>\nCategory: ${category}\n\n${message}`)
      window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`
      setStatus('sent')
      return
    }

    setStatus('sending')
    setError('')
    try {
      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          access_key: WEB3FORMS_KEY,
          subject: `[SnapTable] ${category}`,
          from_name: 'SnapTable issue form',
          name,
          email,
          category,
          message,
          botcheck: data.get('botcheck') ?? '',
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Could not send the report.')
      setStatus('sent')
      form.reset()
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Could not send the report.')
    }
  }

  return (
    <section ref={ref} id="report" className="bg-paper-100 text-paper-900">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:py-28 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <p data-reveal className="label-mono text-coral-600">03 — Support</p>
          <h2 data-reveal className="mt-3 text-4xl font-extrabold sm:text-5xl">Something came out wrong?</h2>
          <p data-reveal className="mt-5 text-lg text-paper-900/70">
            Tell us what you uploaded and what happened. Every report is read by a human.
          </p>
          <ul className="mt-8 space-y-4 text-sm text-paper-900/80">
            <li data-reveal className="flex gap-3"><LifeBuoy className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" /> Mention the input type — screenshot, phone photo, PDF — and what you expected instead.</li>
            <li data-reveal className="flex gap-3"><ShieldOff className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" /> Uploaded files are processed in memory and never stored, so attach nothing sensitive here either.</li>
          </ul>
        </div>

        <form data-reveal onSubmit={onSubmit} className="rounded-3xl border-2 border-paper-900 bg-paper-50 p-6 shadow-pop sm:p-8 lg:col-span-7">
          {status === 'sent' ? (
            <div className="flex flex-col items-center py-10 text-center">
              <CheckCircle2 className="h-12 w-12 text-violet-600" />
              <h3 className="mt-4 text-2xl font-bold">Thanks — report received</h3>
              <p className="mt-2 text-paper-900/70">
                {WEB3FORMS_KEY ? "We'll get back to you if you left an email." : 'Your mail app should have opened with the report filled in. Hit send there.'}
              </p>
              <button type="button" onClick={() => setStatus('idle')} className="btn-dark mt-6">Send another</button>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2">
              <input type="checkbox" name="botcheck" className="hidden" tabIndex={-1} autoComplete="off" />
              <Field label="Name" name="name" placeholder="Your name" required />
              <Field label="Email" name="email" type="email" placeholder="you@example.com" required />
              <label className="block text-sm sm:col-span-2">
                <span className="label-mono text-paper-900/60">Kind of issue</span>
                <select name="category" required defaultValue={CATEGORIES[0]} className="input-paper mt-2">
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="label-mono text-paper-900/60">Description</span>
                <textarea name="message" required rows={5} placeholder="What did you upload, what did you expect, and what happened instead?" className="input-paper mt-2 resize-y" />
              </label>
              {status === 'error' && (
                <p className="rounded-xl bg-coral-500/15 px-3 py-2 text-sm text-coral-600 sm:col-span-2">{error}</p>
              )}
              <div className="flex items-center justify-end gap-4 sm:col-span-2">
                <button type="submit" disabled={status === 'sending' || !CONFIGURED} className="btn-dark">
                  {status === 'sending' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send report
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </section>
  )
}

function Field({ label, name, type = 'text', placeholder, required }: { label: string; name: string; type?: string; placeholder?: string; required?: boolean }) {
  return (
    <label className="block text-sm">
      <span className="label-mono text-paper-900/60">{label}</span>
      <input name={name} type={type} placeholder={placeholder} required={required} className="input-paper mt-2" />
    </label>
  )
}
