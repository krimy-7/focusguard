// @ts-check
import { test } from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { checkExpect, runTrace } from './harness.js';

const dir = new URL('../traces/', import.meta.url);
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const trace = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
  test(`trace ${file}`, () => checkExpect(runTrace(trace), trace.expect));
}
