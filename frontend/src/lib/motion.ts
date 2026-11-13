import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export { gsap, ScrollTrigger }

/** True when the visitor prefers reduced motion. All animations are skipped then. */
export const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Reveal `[data-reveal]` children of `scope` when they scroll into view. */
export function revealOnScroll(scope: Element) {
  if (reducedMotion()) {
    scope.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => (el.style.opacity = '1'))
    return () => {}
  }
  const ctx = gsap.context(() => {
    const items = gsap.utils.toArray<HTMLElement>('[data-reveal]', scope)
    items.forEach((el, i) => {
      gsap.fromTo(
        el,
        { opacity: 0, y: 28 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          ease: 'power3.out',
          delay: (i % 5) * 0.06,
          scrollTrigger: { trigger: el, start: 'top 88%', once: true },
        },
      )
    })
  }, scope)
  return () => ctx.revert()
}

/** Split text into per-word spans for staggered reveals. */
export function splitWords(el: HTMLElement) {
  const text = el.textContent ?? ''
  el.textContent = ''
  el.setAttribute('aria-label', text)
  const words = text.split(' ')
  words.forEach((w, i) => {
    const outer = document.createElement('span')
    outer.className = 'inline-block overflow-hidden align-bottom'
    outer.setAttribute('aria-hidden', 'true')
    const inner = document.createElement('span')
    inner.className = 'inline-block will-change-transform'
    inner.textContent = w
    outer.appendChild(inner)
    el.appendChild(outer)
    // A real space between the inline-blocks keeps normal line wrapping.
    if (i < words.length - 1) el.appendChild(document.createTextNode(' '))
  })
  return Array.from(el.querySelectorAll<HTMLElement>('span > span'))
}

/** Button that leans toward the cursor. */
export function magnetic(el: HTMLElement, strength = 0.3) {
  if (reducedMotion() || window.matchMedia('(hover: none)').matches) return () => {}
  const xTo = gsap.quickTo(el, 'x', { duration: 0.4, ease: 'power3' })
  const yTo = gsap.quickTo(el, 'y', { duration: 0.4, ease: 'power3' })
  const move = (e: MouseEvent) => {
    const r = el.getBoundingClientRect()
    xTo((e.clientX - (r.left + r.width / 2)) * strength)
    yTo((e.clientY - (r.top + r.height / 2)) * strength)
  }
  const leave = () => {
    xTo(0)
    yTo(0)
  }
  el.addEventListener('mousemove', move)
  el.addEventListener('mouseleave', leave)
  return () => {
    el.removeEventListener('mousemove', move)
    el.removeEventListener('mouseleave', leave)
  }
}
