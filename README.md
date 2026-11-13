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



## Privacy

Uploaded files are processed in memory and never saved to disk or a database.

## Limitations

Handwriting, very low-resolution screenshots and deeply nested headers won't come out perfectly. That's why
results open in an editable grid with uncertain cells highlighted, so you can fix them before downloading.
