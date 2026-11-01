import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isOctavoNote, noteFileName, renderNote } from '../src/shared/export'
import type { Highlight } from '../src/shared/types'

const h = (over: Partial<Highlight>): Highlight => ({
  id: 'h',
  at: { cfi: 'epubcfi(/6/2!/4/2,/1:0,/1:5)' },
  fraction: 0.1,
  label: 'Chapter 1',
  text: 'Some text',
  note: '',
  color: 'yellow',
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
  ...over
})

test('noteFileName strips characters vaults and file systems reject', () => {
  assert.equal(noteFileName('Data Science: The Hard Parts'), 'Data Science The Hard Parts.md')
  assert.equal(noteFileName('What? / Why*'), 'What Why.md')
  assert.equal(noteFileName('   '), 'Untitled.md')
  assert.equal(noteFileName('Ends with dots...'), 'Ends with dots.md')
})

test('a note groups highlights by chapter in reading order', () => {
  const md = renderNote({
    title: 'The Lighthouse Keeper',
    authors: ['Mara Ellison'],
    date: '2026-11-01',
    sections: [
      {
        format: 'epub',
        highlights: [
          h({ id: 'b', fraction: 0.6, label: 'Chapter 3', text: 'Later passage', note: 'Why this matters' }),
          h({ id: 'a', fraction: 0.1, label: 'Chapter 1', text: 'First line\nSecond line' })
        ]
      }
    ]
  })
  assert.match(md, /^---\ntitle: "The Lighthouse Keeper"\nauthor: "Mara Ellison"\nsource: octavo\nhighlights: 2\nexported: 2026-11-01\n---\n/)
  assert.ok(md.indexOf('## Chapter 1') < md.indexOf('## Chapter 3'))
  assert.match(md, /> First line\n>\n> Second line/)
  assert.match(md, /> Later passage\n\nWhy this matters\n\n\*60%\*/)
  assert.ok(md.endsWith('\n') && !md.endsWith('\n\n'))
})

test('PDF highlights cite the page; two formats get their own sections', () => {
  const md = renderNote({
    title: 'Book',
    authors: [],
    date: '2026-11-01',
    sections: [
      { format: 'epub', highlights: [h({})] },
      { format: 'pdf', highlights: [h({ at: { page: 112, rects: [] }, label: 'Contract Design' })] }
    ]
  })
  assert.match(md, /## From the EPUB\n\n### Chapter 1/)
  assert.match(md, /## From the PDF\n\n### Contract Design[\s\S]*\*p\. 112\*/)
  assert.ok(!md.includes('author:'))
})

test('a printed page wins over the PDF page and the percentage', () => {
  const md = renderNote({
    title: 'Book',
    authors: [],
    date: '2026-11-01',
    sections: [
      {
        format: 'epub',
        highlights: [h({ id: 'e', page: '112', fraction: 0.3 }), h({ id: 'f', fraction: 0.5, label: 'Chapter 2' })]
      }
    ]
  })
  assert.match(md, /\*p\. 112\*/)
  assert.match(md, /\*50%\*/)
  const pdf = renderNote({
    title: 'Book',
    authors: [],
    date: '2026-11-01',
    sections: [{ format: 'pdf', highlights: [h({ at: { page: 130, rects: [] }, page: 'xii' })] }]
  })
  assert.match(pdf, /\*p\. xii\*/)
})

test('only notes with source: octavo in their frontmatter count as ours', () => {
  assert.ok(isOctavoNote('---\ntitle: "x"\nsource: octavo\n---\nbody'))
  assert.ok(!isOctavoNote('---\ntitle: "x"\n---\nsource: octavo'))
  assert.ok(!isOctavoNote('# My own notes'))
})
