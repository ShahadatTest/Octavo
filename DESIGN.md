# Octavo: design

Octavo is a desktop reader for a personal library of EPUB and PDF books. It has
three jobs: show the library as a cover gallery, read either format
comfortably, and keep highlights, notes and bookmarks somewhere durable that
can be exported to Obsidian.

The name follows Folio: an octavo is a sheet folded three times. It is the
size most books are printed at.

## Decisions

| Question | Decision |
| --- | --- |
| Where books come from | Octavo owns a library folder (`%APPDATA%\Octavo\Library`). Books are imported by copying them in: files, whole folders, or the `.zip` archives Google Drive produces when you download a folder. No Drive API, no sign-in. |
| PDFs | First-class. An EPUB and a PDF of the same book share one gallery card with a format switch. |
| Annotations | Stored in the library folder (`.octavo/annotations/`), one JSON file per book file. A book's highlights can be exported as a Markdown note into an Obsidian vault. |
| Stack | Same as Folio: Electron 44, electron-vite 6, Vite 8, React 19, zustand 5, TypeScript 5.9. |
| EPUB engine | [foliate-js](https://github.com/johnfactotum/foliate-js) (MIT), the engine behind the Foliate reader. Paginated and scrolled layouts, EPUB CFI locations, an SVG overlay for highlights. epub.js was the alternative; it has not been released since 2023. |
| PDF engine | [pdf.js](https://github.com/mozilla/pdf.js) (`pdfjs-dist`, Apache-2.0) with its `PDFViewer` component: continuous scroll, text layer for selection, outline links. |

## Library folder

```
Library/
  <books, exactly as imported: files and subfolders>
  .octavo/
    catalog.json              index of every book file Octavo has seen
    covers/<file-id>.webp     cover thumbnails, 480 px tall
    annotations/<file-id>.json
```

- A **file id** is the first 20 hex characters of the file's SHA-256. Annotations
  are keyed by content, not by path, so renaming or moving a file inside the
  library keeps its highlights. Importing the same bytes twice is detected and
  skipped.
- The catalog caches `(path, size, mtime) → id` so start-up does not rehash
  unchanged files. Anything under the library folder is picked up on rescan,
  so dropping files in with Explorer works too.
- Formats are detected by content, not extension: `%PDF-` for PDF, a zip whose
  `mimetype` entry is `application/epub+zip` for EPUB. One file in the Drive
  library has no extension at all.
- Metadata and covers are extracted in the renderer, by the same engines that
  render the book, then sent to the main process to store. EPUB: OPF title,
  creators, publisher, language, date, cover image. PDF: the info dictionary,
  page count, and page 1 rendered as the cover.

## Pairing EPUB and PDF into one book

A **book** is derived at runtime from the files; it is never stored.

1. Files in the same folder whose names match after normalising (lower case,
   letters and digits only) are one book: `datacontracts.epub` and
   `datacontracts.pdf`.
2. Remaining single files pair when an EPUB and a PDF have the same
   normalised title (8+ characters) and neither is already paired.
3. A book holds at most one file per format. The EPUB supplies the title,
   authors and cover when present; the PDF fills any gaps.

Reading progress, highlights and bookmarks stay per file. A CFI in the EPUB
cannot be mapped to a position in the PDF. The card shows the progress of
whichever file was read most recently, and opening a book reopens that format.

## Annotation file

```jsonc
{
  "version": 1,
  "fileId": "3f9c…",
  "title": "Data Contracts",          // for humans browsing the folder
  "lastOpenedAt": "2026-11-01T14:02:11Z",
  "position": { "at": <locator>, "fraction": 0.34, "label": "Chapter 3", "updatedAt": "…" },
  "bookmarks":  [{ "id", "at", "fraction", "label", "excerpt", "createdAt" }],
  "highlights": [{ "id", "at", "fraction", "label", "text", "note", "color", "createdAt", "updatedAt" }]
}
```

A locator is `{ "cfi": "epubcfi(/6/14!/4/2/10,/1:0,/1:58)" }` for EPUB, or
`{ "page": 12, "y": 0.31, "rects": [[x1, y1, x2, y2, page], …] }` for PDF.
Rectangles are in PDF user space, one per line of text, so highlights survive
any zoom level; the fifth number lets one highlight run across a page break.
`y` is the distance down the page, 0 at the top. Writes are atomic (temp file,
then rename).

## Screens

**Gallery.** A grid of 2:3 covers with title, author, a thin progress bar and
EPUB/PDF badges. A "Continue reading" shelf above the grid when something is in
progress. Search by title or author; sort by recently read, recently added,
title or author; filter by All / Reading / Not started / Finished. Cover size
slider. Drop files, folders or zips anywhere on the window to import. Right
click a card: open as EPUB/PDF, show in folder, export highlights, remove
(moves files to the Recycle Bin).

**Reader.** Top bar: back to gallery, title, current chapter, EPUB/PDF switch
for paired books, bookmark toggle, appearance, sidebar. Sidebar tabs: Contents,
Bookmarks, Highlights. Bottom: progress scrubber with chapter ticks and
"Chapter 3 · 34%" (EPUB) or "Page 112 of 340" (PDF).

- Selecting text opens a popover: five colours, add a note, copy.
- Clicking a highlight opens the same popover to recolour, edit the note or
  delete it.
- Appearance (EPUB): paper / sepia / night, publisher / serif / sans font, font
  size, line height, page width, paginated or scrolled, one or two columns.
- Appearance (PDF): fit width / fit page / auto (fit width up to 125%, the
  default), zoom steps, inverted pages in the night theme. Fit modes re-fit
  when the window or the sidebar changes the width.
- The whole reading area, its bar and the Windows window buttons take the page
  theme; the sidebar and dialogs keep the app theme.
- A PDF's current section comes from its outline, by page and by the height of
  each heading on the page, since several sections often start on one page.
- Keys: ← → PgUp PgDn Space to turn pages, Ctrl+B bookmark, Esc back to the
  gallery.

## Obsidian export

Settings take a vault folder and a subfolder (default `Books`). Export writes
`<vault>/<subfolder>/<Title>.md`:

```markdown
---
title: "Data Contracts"
author: "Andrew Jones"
source: octavo
highlights: 12
exported: 2026-11-01
---

## Chapter 3. Contract Design

> Highlighted passage…

A note I wrote about it.

*p. 112*
```

Highlights are grouped by chapter in reading order. A book with highlights in
both formats gets an EPUB section and a PDF section. A file is overwritten only
if its frontmatter says `source: octavo`; otherwise Octavo writes
`<Title> (Octavo).md` beside it, so a hand-written note is never clobbered.

## Security

- `contextIsolation`, `sandbox`, no Node in the renderer. The preload exposes a
  typed `window.octavo` API.
- Books are served by a privileged `octavo-book://` protocol by file id, never
  by path, so the renderer cannot read outside the library.
- EPUBs can carry scripts. foliate-js renders pages in iframes sandboxed with
  `allow-scripts allow-same-origin`, which on its own would not contain them;
  Chromium logs a warning about it. What stops them is the page CSP
  (`script-src 'self'`, no inline script), which the blob: page documents
  inherit.
- All http(s) and ws requests from the renderer are cancelled in the main
  process outside development, and the CSP lists no remote origins. An EPUB
  cannot load remote images, fonts or styles.
- The smoke run checks both: a fixture EPUB with an inline script, an
  `onerror` handler, and remote script, stylesheet and image loads pointed at
  a local trap server. Opening it runs nothing and the server sees no request.

## Build steps

All four are built and covered by `npm run smoke`:

1. **Library and gallery.** Scaffold, import, hashing, catalog, pairing,
   metadata and cover extraction, gallery.
2. **EPUB reader.** foliate-js view, contents, appearance, reading position,
   bookmarks, highlights and notes.
3. **PDF reader.** pdf.js viewer, outline, position, bookmarks, highlights.
4. **Export and settings.** Obsidian export, settings panel, icons,
   packaging.

Later: full-text search inside a book, manual pair/unpair, collections or
tags, a reading-time estimate, an in-app Google Drive download, watching the
library folder instead of rescanning.
