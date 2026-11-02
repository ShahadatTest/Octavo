# Security policy

Octavo opens books from anywhere, so it treats every EPUB and PDF as untrusted. If you find a way
around that, please tell me privately first.

## Reporting a vulnerability

Don't open a public issue. Use GitHub's private reporting instead: the repository's **Security** tab,
then **Report a vulnerability**
([direct link](https://github.com/mckenzie-andrew/Octavo/security/advisories/new)).

Include the Octavo version (shown at the bottom of Settings), your operating system, and the
smallest file or the steps that show the problem. If a particular book triggers it, a cut-down copy
you made yourself is better than a commercial book.

Octavo has one maintainer, so expect a first reply within a week. Once a fix is released, the
advisory is published and you are credited, unless you'd rather not be.

## What counts

- a book that runs script, makes a network request, or reads or writes files outside the library;
- any network request Octavo makes at all;
- a book that corrupts the library, the catalogue or another book's highlights;
- a way out of the window's sandbox or context isolation;
- a flaw in a bundled dependency (foliate-js, pdf.js and the others in
  [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)) that a book can reach.

Not in scope: attacks that need control of your user account or of Octavo's data folder already,
and the Linux AppImage running without Chromium's sandbox on systems that block unprivileged user
namespaces, which is documented in the README.

## Supported versions

Fixes go into the next release. Only the latest release is supported, so please update before
reporting.
