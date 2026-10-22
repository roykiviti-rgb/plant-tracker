import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  todayISO, isISODate, addDays, diffDays, plantStatus, sortPlants, addWatering, removeWatering, snoozePlant,
  averageInterval, daysWord, dueLabel, agoText, intervalText, normalizeState, thumbOf,
} from '../public/js/logic.js';
import { createSeedState } from '../public/js/seed.js';

const TODAY = '2026-10-22';
const plant = (overrides = {}) => ({
  id: 'p1', name: 'נענע', location: '', intervalDays: 3, emoji: '🌱', photo: null, notes: '',
  history: [], snoozedUntil: null, ...overrides,
});

test('todayISO uses the local calendar date', () => {
  assert.equal(todayISO(new Date(2026, 9, 22, 23, 59)), '2026-10-22');
  assert.equal(todayISO(new Date(2026, 0, 5, 0, 1)), '2026-01-05');
});

test('date math is not shifted by daylight saving time', () => {
  assert.equal(addDays('2026-10-24', 3), '2026-10-27'); // Israel leaves DST on 2026-10-25
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(diffDays('2026-03-26', '2026-03-29'), 3); // and enters it on 2026-03-27
  assert.equal(diffDays('2026-10-27', '2026-10-24'), -3);
  assert.equal(diffDays('2025-12-31', '2026-01-01'), 1);
});

test('isISODate rejects malformed and impossible dates', () => {
  assert.ok(isISODate('2026-02-28'));
  assert.ok(!isISODate('2026-02-30'));
  assert.ok(!isISODate('2026-2-3'));
  assert.ok(!isISODate(null));
});

test('plantStatus classifies a plant by days left', () => {
  assert.equal(plantStatus(plant(), TODAY).kind, 'unknown');
  const cases = [
    ['2026-10-22', 'ok', 3],
    ['2026-10-20', 'soon', 1],
    ['2026-10-19', 'today', 0],
    ['2026-10-17', 'overdue', -2],
  ];
  for (const [last, kind, daysLeft] of cases) {
    const status = plantStatus(plant({ history: [last] }), TODAY);
    assert.equal(status.kind, kind, last);
    assert.equal(status.daysLeft, daysLeft, last);
  }
});

test('water level drains from full to empty', () => {
  const level = (last) => plantStatus(plant({ intervalDays: 4, history: [last] }), TODAY).level;
  assert.equal(level('2026-10-22'), 1);
  assert.equal(level('2026-10-20'), 0.5);
  assert.equal(level('2026-10-01'), 0);
});

test('snooze pushes the next watering one day at a time', () => {
  const overdue = plant({ history: ['2026-10-15'] });
  const snoozed = snoozePlant(overdue, TODAY);
  assert.equal(snoozed.snoozedUntil, '2026-10-23');
  assert.equal(plantStatus(snoozed, TODAY).kind, 'soon');
  assert.equal(plantStatus(snoozePlant(snoozed, TODAY), TODAY).daysLeft, 2);

  const upcoming = plant({ history: ['2026-10-21'] }); // due 2026-10-24
  assert.equal(plantStatus(snoozePlant(upcoming, TODAY), TODAY).nextDue, '2026-10-25');
});

test('addWatering keeps history unique and newest first', () => {
  let p = plant({ history: ['2026-10-10'], snoozedUntil: '2026-10-23' });
  p = addWatering(p, '2026-10-20');
  assert.deepEqual(p.history, ['2026-10-20', '2026-10-10']);
  assert.equal(p.snoozedUntil, null, 'a new latest watering clears the snooze');

  p = addWatering({ ...p, snoozedUntil: '2026-10-25' }, '2026-10-15');
  assert.deepEqual(p.history, ['2026-10-20', '2026-10-15', '2026-10-10']);
  assert.equal(p.snoozedUntil, '2026-10-25', 'back-filling an older date keeps the snooze');

  assert.deepEqual(addWatering(p, '2026-10-20').history, p.history);
  assert.deepEqual(removeWatering(p, '2026-10-15').history, ['2026-10-20', '2026-10-10']);
});

test('sortPlants puts the thirstiest first and keeps list order for ties', () => {
  const plants = [
    plant({ id: 'ok', history: ['2026-10-22'] }),
    plant({ id: 'unknown1' }),
    plant({ id: 'today', history: ['2026-10-19'] }),
    plant({ id: 'late', history: ['2026-10-10'] }),
    plant({ id: 'unknown2' }),
    plant({ id: 'soon', history: ['2026-10-20'] }),
  ];
  assert.deepEqual(
    sortPlants(plants, TODAY).map((item) => item.plant.id),
    ['late', 'today', 'unknown1', 'unknown2', 'soon', 'ok'],
  );
});

test('averageInterval', () => {
  assert.equal(averageInterval(['2026-10-20']), null);
  assert.equal(averageInterval(['2026-10-20', '2026-10-17', '2026-10-13']), 3.5);
});

test('Hebrew wording', () => {
  assert.equal(daysWord(1), 'יום');
  assert.equal(daysWord(2), 'יומיים');
  assert.equal(daysWord(5), '5 ימים');
  assert.equal(agoText(0), 'היום');
  assert.equal(agoText(1), 'אתמול');
  assert.equal(agoText(2), 'שלשום');
  assert.equal(agoText(9), 'לפני 9 ימים');
  assert.equal(intervalText(7), 'פעם בשבוע');
  assert.equal(intervalText(3), 'כל 3 ימים');
  assert.equal(dueLabel({ kind: 'overdue', daysLeft: -2 }), 'באיחור של יומיים');
  assert.equal(dueLabel({ kind: 'ok', daysLeft: 4 }), 'בעוד 4 ימים');
});

test('normalizeState cleans imported data', () => {
  assert.throws(() => normalizeState(null));
  assert.throws(() => normalizeState({ nope: true }));

  const { plants } = normalizeState({
    plants: [
      { id: 'a', name: '  פוטוס ', intervalDays: '7', history: ['2026-10-01', 'garbage', '2026-10-05', '2026-10-01'], photo: 'javascript:alert(1)' },
      { id: 'a', name: 'כפילות', intervalDays: 0 },
      { name: '' },
      'not a plant',
    ],
  });
  assert.equal(plants.length, 2);
  const [first, second] = plants;
  assert.equal(first.name, 'פוטוס');
  assert.equal(first.intervalDays, 7);
  assert.deepEqual(first.history, ['2026-10-05', '2026-10-01']);
  assert.equal(first.photo, null);
  assert.notEqual(second.id, 'a');
  assert.equal(second.intervalDays, 1);
});

test('the starting plant list is valid and survives a save/load round trip', () => {
  const seed = createSeedState();
  assert.equal(seed.plants.length, 14);
  assert.deepEqual(normalizeState(JSON.parse(JSON.stringify(seed))), seed);
  assert.equal(new Set(seed.plants.map((p) => p.id)).size, seed.plants.length);
});

test('thumbOf maps bundled photos to their thumbnails', () => {
  assert.equal(thumbOf('plants/zz.jpg'), 'plants/zz-thumb.jpg');
  assert.equal(thumbOf('data:image/jpeg;base64,abc'), 'data:image/jpeg;base64,abc');
});
