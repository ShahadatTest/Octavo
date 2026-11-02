# Changelog

All notable changes to Octavo are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com), versions follow
[Semantic Versioning](https://semver.org), and entries are generated from
[Conventional Commits](https://www.conventionalcommits.org) by git-cliff.

## [0.1.0] - 2026-11-02

### Added

- Octavo, an EPUB and PDF reader with a gallery, highlights and bookmarks
- Printed page numbers, title and author editing, uncropped covers

### Fixed

- **reader:** Draw the scrubber track in the page's colours
- **pdf:** Name the chapter whose heading is on screen
- **reader:** Join words broken at a line end in highlight text
- **library:** Say Trash, not Recycle Bin, outside Windows

### Documentation

- README with screenshots of every view

### Build

- Changelog and releases with git-cliff
- Ship third-party notices with every build
- Build, test and release on Windows and Linux
- **linux:** Let the AppImage launcher decide on --no-sandbox

