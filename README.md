# Octavo

A desktop reader for EPUB and PDF books: a cover gallery, highlights with notes, bookmarks, and
Markdown export to Obsidian. Electron, React and TypeScript; EPUBs render with
[foliate-js](https://github.com/johnfactotum/foliate-js), PDFs with [pdf.js](https://github.com/mozilla/pdf.js).

See [DESIGN.md](DESIGN.md) for the decisions and the data layout.

## Getting books in

Octavo keeps its own library folder, `%APPDATA%\Octavo\Library`. Drop EPUB or PDF files, whole
folders, or the `.zip` files Google Drive makes when you download a folder anywhere on the window,
or use **Import** (Ctrl+O). Octavo copies the books in, skips duplicates and anything that is not a
book, and reads titles, authors and covers from the files themselves.

An EPUB and a PDF of the same book share one card. Switch between them with the EPUB / PDF control
in the reader. To fix a book's title or authors, right-click its card and choose **Edit title and
author…**; the book files are not changed.

## Reading

| Keys | |
| --- | --- |
| ← → PgUp PgDn Space | Turn pages |
| Ctrl+B | Bookmark the page |
| Ctrl+\\ | Contents, bookmarks and highlights |
| Esc | Back to the library |
| / or Ctrl+F | Search the library |

Select text to highlight it in one of five colours, add a note, or copy it. Click a highlight to
change it. The **Aa** button sets the page theme (paper, sepia, night), font, size, spacing, line
length and layout; for PDFs, zoom and page inversion at night.

Highlights and bookmarks record the printed page they are on. A PDF knows its own pages; an EPUB
gets them from the same book's PDF when the library has one, by finding the passage's text there.
An EPUB with no PDF shows a location ("Loc 31 of 410") instead: a fixed slice of the text that does
not move when you change the font size.

Highlights, bookmarks and reading positions live in `Library\.octavo\annotations`, one JSON file per
book file, keyed by the file's content hash. They survive renames and re-imports.

## Obsidian

Choose your vault in Settings (Ctrl+,). **Export to Obsidian**, in the reader's Highlights tab or a
card's right-click menu, writes `<vault>\Books\<Title>.md` with highlights grouped by chapter. It
only overwrites notes it wrote itself.

## Development

```sh
npm install
npm run electron:fetch   # Electron 44 downloads its binary on demand
npm run dev              # hot-reloading app
npm test                 # unit tests (node:test)
npm run typecheck
npm run smoke            # builds, generates fixture books, drives the real app, screenshots to screenshots/
npm run package:win      # NSIS installer in dist/
```

`scripts/try-books.ts` imports any files you give it into a throwaway library and screenshots them;
set `OCTAVO_EXE` to try a packaged build. `OCTAVO_USER_DATA` and `OCTAVO_LIBRARY_DIR` point the app
at other folders. When launching Electron from a VS Code terminal, unset `ELECTRON_RUN_AS_NODE`.

## Licence

GPL-3.0-or-later. foliate-js is MIT, pdf.js is Apache-2.0.
