import { useEffect, useMemo, useRef, useState } from 'react'
import { AgGridReact } from 'ag-grid-react'
import { themeQuartz, type CellValueChangedEvent, type ColDef } from 'ag-grid-community'
import { Columns3, Download, FileSpreadsheet, RotateCcw, Rows3, Table2 } from 'lucide-react'
import type { Cell, TableData } from '../lib/types'
import { SOURCE_LABEL } from '../lib/types'
import { gsap, reducedMotion } from '../lib/motion'

const LOW_CONF = 0.75

const gridTheme = themeQuartz.withParams({
  backgroundColor: '#14141C',
  foregroundColor: '#ECEAE4',
  accentColor: '#C8FF4D',
  headerBackgroundColor: '#0B0B10',
  headerTextColor: '#C8FF4D',
  borderColor: '#2A2A38',
  fontFamily: 'Space Grotesk, system-ui, sans-serif',
  headerFontFamily: 'IBM Plex Mono, monospace',
  headerFontWeight: 500,
  rowHoverColor: '#1C1C27',
  oddRowBackgroundColor: '#17171f',
  cellHorizontalPadding: 12,
  inputBackgroundColor: '#0B0B10',
  inputFocusBorder: '1px solid #C8FF4D',
})

interface Props {
  tables: TableData[]
  active: number
  onActive: (i: number) => void
  onChange: (table: TableData) => void
  onExport: (format: 'xlsx' | 'csv', filename: string) => void
  onReset: () => void
  exporting: boolean
  meta: { ms: number; path: string } | null
}

type Row = Record<string, Cell> & { __i: number }

