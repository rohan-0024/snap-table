# SnapTable

**Screenshot in. Spreadsheet out.**

A table inside a PDF, an image or a slide usually can't be copied properly. You get jumbled text, broken
columns, or nothing at all. SnapTable fixes that: paste or upload a picture of the table and get back a clean,
editable **Excel (.xlsx)** or **CSV** file in seconds.

---

## What it does

- **Paste, drop or upload.** Use `Ctrl + V` with a screenshot, drag in a file, or browse. PNG, JPG, WEBP and PDF are supported.
- **Finds the table and its grid.** It works with ruled tables and with tables that have no borders at all.
- **Reads every cell.** OCR reads the text and places each word in the right row and column.
- **Cleans the data.** `₹1,200` becomes the number `1200`, common OCR mix-ups (O ↔ 0, l ↔ 1) are fixed in number
  columns, and the header row is detected.
- **Lets you review before you download.** Results open in an editable grid. Cells the OCR was unsure about are
  highlighted so you can check them quickly.
- **Exports a proper spreadsheet.** Numbers are stored as real numbers, the header is styled and frozen,
  merged cells are kept, and multi-page PDFs become one sheet per table.

### Two paths, picked automatically

| Input | How it's read | Accuracy |
|---|---|---|
| Screenshot, photo, scanned PDF | Image cleanup → grid detection → OCR | High; uncertain cells are flagged |
| PDF with real text (not a scan) | Text is read directly from the PDF, no OCR | Close to 100% |

## How it works

SnapTable automates what a person does when they retype a table by hand:

```
1. Clean the image     grayscale, enlarge small text, straighten tilt, sharpen if blurry      (OpenCV)
2. Find the grid       detect ruled lines; for borderless tables, use the gaps between words  (OpenCV)
3. Read the text       every text line plus where it sits on the page                         (PaddleOCR models)
4. Place the words     each word goes into the cell it overlaps                               
5. Tidy the data       numbers, currency, OCR slips, header detection                         
6. Review & export     editable grid → .xlsx / .csv                                           (openpyxl)
```

### The tricky cases it handles

- **Merged cells.** A header spanning several columns is spotted from the missing grid line and written as a merged range in Excel.
- **Tables without borders.** Rows come from lines of text; columns come from vertical strips of empty space.
- **Tilted phone photos.** The angle of the text lines is measured and the image is rotated straight before reading.
- **Tables across several pages.** Pages with the same columns are joined, and the repeated header is dropped.
- **Titles above the table.** A caption like "Class 10-B Results" becomes the sheet name instead of a junk row.

## Tech stack

Everything here is free and open source.

| Part | Tools |
|---|---|
| Frontend | React 19, Vite, TypeScript, Tailwind CSS v4, AG Grid Community, GSAP |
| Backend | Python, FastAPI |
| Image processing | OpenCV |
| OCR | RapidOCR (PaddleOCR PP-OCR models on ONNX Runtime) |
| PDFs | pdfplumber (text PDFs), PyMuPDF (scanned pages) |
| Export | openpyxl |

## Project structure

```
snap-table/
├── backend/
│   ├── app/
│   │   ├── main.py         API: POST /api/extract, POST /api/export, GET /health
│   │   ├── pipeline.py     routes images vs PDFs, joins multi-page tables
│   │   ├── preprocess.py   grayscale, upscale, deskew, sharpen
│   │   ├── grid.py         ruled-line grid and merged-cell detection
│   │   ├── ocr.py          text + positions
│   │   ├── assemble.py     words → cells (bordered and borderless)
│   │   ├── tidy.py         number/currency cleanup, header and title detection
│   │   └── export.py       .xlsx and .csv writers
│   ├── scripts/            sample generator, smoke test, model download
│   └── requirements.txt
├── frontend/
│   └── src/                React app (upload, editable grid, animations)
└── render.yaml             one-click backend deploy on Render
```

## Run it locally

You need Python 3.11+ and Node 20+.

**Backend**

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Frontend** (in a second terminal)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The dev server forwards `/api` calls to the backend, so no extra setup is needed.
Click one of the sample tables to try it straight away.

**Test the pipeline without the UI**

```bash
cd backend
python scripts/make_samples.py   # creates ruled, borderless, merged-header, tilted and PDF samples
python scripts/smoke.py          # runs extraction on each and prints the result
```

## Deploy for free

**Backend → [Render](https://render.com)** (free web service, no credit card)

1. In Render, choose **New → Blueprint** and select this repository. It uses [`render.yaml`](render.yaml).
2. Once the frontend is live, set `CORS_ORIGINS` on the service to the frontend's URL.

The backend's measured peak memory is about 230 MB, within the free 512 MB. The free service sleeps after
15 minutes idle, so the first request after that takes about a minute.

**Frontend → [Vercel](https://vercel.com)** or Netlify

1. Import the repository and set the root directory to `frontend`.
2. Add the environment variables from [`frontend/.env.example`](frontend/.env.example):
   - `VITE_API_URL`: your Render backend URL
   - `VITE_WEB3FORMS_KEY`: optional, a free [Web3Forms](https://web3forms.com) key so the "Report an issue" form can send email

## Privacy

Uploaded files are processed in memory and never saved to disk or a database.

## Limitations

Handwriting, very low-resolution screenshots and deeply nested headers won't come out perfectly. That's why
results open in an editable grid with uncertain cells highlighted, so you can fix them before downloading.
