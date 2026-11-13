export type Cell = string | number

export interface Merge {
  r0: number
  c0: number
  r1: number
  c1: number
}

export interface TableData {
  name: string
  rows: Cell[][]
  has_header: boolean
  merges: Merge[]
  confidence: number[][]
  source: string
  page: number | null
}

export interface ExtractResponse {
  tables: TableData[]
  meta: { ms: number; path: string }
}

export const SOURCE_LABEL: Record<string, string> = {
  'ocr-bordered': 'OCR · ruled table',
  'ocr-borderless': 'OCR · borderless table',
  'pdf-text': 'PDF text layer (no OCR)',
}
