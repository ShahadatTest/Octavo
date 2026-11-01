import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeText, PageLocator, PAGE_INDEX_VERSION } from '../src/shared/pages'

const index = (pages: string[], labels: string[] = []): PageLocator =>
  new PageLocator({ version: PAGE_INDEX_VERSION, labels, pages: pages.map(normalizeText) })

test('normalizeText folds case, accents, ligatures, punctuation and hyphenation', () => {
  assert.equal(normalizeText('The “ﬁnal” Café—hyphen-\nated, 2nd ed.'), 'thefinalcafehyphenated2nded')
})

test('a passage is found on its page and reported by its printed label', () => {
  const loc = index(
    [
      'Preface. This book is about data contracts and why they matter to every team.',
      'Chapter 1. A data contract is an agreement between the people who produce data and those who consume it.',
      'It describes the schema, the semantics and the service levels that both sides rely on.'
    ],
    ['xi', '1', '2']
  )
  assert.deepEqual(loc.locate('A data contract is an agreement between the people who produce data'), { index: 1, label: '1' })
  assert.deepEqual(loc.locate('the schema, the semantics and the service levels'), { index: 2, label: '2' })
})

test('a passage running across a page break, with a running head, still lands on its first page', () => {
  const loc = index([
    'and so the pipeline stops when the upstream team renames a column without telling anyone downstream',
    '42 | Chapter 3: Contracts in Practice which is exactly the failure a contract is meant to prevent'
  ])
  const text =
    'the upstream team renames a column without telling anyone downstream which is exactly the failure a contract is meant to prevent'
  assert.equal(loc.locate(text)?.index, 0)
})

test('repeated passages resolve to the one nearest the position in the book', () => {
  const para = 'Summary: in this chapter we covered the essentials of the topic at hand.'
  const loc = index([para, 'filler text that is long enough to matter here', para, 'more filler text that is long enough', para])
  assert.equal(loc.locate(para, 0)?.index, 0)
  assert.equal(loc.locate(para, 0.5)?.index, 2)
  assert.equal(loc.locate(para, 1)?.index, 4)
})

test('short or unknown text has no page; unlabelled pages count from 1', () => {
  const loc = index(['some page text that is reasonably long for the test'])
  assert.equal(loc.locate('short'), null)
  assert.equal(loc.locate('this sentence does not appear anywhere in the book at all'), null)
  assert.equal(loc.label(0), '1')
})