export default function ResultGrid({ tables, active, onActive, onChange, onExport, onReset, exporting, meta }: Props) {
  const table = tables[active]
  const [filename, setFilename] = useState('snaptable')
  const rootRef = useRef<HTMLElement>(null)

  // Entrance: card rises and the toolbar items stagger in.
  useEffect(() => {
    if (reducedMotion() || !rootRef.current) return
    const ctx = gsap.context(() => {
      gsap.from(rootRef.current, { y: 40, opacity: 0, scale: 0.98, duration: 0.7, ease: 'power3.out' })
      gsap.from('[data-stagger]', { y: 12, opacity: 0, duration: 0.5, stagger: 0.06, delay: 0.25, ease: 'power2.out' })
    }, rootRef)
    return () => ctx.revert()
  }, [])

  const nCols = useMemo(() => Math.max(0, ...table.rows.map((r) => r.length)), [table.rows])
  const bodyStart = table.has_header ? 1 : 0

  const colDefs = useMemo<ColDef<Row>[]>(() => {
    const defs: ColDef<Row>[] = [
      {
        headerName: '#',
        valueGetter: (p) => (p.node?.rowIndex ?? 0) + 1,
        width: 56,
        pinned: 'left',
        editable: false,
        suppressMovable: true,
        cellClass: 'font-mono text-xs text-ink-400',
      },
    ]
    for (let c = 0; c < nCols; c++) {
      const headerName = table.has_header ? String(table.rows[0]?.[c] ?? '') || `Column ${c + 1}` : colLetter(c)
      defs.push({
        field: `c${c}`,
        headerName,
        editable: true,
        flex: 1,
        minWidth: 110,
        wrapText: true,
        autoHeight: true,
        cellClassRules: {
          'cell-low-conf': (p) => {
            const r = (p.data?.__i ?? 0) + bodyStart
            const conf = table.confidence?.[r]?.[c]
            return typeof conf === 'number' && conf < LOW_CONF
          },
        },
      })
    }
    return defs
  }, [nCols, table, bodyStart])

  const rowData = useMemo<Row[]>(
    () =>
      table.rows.slice(bodyStart).map((r, i) => {
        const o: Row = { __i: i }
        for (let c = 0; c < nCols; c++) o[`c${c}`] = r[c] ?? ''
        return o
      }),
    [table.rows, bodyStart, nCols],
  )

  const lowCount = useMemo(() => {
    let n = 0
    table.confidence?.forEach((row) => row.forEach((v) => { if (v < LOW_CONF) n++ }))
    return n
  }, [table.confidence])

  function update(partial: Partial<TableData>) {
    onChange({ ...table, ...partial })
  }

  function onCellValueChanged(e: CellValueChangedEvent<Row>) {
    const c = Number(String(e.colDef.field).slice(1))
    const r = e.data.__i + bodyStart
    const rows = table.rows.map((row) => [...row])
    rows[r][c] = coerceInput(e.newValue)
    const confidence = table.confidence.map((row) => [...row])
    if (confidence[r]) confidence[r][c] = 1
    update({ rows, confidence })
  }

  function addRow() {
    update({
      rows: [...table.rows, Array(nCols).fill('')],
      confidence: [...table.confidence, Array(nCols).fill(1)],
    })
  }

  function addColumn() {
    update({
      rows: table.rows.map((r) => [...r, '']),
      confidence: table.confidence.map((r) => [...r, 1]),
    })
  }

  return (
    <section ref={rootRef} id="result" className="scroll-mt-24 overflow-hidden rounded-3xl border border-ink-600 bg-ink-800 shadow-glow">
      {/* toolbar */}
      <div className="flex flex-col gap-4 border-b border-ink-600 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 data-stagger className="text-xl font-bold">{table.name}</h2>
            <span data-stagger className="label-mono rounded-full border border-lime-500/40 bg-lime-500/10 px-2.5 py-1 text-lime-500">
              {SOURCE_LABEL[table.source] ?? table.source}
            </span>
            {meta && <span data-stagger className="font-mono text-xs text-ink-400">{(meta.ms / 1000).toFixed(1)}s</span>}
          </div>
          <p data-stagger className="mt-1.5 text-sm text-ink-300">
            {table.rows.length - bodyStart} rows × {nCols} columns
            {table.merges.length > 0 && <> · {table.merges.length} merged range{table.merges.length > 1 ? 's' : ''} kept in .xlsx</>}
            {lowCount > 0 && (
              <>
                {' '}· <span className="inline-block h-2.5 w-2.5 rounded-sm bg-coral-500/30 ring-1 ring-coral-500 align-middle" />{' '}
                {lowCount} cell{lowCount > 1 ? 's' : ''} worth a second look
              </>
            )}
          </p>
        </div>

        <div data-stagger className="flex flex-wrap items-center gap-2">
          <label className="mr-2 flex items-center gap-2 text-sm text-ink-300">
            <input
              type="checkbox"
              className="h-4 w-4 accent-lime-500"
              checked={table.has_header}
              onChange={(e) => update({ has_header: e.target.checked })}
            />
            First row is header
          </label>
          <button onClick={addRow} className="btn-ghost" title="Add row"><Rows3 className="h-4 w-4" /> Row</button>
          <button onClick={addColumn} className="btn-ghost" title="Add column"><Columns3 className="h-4 w-4" /> Column</button>
          <button onClick={onReset} className="btn-ghost" title="Start over"><RotateCcw className="h-4 w-4" /> New</button>
        </div>
      </div>

      {/* table tabs (multi-page PDFs) */}
      {tables.length > 1 && (
        <div className="flex gap-1 overflow-x-auto border-b border-ink-600 bg-ink-900 px-4 pt-3">
          {tables.map((t, i) => (
            <button
              key={i}
              onClick={() => onActive(i)}
              className={[
                'flex items-center gap-1.5 rounded-t-xl border border-b-0 px-3 py-1.5 text-sm font-medium whitespace-nowrap',
                i === active ? 'border-ink-600 bg-ink-800 text-lime-500' : 'border-transparent text-ink-300 hover:text-ink-100',
              ].join(' ')}
            >
              <Table2 className="h-4 w-4" /> {t.name}{t.page ? ` · p${t.page}` : ''}
            </button>
          ))}
        </div>
      )}

      {/* grid */}
      <div className="h-[420px] sm:h-[480px]">
        <AgGridReact<Row>
          key={`${active}-${table.has_header}-${nCols}`}
          theme={gridTheme}
          rowData={rowData}
          columnDefs={colDefs}
          onCellValueChanged={onCellValueChanged}
          defaultColDef={{ resizable: true, sortable: false }}
          stopEditingWhenCellsLoseFocus
          singleClickEdit
          enableCellTextSelection
          suppressColumnVirtualisation={nCols < 40}
        />
      </div>

      {/* export */}
      <div className="flex flex-col gap-3 border-t border-ink-600 bg-ink-900 p-5 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-sm text-ink-300">
          <span className="label-mono">File</span>
          <input
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            className="input-dark w-44 py-1.5 font-mono text-sm"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button disabled={exporting} onClick={() => onExport('csv', filename)} className="btn-outline">
            <Download className="h-4 w-4" /> CSV {tables.length > 1 && <span className="text-xs opacity-70">(this table)</span>}
          </button>
          <button disabled={exporting} onClick={() => onExport('xlsx', filename)} className="btn-primary">
            <FileSpreadsheet className="h-4 w-4" /> Download .xlsx {tables.length > 1 && <span className="text-xs opacity-80">({tables.length} sheets)</span>}
          </button>
        </div>
      </div>
    </section>
  )
}

function colLetter(i: number): string {
  let s = ''
  i++
  while (i > 0) {
    const m = (i - 1) % 26
    s = String.fromCharCode(65 + m) + s
    i = Math.floor((i - 1) / 26)
  }
  return s
}

function coerceInput(v: unknown): Cell {
  if (typeof v === 'number') return v
  const s = String(v ?? '').trim()
  if (s !== '' && /^-?\d+(\.\d+)?$/.test(s)) return Number(s)
  return s
}
