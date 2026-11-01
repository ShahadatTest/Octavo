import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeLineBoxes } from '../src/shared/geometry'
import { plausibleTitle } from '../src/shared/books'

const box = (left: number, top: number, right: number, bottom: number): { left: number; top: number; right: number; bottom: number } => ({
  left,
  top,
  right,
  bottom
})

test('spans on one line merge into one band; separate lines stay separate', () => {
  const merged = mergeLineBoxes([
    box(10, 100, 60, 114),
    box(62, 101, 140, 114), // same line, a 2 px gap
    box(10, 120, 90, 134), // next line
    box(200, 100, 260, 114) // same line, but far away: a second column
  ])
  assert.deepEqual(merged, [box(10, 100, 140, 114), box(200, 100, 260, 114), box(10, 120, 90, 134)])
})

test('empty and hairline boxes are dropped', () => {
  assert.deepEqual(mergeLineBoxes([box(0, 0, 0, 10), box(0, 0, 10, 0.2)]), [])
})

test('a superscript that overlaps its line joins it', () => {
  const merged = mergeLineBoxes([box(10, 100, 80, 114), box(80, 97, 86, 106)])
  assert.deepEqual(merged, [box(10, 97, 86, 114)])
})

test('plausibleTitle keeps real titles and rejects placeholders', () => {
  assert.equal(plausibleTitle('Data Contracts'), 'Data Contracts')
  assert.equal(plausibleTitle('Microsoft Word - draft7.docx'), '')
  assert.equal(plausibleTitle('untitled'), '')
  assert.equal(plausibleTitle('book.indd'), '')
  assert.equal(plausibleTitle('ab'), '')
  assert.equal(plausibleTitle('datamanagementatscale2ndedition'), '')
  assert.equal(plausibleTitle(undefined), '')
})
