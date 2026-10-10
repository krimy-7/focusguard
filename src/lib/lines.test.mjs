import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_LINES, MAX_TITLE, linesError, splitLines } from './lines.ts';

test('splitLines: trims, drops blanks, handles CRLF and lone CR', () => {
  assert.deepEqual(splitLines('a\n\n  b  \r\nc\rd\n'), ['a', 'b', 'c', 'd']);
});

test('splitLines: whitespace-only input gives nothing', () => {
  assert.deepEqual(splitLines('   \n\t\n'), []);
});

test('splitLines: commas stay inside one goal (server splits on newlines only)', () => {
  assert.deepEqual(splitLines('a\nb, c'), ['a', 'b, c']);
});

test('linesError: 20 lines is fine, 21 is blocked with the count', () => {
  const twenty = Array.from({ length: MAX_LINES }, (_, i) => `goal ${i}`);
  assert.equal(linesError(twenty), null);
  assert.match(linesError([...twenty, 'one more']) ?? '', /21 goals.*up to 20/i);
});

test('linesError: a title over 200 chars is blocked and named', () => {
  assert.equal(linesError(['x'.repeat(MAX_TITLE)]), null);
  assert.match(linesError(['ok', 'x'.repeat(MAX_TITLE + 1)]) ?? '', /goal 2.*200/i);
});
