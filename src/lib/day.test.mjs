import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayLabel, dayShort, isHHMM, localDay, quietHoursError, recentDays } from './day.ts';

test('localDay: Kathmandu (UTC+5:45) five minutes after local midnight is the new day', () => {
  assert.equal(localDay(new Date('2026-10-09T18:20:00Z'), 'Asia/Kathmandu'), '2026-10-10');
});

test('localDay: Kathmandu at 23:55 local is still that day', () => {
  assert.equal(localDay(new Date('2026-10-10T18:10:00Z'), 'Asia/Kathmandu'), '2026-10-10');
});

test('localDay: Los Angeles evening is the previous UTC day', () => {
  assert.equal(localDay(new Date('2026-10-10T03:00:00Z'), 'America/Los_Angeles'), '2026-10-09');
});

test('recentDays: newest first, anchored on the local day', () => {
  assert.deepEqual(recentDays(3, new Date('2026-10-09T18:20:00Z'), 'Asia/Kathmandu'), [
    '2026-10-10',
    '2026-10-09',
    '2026-10-08',
  ]);
});

test('recentDays: crosses a month boundary', () => {
  assert.deepEqual(recentDays(2, new Date('2026-03-01T12:00:00Z'), 'UTC'), ['2026-03-01', '2026-02-28']);
});

test('dayLabel: names the calendar day without shifting it', () => {
  assert.equal(dayLabel('2026-10-10', 'en-US'), 'Saturday, Oct 10');
});

test('isHHMM: 24-hour HH:MM only', () => {
  assert.equal(isHHMM('22:00'), true);
  assert.equal(isHHMM('07:30'), true);
  assert.equal(isHHMM('00:00'), true);
  assert.equal(isHHMM('9:00'), false);
  assert.equal(isHHMM('24:00'), false);
  assert.equal(isHHMM('12:60'), false);
  assert.equal(isHHMM(''), false);
});

test('quietHoursError: accepts none, and overnight ranges', () => {
  assert.equal(quietHoursError([]), null);
  assert.equal(quietHoursError([{ from: '22:00', to: '07:00' }]), null);
});

test('quietHoursError: rejects a 4th period', () => {
  const r = { from: '22:00', to: '07:00' };
  assert.match(quietHoursError([r, r, r, r]) ?? '', /up to 3/i);
});

test('quietHoursError: rejects malformed times and names the period', () => {
  assert.match(quietHoursError([{ from: '22:00', to: '07:00' }, { from: '9:00', to: '10:00' }]) ?? '', /24-hour.*period 2/i);
  assert.match(quietHoursError([{ from: '22:00', to: '24:00' }]) ?? '', /24-hour/i);
});

test('quietHoursError: rejects same start and end', () => {
  assert.match(quietHoursError([{ from: '10:00', to: '10:00' }]) ?? '', /same time/i);
});

test('dayShort: weekday regardless of zone', () => {
  assert.equal(dayShort('2026-10-10', 'en-US'), 'Sat');
});
