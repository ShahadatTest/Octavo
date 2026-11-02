# Contributing to Octavo

Thanks for looking. Octavo is a small project with one maintainer, so every bug report, idea and
pull request is read by the person who will live with it. This guide covers how to propose a change,
the rules the code follows, and how to build, test and release.

Octavo is GPL-3.0-or-later. By sending a contribution you agree that it is licensed the same way.
Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md). Security problems go to
[SECURITY.md](SECURITY.md), not to public issues.

## Ways to help

- **Report a bug.** Use the bug template: what you did, what you expected, what happened, the
  format (EPUB or PDF) and your OS. If one particular book triggers it, say where it came from;
  please don't attach books you don't have the right to share.
- **Suggest a feature.** Open an issue first and describe the problem before the solution. Check it
  against [what Octavo is, and isn't](README.md#what-octavo-is-and-isnt): a feature that needs an
  account, a server or the network won't be merged.
- **Pick up an issue.** [`good first issue`](https://github.com/mckenzie-andrew/Octavo/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
  issues are small and say where to start; [`help wanted`](https://github.com/mckenzie-andrew/Octavo/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22)
  ones need something the maintainer can't do alone, such as testing on a Mac. Comment on an issue
  before starting so two people don't build the same thing.
- **Improve the docs.** If something here or in the README was wrong or unclear, that's a bug too.

## Ground rules

These are the decisions the rest of the code relies on. A change that breaks one needs a
discussion first.

- **No network.** The app makes no requests: the main process cancels every http(s) and WebSocket
  request from the window, and the content security policy names no remote origin. A future
  feature that truly needs the network (checking for updates, say) must be opt-in, off by default,
  and agreed in an issue first.
- **Book files are never written to.** Corrections, such as a fixed title, live in the catalogue
  (`custom` in `catalog.json`).
- **Books are untrusted input.** EPUBs and PDFs come from anywhere. Book content never reaches the
  app's own DOM as HTML; EPUB pages stay inside foliate-js's frames under the CSP, and the smoke
  run's hostile book must keep running nothing and reaching nothing.
- **Data stays readable and safe.** Annotations are plain JSON keyed by the file's content hash, and
  every write is atomic (temporary file, then rename). New fields are optional, so files written by
  an older Octavo still load.
- **Say when the index is stale.** If you change what Octavo reads from book files (metadata,
  covers), raise `INDEX_VERSION` in `src/shared/types.ts`; if you change how PDF page text is
  extracted, raise `PAGE_INDEX_VERSION` in `src/shared/pages.ts`. Existing libraries then re-read
  their books once.
- **Both formats.** Reader features go through the `Engine` interface
  (`src/renderer/src/reader/engine.ts`), implemented by `epub-engine.ts` and `pdf-engine.ts`. A
  feature should work in both, or the pull request should say why it can't.
- **Logic lives in `src/shared`, with tests.** Pairing, metadata clean-up, page matching, export and
  geometry are plain TypeScript with unit tests; the main process and the React views stay thin.
- **It has to look right.** Check a UI change in the light and dark app themes and on the paper,
  sepia and night pages.

[DESIGN.md](DESIGN.md) explains the decisions and documents every data format.

## Building and running

You need [Node.js](https://nodejs.org) 22 or newer and git.

```sh
git clone https://github.com/mckenzie-andrew/Octavo.git
cd Octavo
npm install
npm run electron:fetch   # Electron downloads its binary on first use; this fetches it now
npm run dev              # the app with hot reload
```

| Command | |
| --- | --- |
| `npm run typecheck` | TypeScript for the main process, the window and the scripts |
| `npm test` | unit tests (`scripts/*.test.ts`, node:test) |
| `npm run smoke` | builds the app, generates fixture books and drives the real app (below) |
| `npm run package:win` | Windows installer in `dist/` |
| `npm run package:linux` | Linux AppImage in `dist/` (build it on Linux) |
| `npm run licenses` | regenerate `THIRD_PARTY_LICENSES.md` |
| `npm run icons` | render `resources/icon.svg` into the PNG, ICO and ICNS icons |

To run a build without installing it on Windows: `npm run build`, then
`npx electron-builder --win --dir` and start `dist/win-unpacked/Octavo.exe`.

| Environment variable | |
| --- | --- |
| `OCTAVO_USER_DATA` | Profile folder (settings and browser data). The library defaults to `Library` inside it. |
| `OCTAVO_LIBRARY_DIR` | Library folder. |
| `OCTAVO_EXE` | For `scripts/try-books.ts`: a packaged `Octavo.exe` to try instead of the dev build. |

Point both folders somewhere disposable while developing, so your own library stays out of it.
When launching Electron from a VS Code terminal, unset `ELECTRON_RUN_AS_NODE`: VS Code sets it, and
it turns Electron into plain Node.

## Tests

- **Unit tests** cover the logic in `src/shared` and the library folder. New logic comes with tests.
- **The smoke run** (`npm run smoke`) builds the app, generates fixture books in `e2e/fixtures/`, and
  drives the real app with Playwright: import, pairing, the title editor, both readers, highlights
  with notes and their page numbers, bookmarks, the sidebar, page themes, PDF zoom, Obsidian export,
  a restart, and the hostile EPUB. It saves a screenshot of each step to `screenshots/`. User-visible
  flows should get a step here.
- **`scripts/try-books.ts`** imports any books you give it into a throwaway library and screenshots
  them, for checking real files without touching your own library.

CI runs the type check, the unit tests, the smoke run and packaging on Windows and Linux for every
pull request. To run the smoke test on Ubuntu 24.04 yourself, allow unprivileged user namespaces
first and give it a display:

```sh
sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0
xvfb-run -a --server-args="-screen 0 1920x1080x24" npm run smoke
```

## Pull requests

- One change per pull request, linked to its issue.
- CI must pass.
- UI changes include screenshots; behaviour changes update the README, and data or design changes
  update [DESIGN.md](DESIGN.md).
- A new dependency that ships in the app needs a reason, and an entry in `SHIPPED` in
  `scripts/third-party-licenses.js` so its license is listed. CI regenerates
  `THIRD_PARTY_LICENSES.md` for every build, and `npm run release` commits it with each version.

### AI-assisted contributions

Octavo itself is AI-generated (see [How Octavo is made](README.md#how-octavo-is-made)), so pull
requests written with AI tools are welcome on the same terms as any other:

- you are responsible for every line, and should be able to explain it;
- you ran it: the checks pass and you tried the change in the app;
- the pull request says which tools you used, and commits written by an AI carry a
  `Co-Authored-By:` line for it, as Octavo's own do.

## Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org). The changelog and the
version number are generated from them, so the type matters:

| Type | Use it for | Effect on the version |
| --- | --- | --- |
| `feat` | a new capability | minor bump |
| `fix` | a bug fix | patch bump |
| `perf` | a performance improvement | patch bump |
| `refactor` | code change with no behaviour change | patch bump |
| `docs` | documentation only | patch bump |
| `test` | tests only | patch bump |
| `build`, `ci` | build tooling, packaging, pipelines | patch bump |
| `chore` | maintenance that fits nothing above | patch bump |
| `style` | formatting only | left out of the changelog |

```
<type>(<scope>): <summary in the imperative, lower-case, no trailing period>

<optional body: what and why>

<optional footer, e.g. "Closes #12">
```

Common scopes: `reader`, `pdf`, `epub`, `library`, `gallery`, `pages`, `export`, `linux`. A
breaking change is marked with `!` (`feat(library)!: ...`) or a `BREAKING CHANGE:` footer; while
Octavo is below 1.0 it bumps the minor version.

## Project layout

```
src/shared     book pairing, metadata clean-up, page matching, selection text, Markdown export, geometry, types
src/main       Electron main process: window, menu, IPC, library folder and catalogue, settings, Obsidian
src/preload    the window.octavo bridge exposed to the window
src/renderer   React app: gallery, reader with the foliate-js and pdf.js engines, metadata indexer, styles
scripts/       unit tests, fixture books, smoke run, try-books, pdf.js asset copy, icons, notices, release
resources/     app icon: icon.svg is the source
docs/          screenshots for the README
.github/       build, test and release workflow, issue templates, Dependabot
cliff.toml     git-cliff configuration: changelog groups and version-bump rules
DESIGN.md      the decisions, the data formats and how each feature works
```

## Releasing

For maintainers. Releases are cut from a clean `main`:

```sh
npm run release -- --dry-run   # preview the version and the changelog entry
npm run release                # write CHANGELOG.md, bump package.json, commit, tag
git push --follow-tags
```

The next version is computed by git-cliff from the commits since the last tag (`npm run
version:next` prints it); pass a version to override it, for example `npm run release -- 1.0.0`.
`npm run changelog` rewrites `CHANGELOG.md` at any time, with an "Unreleased" section for what is on
`main` but not tagged.

The pushed tag runs [`.github/workflows/build.yml`](.github/workflows/build.yml): it tests and
packages on Windows and Linux, then publishes the installer, the AppImage and `SHA256SUMS.txt` as a
GitHub release, with the changelog entry as its notes.
