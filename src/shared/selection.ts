/**
 * The text of a selection as a highlight keeps it: one line, with words that a line end broke in
 * two joined again.
 *
 * A PDF's text layer ends every line with a line break, so a selection across a hyphenated line end
 * reads "manufactur‐\ners". What that hyphen means depends on the typesetter. O'Reilly's PDFs break
 * words with U+2010 and write compounds with "-"; many others use "-" for both, and then
 * "interest-\ning" cannot be told from "well-\ndesigned". So a soft hyphen, or a U+2010 before a
 * lower-case letter, marks a broken word and goes; any other hyphen at a line end stays, and only
 * the gap closes. EPUB text can carry soft hyphens as hyphenation hints, which go too.
 */
export function selectionText(raw: string): string {
  return raw
    .replace(/(?<=[\p{L}\p{N}])([­‐‑-])[^\S\n]*\n\s*(?=([\p{L}\p{N}]))/gu, (_, hyphen: string, next: string) =>
      hyphen === '­' || (hyphen === '‐' && /\p{Ll}/u.test(next)) ? '' : hyphen
    )
    .replace(/­/g, '')
    .replace(/[‐‑]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}
