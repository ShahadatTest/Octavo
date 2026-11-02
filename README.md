# Octavo

A desktop reader for the EPUB and PDF books you own: a shelf of covers, highlights and notes that
know their printed page, and a reader that remembers where you stopped. Free, open source, and
entirely offline.

> [!NOTE]
> Octavo is AI-generated: written by Claude in Claude Code, directed by me.
> [How it's made](#how-octavo-is-made).

![The library: a "Continue reading" shelf above a grid of book covers, each with EPUB and PDF badges](docs/screenshots/library.webp)

## Why Octavo exists

I built Octavo because I didn't like the other options.

I keep my books as EPUB and PDF files, most of them in both formats, and I wanted one place to read
them that did four things well:

- **Highlights and notes I can use later.** Mark a passage, write next to it, and get all of it out
  as a Markdown note in Obsidian, where the rest of my notes live.
- **Remember where I was.** Close a book halfway through a chapter and come back to that page, in
  either format.
- **Real page numbers.** I never understood what an e-book "location" is. I wanted the page of the
  printed book: the one I can find again and cite.
- **Look good.** A shelf of covers I want to browse and pages I want to read. A reader is something
  you look at for hours.

The readers I tried each got part of that right and lost me on the rest. So I built the one I
wanted, and I'm sharing it in case it's the one you wanted too.

### Why it's open source

- **Free stays free.** Octavo is GPL-3.0: it and every fork of it stay open.
- **You can check the claims.** "No network, no tracking" is easy to say. Here the code that blocks
  every request, and the test that proves a hostile book can't make one, are in the repository.
- **Your library outlives the app.** Books stay ordinary files; highlights are plain JSON and
  Markdown. If Octavo stopped tomorrow, nothing you made in it would be locked away.
- **It gets better with use.** If it's almost right for you, [open an issue](#get-involved) or send
  a pull request.

## How Octavo is made

Octavo is AI-generated. Nearly all of its code, tests and documentation, this README included, were
written by Claude, Anthropic's AI model, working in [Claude Code](https://claude.com/claude-code).
I directed it: I decided what Octavo should do, used each version on my own library, said what was
wrong, and chose what shipped. Every commit Claude wrote carries a `Co-Authored-By: Claude` line, so
the history shows exactly which changes those are.

What keeps it honest is what keeps any code honest: nothing ships until it passes the type check,
the unit tests and an end-to-end run of the real app on Windows and Linux, including a hostile book
that tries to run script and reach the network. If you find something a careful person would have
caught, please [open an issue](https://github.com/mckenzie-andrew/Octavo/issues/new/choose).

## What it does

- **A library folder you own.** Import files, whole folders, or the `.zip` archives Google Drive
  makes when you download a folder. Formats are recognised by content, and the same book imported
  twice is caught by its content hash.
- **One card per book.** An EPUB and a PDF of the same book are paired by file name or title and
  share a card; switch formats in the reader.
- **Covers at their own shape**, never cropped, with titles and authors cleaned of the usual
  metadata noise, and correctable by hand without touching the file.
- **EPUBs** in one page, two pages or scrolling, with the publisher's font, Literata or Inter, and
  your choice of size, spacing and line length. **PDFs** with fit to width or page, zoom, the outline
  as contents, and inverted pages at night.
- **Paper, sepia and night pages**, and a library that follows the system's light or dark theme.
- **Highlights and notes** in five colours, and **bookmarks**, each marked with the printed page:
  "p. 112", not "Loc 1,734". See [Page numbers](#page-numbers).
- **Obsidian export**: a book's highlights and notes as one Markdown note, by chapter, with pages.
- **Private and offline**: no accounts, no network, and scripts inside books never run.

## A look around

### The library

The "Continue reading" shelf holds the books in progress. Below it, every book: search by title or
author (<kbd>/</kbd>), sort by recently read, recently added, title or author, filter by All /
Reading / Not started / Finished, and size the covers with the slider. A card shows its progress and
how many highlights it has.

![The library in the dark theme](docs/screenshots/library-dark.webp)

Right-click a card to open either format, fix its title and authors, mark it finished, export its
highlights, show it in its folder, or remove it (the files go to the Recycle Bin or Trash). The PDF of
Beej's guide called itself "Bgc Usl C 1"; the editor shows what the file says and keeps the
correction separately.

<p>
  <img src="docs/screenshots/book-menu.webp" width="49%" alt="A card's right-click menu: open EPUB, open PDF, edit title and author, mark as finished, export highlights, show in folder, remove">
  <img src="docs/screenshots/edit-details.webp" width="49%" alt="The Edit title and author dialog, showing the file's own title underneath">
</p>

### Reading

An EPUB in the two-page layout on the paper theme. The bar names the book and the section; the
footer has a scrubber with a tick for each chapter, and the printed page.

![An EPUB chapter in the two-page layout with a yellow and a green highlight, and a figure of colour palettes on the facing page](docs/screenshots/reader-epub.webp)

### Highlights and notes

Select text and pick a colour; add a note in the same popover. The sidebar (<kbd>Ctrl</kbd>+<kbd>\\</kbd>)
lists the book's contents, bookmarks and highlights. Each highlight shows its note, page and
chapter, and clicking one goes there.

<p>
  <img src="docs/screenshots/highlight-note.webp" width="49%" alt="The highlight popover with five colours and a note being written">
  <img src="docs/screenshots/sidebar-highlights.webp" width="49%" alt="The sidebar's Highlights tab: four highlights with notes, each with its page and chapter">
</p>

### Page themes and appearance

The **Aa** button sets the page theme, font, text size, line spacing, line length and layout.

<p>
  <img src="docs/screenshots/appearance-sepia.webp" width="49%" alt="The appearance panel over a sepia page">
  <img src="docs/screenshots/reader-night.webp" width="49%" alt="The same pages in the night theme">
</p>

### PDFs

The PDF of the same book, at the same chapter. Highlights are stored in PDF coordinates, so they stay
on their words at any zoom.

![A PDF page with two highlights, the chapter named in the bar and the printed page in the footer](docs/screenshots/reader-pdf.webp)

### Settings

![Settings: app theme, Obsidian vault, library folder and the keyboard shortcuts](docs/screenshots/settings.webp)

The screenshots show a real library. The pages in them are from Claus O. Wilke's *Fundamentals of
Data Visualization* (O'Reilly, 2019), which is also free to read at
[clauswilke.com/dataviz](https://clauswilke.com/dataviz/) under CC BY-NC-ND 4.0; the highlights and
notes are there for illustration. Cover art belongs to its publishers.

## Install

Download the latest version from [Releases](https://github.com/mckenzie-andrew/Octavo/releases):

- **Windows:** `Octavo-<version>-setup.exe`. The installer is not code-signed, so SmartScreen asks
  before running it ("More info", then "Run anyway").
- **Linux:** `Octavo-<version>.AppImage`. Make it executable and run it:
  `chmod +x Octavo-*.AppImage && ./Octavo-*.AppImage`. AppImages need FUSE 2: on Ubuntu, install
  `libfuse2` (`libfuse2t64` on 24.04 and later).
- **macOS:** not yet. The code has the Mac window controls and menu, but Octavo has not been run on
  a Mac, and macOS blocks apps that are not signed and notarised by Apple. If you have a Mac and want
  to help, see [#5](https://github.com/mckenzie-andrew/Octavo/issues/5).

Each release lists the files' SHA-256 checksums in `SHA256SUMS.txt`. To build Octavo yourself, see
[CONTRIBUTING.md](CONTRIBUTING.md#building-and-running).

## Using Octavo

### Getting books in

Drop EPUB or PDF files, folders, or `.zip` archives anywhere on the window, or use **Import**
(<kbd>Ctrl</kbd>+<kbd>O</kbd>). Octavo copies the books into its library folder, keeping the folders
they came in, and skips duplicates and anything that is not a book. Files copied into the library
folder by hand appear after a rescan (<kbd>Ctrl</kbd>+<kbd>R</kbd>).

Two files become one book when they sit in the same folder with the same name, ignoring case and
punctuation (`datacontracts.epub` and `datacontracts.pdf`), or when an EPUB and a PDF have the same
title. The EPUB supplies the title, authors and cover; the PDF fills any gaps. A card opens the
format you read last.

To fix a book's title or authors, right-click its card and choose **Edit title and author…**. The
correction is stored in Octavo's catalogue, survives re-reading the files, and can be dropped again
with **Use the file's details**. Book files are never written to.

### Keys

| Keys | |
| --- | --- |
| <kbd>←</kbd> <kbd>→</kbd> <kbd>PgUp</kbd> <kbd>PgDn</kbd> <kbd>Space</kbd> | Turn pages |
| <kbd>Ctrl</kbd>+<kbd>B</kbd> | Bookmark the page |
| <kbd>Ctrl</kbd>+<kbd>\\</kbd> | Contents, bookmarks and highlights |
| <kbd>Esc</kbd> | Back to the library |
| <kbd>/</kbd> or <kbd>Ctrl</kbd>+<kbd>F</kbd> | Search the library |
| <kbd>Ctrl</kbd>+<kbd>O</kbd> | Import books |
| <kbd>Ctrl</kbd>+<kbd>R</kbd> | Rescan the library folder |
| <kbd>Ctrl</kbd>+<kbd>,</kbd> | Settings |

Reading positions are saved as you go, per file, and a book reopens where you left it.

### Page numbers

E-book readers usually place a passage by "location" or percentage, because an EPUB has no fixed
pages: they depend on the window and the font size. Octavo records the page of the print edition
instead.

- **PDF:** the page's own label from the PDF, so front matter reads "xii" and the body "112".
- **EPUB with a PDF of the same book:** EPUBs rarely carry the print edition's page numbers, so
  Octavo extracts the text of each PDF page once and finds the highlighted passage there. Text is
  compared as plain letters and digits, which absorbs hyphenation, ligatures, curly quotes and
  spacing. On a library of 28 EPUB and PDF pairs, all 1,680 sampled paragraphs were found.
- **EPUB on its own:** the footer shows the EPUB's own page numbers if it has them, otherwise a
  location ("Loc 31 of 410"): a fixed slice of about 1,500 characters that does not move when you
  change the font size.

Highlights made before a page was known are filled in the next time the book is opened.

### Obsidian

Choose your vault in Settings (<kbd>Ctrl</kbd>+<kbd>,</kbd>). **Export to Obsidian**, in the
reader's Highlights tab or a card's right-click menu, writes `<vault>/Books/<Title>.md`; the
subfolder is a setting. The note looks like this (the start of the export from the screenshots):

```markdown
---
title: "Fundamentals of Data Visualization"
author: "Claus O. Wilke"
source: octavo
highlights: 6
exported: 2026-11-01
---

# Fundamentals of Data Visualization

*Claus O. Wilke*

## From the EPUB

### 4. Color Scales

> There are three fundamental use cases for color in data visualizations: we can use color to
> distinguish groups of data from each other, to represent data values, and to highlight.

Three jobs for color: tell groups apart, show a value, or point at something. Pick the job first.

*p. 27*
```

Highlights are grouped by chapter in reading order, with a section per format when a book has
highlights in both. Octavo overwrites a note only if its front matter says `source: octavo`;
otherwise it writes `<Title> (Octavo).md` beside it, so a note you wrote yourself is never replaced.

### Where your data lives

Octavo's folder is `%APPDATA%\Octavo` on Windows and `~/.config/Octavo` on Linux:

```
Octavo/
  settings.json               appearance, gallery, Obsidian vault
  Library/
    <your books, as imported: files and folders>
    .octavo/
      catalog.json            every book file, its metadata and any title you corrected
      covers/<id>.webp        cover thumbnails
      annotations/<id>.json   highlights, notes, bookmarks and reading position
      pages/<id>.json         PDFs only: page labels and page text for page numbers
```

`<id>` is the start of the file's SHA-256, so highlights belong to a book's content, not its file
name: renaming or moving a file inside the library keeps them. Annotation files are plain JSON,
written atomically. [DESIGN.md](DESIGN.md) documents every format.

## What Octavo is, and isn't

These decide what gets built.

**Octavo is**

- a reader for books you already own, as DRM-free files on your own disk;
- private by construction: no accounts, no servers, no telemetry, no network;
- meant to look and feel good, because reading happens on a screen for hours;
- honest about your data: plain files you can read, back up and take elsewhere.

**Octavo isn't**

- a library manager. [Calibre](https://calibre-ebook.com) converts formats, edits metadata and
  talks to e-readers; Octavo reads, highlights and remembers.
- a store or a DRM reader. It opens DRM-free EPUB and PDF only.
- a cloud service. Your library is a folder on your disk and stays there.

A feature that needs an account or a server, or sends anything off your machine, won't be merged.
If something optional ever needs the network, such as checking for updates, it will be off until you
turn it on.

## Privacy and security

- Octavo makes no network requests. The main process cancels any http(s) or WebSocket request from
  the window, and the content security policy names no remote origin, so an EPUB cannot load
  remote images, fonts or styles either. There are no accounts, telemetry or update checks.
- EPUBs can contain scripts. They do not run: the page CSP allows no inline or book scripts.
- The window runs with `contextIsolation` and `sandbox`, without Node. Books are served by a
  private `octavo-book://` protocol by content id, never by path, so the window cannot read files
  outside the library. On Linux systems that block unprivileged user namespaces, such as Ubuntu
  24.04, the AppImage has to start without Chromium's sandbox; the rest of this list still holds.
- Every build runs the first two against a hostile test EPUB (an inline script, an `onerror`
  handler, remote script, stylesheet and image) pointed at a local trap server: opening it runs
  nothing and the server sees no request.

Found a way around any of this? Please report it privately; see [SECURITY.md](SECURITY.md).

## Get involved

Octavo is maintained by one person in spare time, so help of any size counts.

- **Use it and say what breaks.** [Bug reports](https://github.com/mckenzie-andrew/Octavo/issues/new/choose)
  with the book format and steps to reproduce are the most useful thing you can send.
- **Shape what's next.** The roadmap lives in
  [issues labelled `enhancement`](https://github.com/mckenzie-andrew/Octavo/issues?q=is%3Aissue+is%3Aopen+label%3Aenhancement);
  vote with a 👍 or add your case to the discussion.
- **Write code.** Start with a
  [good first issue](https://github.com/mckenzie-andrew/Octavo/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
  and read [CONTRIBUTING.md](CONTRIBUTING.md): how to build, test and propose a change.
- **Got a Mac?** Octavo needs someone to run it there before it can ship for macOS
  ([#5](https://github.com/mckenzie-andrew/Octavo/issues/5)).

Everyone taking part is expected to follow the [code of conduct](CODE_OF_CONDUCT.md). Changes are
recorded in [CHANGELOG.md](CHANGELOG.md).

## License

Copyright (C) 2026 Andrew McKenzie

Octavo is free software: you can redistribute it and/or modify it under the terms of the GNU
General Public License as published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version. It is distributed in the hope that it will be
useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
FOR A PARTICULAR PURPOSE. See [LICENSE](LICENSE) for the full text.

The name "Octavo" and the Octavo logo are not covered by this license. Please give a fork its own
name and mark.

Octavo stands on [foliate-js](https://github.com/johnfactotum/foliate-js) (MIT) for EPUBs and
[pdf.js](https://github.com/mozilla/pdf.js) (Apache-2.0) for PDFs. The bundled typefaces, Inter and
Literata, are under the SIL Open Font License 1.1, and the icons are [Lucide](https://lucide.dev)
(ISC). Every bundled package, font and pdf.js asset is listed with its license in
[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md), which ships with each build.
