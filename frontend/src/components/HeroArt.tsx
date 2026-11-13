import { useEffect, useRef } from 'react'
import { gsap, reducedMotion } from '../lib/motion'

/**
 * "Pixels → Cells": scattered colour blocks fly in and snap into a 4×4 grid,
 * then the grid "types" itself a few sample values and loops a gentle breathe.
 */
const COLS = 4
const ROWS = 4
const SIZE = 56
const GAP = 10
const COLORS = ['#C8FF4D', '#8B7CFF', '#FF6A4D', '#F5F1E8']
const SAMPLE = ['Name', 'Qty', 'Price', 'Total', 'Bolt', '12', '4.50', '54', 'Nut', '30', '0.80', '24', 'Gear', '2', '18', '36']

export default function HeroArt() {
  const ref = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const svg = ref.current
    if (!svg) return
    const cells = Array.from(svg.querySelectorAll<SVGGElement>('[data-cell]'))
    const labels = Array.from(svg.querySelectorAll<SVGTextElement>('[data-label]'))
    const lines = Array.from(svg.querySelectorAll<SVGLineElement>('[data-line]'))

    if (reducedMotion()) {
      gsap.set([cells, labels, lines], { opacity: 1 })
      return
    }

    const ctx = gsap.context(() => {
      gsap.set(labels, { opacity: 0 })
      gsap.set(lines, { opacity: 0, scaleX: 0, scaleY: 0, transformOrigin: 'left top' })
      cells.forEach((c) => {
        gsap.set(c, {
          x: gsap.utils.random(-260, 260),
          y: gsap.utils.random(-220, 220),
          rotation: gsap.utils.random(-90, 90),
          scale: gsap.utils.random(0.3, 1.4),
          opacity: 0,
        })
      })
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
      tl.to(cells, { opacity: 1, duration: 0.3, stagger: 0.03 })
        .to(cells, { x: 0, y: 0, rotation: 0, scale: 1, duration: 1.3, ease: 'back.out(1.4)', stagger: { each: 0.05, from: 'random' } }, 0.1)
        .to(lines, { opacity: 1, scaleX: 1, scaleY: 1, duration: 0.5, stagger: 0.04 }, '-=0.5')
        .to(labels, { opacity: 1, duration: 0.25, stagger: 0.06 }, '-=0.2')
        .to(cells, { y: -4, duration: 2.2, ease: 'sine.inOut', yoyo: true, repeat: -1, stagger: { each: 0.12, grid: [ROWS, COLS], from: 'center' } }, '+=0.2')
    }, svg)
    return () => ctx.revert()
  }, [])

  const W = COLS * SIZE + (COLS - 1) * GAP
  const H = ROWS * SIZE + (ROWS - 1) * GAP

  return (
    <svg
      ref={ref}
      viewBox={`-40 -40 ${W + 80} ${H + 80}`}
      className="h-auto w-full max-w-[380px] overflow-visible"
      role="img"
      aria-label="Scattered pixels snapping into a spreadsheet grid"
    >
      {Array.from({ length: ROWS * COLS }).map((_, i) => {
        const r = Math.floor(i / COLS)
        const c = i % COLS
        const x = c * (SIZE + GAP)
        const y = r * (SIZE + GAP)
        const header = r === 0
        const fill = header ? COLORS[0] : COLORS[(r + c) % 3 === 0 ? 1 : (r + c) % 3 === 1 ? 3 : 2]
        return (
          <g key={i} data-cell style={{ transformOrigin: `${x + SIZE / 2}px ${y + SIZE / 2}px` }}>
            <rect x={x} y={y} width={SIZE} height={SIZE} rx={10} fill={fill} opacity={header ? 1 : 0.9} />
            <text
              data-label
              x={x + SIZE / 2}
              y={y + SIZE / 2 + 5}
              textAnchor="middle"
              fontFamily="IBM Plex Mono, monospace"
              fontSize={header ? 12 : 13}
              fontWeight={header ? 600 : 500}
              fill="#0B0B10"
            >
              {SAMPLE[i]}
            </text>
          </g>
        )
      })}
      {/* grid rules that "draw" after cells land */}
      {Array.from({ length: ROWS - 1 }).map((_, i) => (
        <line key={`h${i}`} data-line x1={-16} x2={W + 16} y1={(i + 1) * (SIZE + GAP) - GAP / 2} y2={(i + 1) * (SIZE + GAP) - GAP / 2} stroke="#5C5C74" strokeWidth={1} strokeDasharray="4 6" />
      ))}
      {Array.from({ length: COLS - 1 }).map((_, i) => (
        <line key={`v${i}`} data-line y1={-16} y2={H + 16} x1={(i + 1) * (SIZE + GAP) - GAP / 2} x2={(i + 1) * (SIZE + GAP) - GAP / 2} stroke="#5C5C74" strokeWidth={1} strokeDasharray="4 6" />
      ))}
    </svg>
  )
}
