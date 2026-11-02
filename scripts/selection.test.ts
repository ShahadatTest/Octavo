import { test } from 'node:test'
import assert from 'node:assert/strict'
import { selectionText } from '../src/shared/selection'

test('a word broken at a line end with U+2010 is joined again', () => {
  assert.equal(
    selectionText('different manufactur‐\ners of a certain product.'),
    'different manufacturers of a certain product.'
  )
  assert.equal(selectionText('sur‐ \n  faces'), 'surfaces')
})

test('a soft hyphen goes, at a line end or inside a word', () => {
  assert.equal(selectionText('hyphen­\nation and in­line'), 'hyphenation and inline')
})

test('a plain hyphen at a line end is kept, since it may join a compound', () => {
  assert.equal(selectionText('a well-\ndesigned system'), 'a well-designed system')
  assert.equal(selectionText('pages 10-\n12'), 'pages 10-12')
})

test('a U+2010 before a capital stays, written as a plain hyphen', () => {
  assert.equal(selectionText('non‐\nEuclidean and data‐driven'), 'non-Euclidean and data-driven')
})

test('ordinary line ends become spaces, and a dash between words is left alone', () => {
  assert.equal(selectionText('  end of a line.\nNext line -\nand more\r\n'), 'end of a line. Next line - and more')
})
