// Pure helpers for dates, watering status, Hebrew wording and data validation.
// Nothing here touches the DOM, so the same file runs in the browser and in `npm test`.

const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_HISTORY = 100;

const PHOTO_PATH = /^plants\/[a-z0-9-]+\.jpg$/;

// ---------- Dates (YYYY-MM-DD strings) ----------

/** The local calendar date, e.g. "2026-10-22". */
export function todayISO(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isISODate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// Calendar dates are handled as UTC midnights so daylight-saving changes never shift a day.
function toUTC(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(iso, days) {
  return new Date(toUTC(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function diffDays(from, to) {
  return Math.round((toUTC(to) - toUTC(from)) / DAY_MS);
}

export function formatDate(iso, options) {
  return new Intl.DateTimeFormat('he-IL', { ...options, timeZone: 'UTC' }).format(new Date(toUTC(iso)));
}

// ---------- Watering status ----------

/**
 * kind: 'unknown' (never watered) | 'overdue' | 'today' | 'soon' (tomorrow) | 'ok'
 * level: how much "water" is left, from 1 (just watered) to 0 (due or late).
 */
export function plantStatus(plant, today) {
  const last = plant.history[0] ?? null;
  if (!last) return { kind: 'unknown', last: null, nextDue: null, daysLeft: null, sinceLast: null, level: 0 };

  let nextDue = addDays(last, plant.intervalDays);
  if (plant.snoozedUntil && plant.snoozedUntil > nextDue) nextDue = plant.snoozedUntil;
  const daysLeft = diffDays(today, nextDue);

  let kind = 'ok';
  if (daysLeft < 0) kind = 'overdue';
  else if (daysLeft === 0) kind = 'today';
  else if (daysLeft === 1) kind = 'soon';

  return { kind, last, nextDue, daysLeft, sinceLast: diffDays(last, today), level: clamp(daysLeft / plant.intervalDays, 0, 1) };
}

const RANK = { overdue: 0, today: 1, unknown: 2, soon: 3, ok: 4 };

/** Thirstiest first; plants in the same state keep the user's list order. */
export function sortPlants(plants, today) {
  return plants
    .map((plant, index) => ({ plant, index, status: plantStatus(plant, today) }))
    .sort((a, b) =>
      RANK[a.status.kind] - RANK[b.status.kind]
      || (a.status.daysLeft ?? 0) - (b.status.daysLeft ?? 0)
      || a.index - b.index);
}

export function addWatering(plant, date) {
  const history = [...new Set([date, ...plant.history])].sort().reverse().slice(0, MAX_HISTORY);
  // A new latest watering replaces any "soil is still wet" postponement.
  return { ...plant, history, snoozedUntil: history[0] === date ? null : plant.snoozedUntil };
}

export function removeWatering(plant, date) {
  return { ...plant, history: plant.history.filter((d) => d !== date) };
}

/** "The soil is still wet": push the next watering one day later. */
export function snoozePlant(plant, today, days = 1) {
  const { nextDue } = plantStatus(plant, today);
  const base = nextDue && nextDue > today ? nextDue : today;
  return { ...plant, snoozedUntil: addDays(base, days) };
}

/** Average days between recorded waterings, or null with fewer than two. */
export function averageInterval(history) {
  if (history.length < 2) return null;
  return diffDays(history[history.length - 1], history[0]) / (history.length - 1);
}

// ---------- Hebrew wording ----------

export function daysWord(n) {
  if (n === 1) return 'יום';
  if (n === 2) return 'יומיים';
  return `${n} ימים`;
}

export function dueLabel(status) {
  switch (status.kind) {
    case 'unknown': return 'אין תיעוד עדיין';
    case 'overdue': return `באיחור של ${daysWord(-status.daysLeft)}`;
    case 'today': return 'להשקות היום';
    case 'soon': return 'להשקות מחר';
    default: return `בעוד ${daysWord(status.daysLeft)}`;
  }
}

export function agoText(days) {
  if (days < 0) return 'בתאריך עתידי';
  if (days === 0) return 'היום';
  if (days === 1) return 'אתמול';
  if (days === 2) return 'שלשום';
  return `לפני ${days} ימים`;
}

export function intervalText(days) {
  if (days === 1) return 'כל יום';
  if (days === 2) return 'כל יומיים';
  if (days === 7) return 'פעם בשבוע';
  if (days === 14) return 'פעם בשבועיים';
  if (days === 30) return 'פעם בחודש';
  return `כל ${days} ימים`;
}

// ---------- Data ----------

/** Bundled photos have a small "-thumb" version; uploaded photos are already small. */
export function thumbOf(photo) {
  return PHOTO_PATH.test(photo) ? photo.replace(/\.jpg$/, '-thumb.jpg') : photo;
}

export function newId() {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Validates data from storage or a backup file. Throws if it isn't plant data. */
export function normalizeState(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.plants)) throw new Error('Not plant data');
  const seen = new Set();
  const plants = [];
  for (const item of raw.plants) {
    const plant = normalizePlant(item);
    if (!plant) continue;
    if (seen.has(plant.id)) plant.id = newId();
    seen.add(plant.id);
    plants.push(plant);
  }
  return { version: 1, plants };
}

function normalizePlant(p) {
  if (!p || typeof p !== 'object') return null;
  const name = String(p.name ?? '').trim().slice(0, 60);
  if (!name) return null;
  const history = Array.isArray(p.history)
    ? [...new Set(p.history.filter(isISODate))].sort().reverse().slice(0, MAX_HISTORY)
    : [];
  const photo = typeof p.photo === 'string' && (PHOTO_PATH.test(p.photo) || p.photo.startsWith('data:image/'))
    ? p.photo
    : null;
  return {
    id: typeof p.id === 'string' && /^[\w-]{1,40}$/.test(p.id) ? p.id : newId(),
    name,
    location: String(p.location ?? '').trim().slice(0, 40),
    intervalDays: clampInt(p.intervalDays, 1, 365, 7),
    emoji: typeof p.emoji === 'string' && p.emoji.trim() ? [...p.emoji.trim()].slice(0, 4).join('') : '🪴',
    photo,
    notes: String(p.notes ?? '').trim().slice(0, 500),
    history,
    snoozedUntil: isISODate(p.snoozedUntil) ? p.snoozedUntil : null,
  };
}

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? clamp(n, min, max) : fallback;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}
