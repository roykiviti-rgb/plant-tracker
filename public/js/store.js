// Saving to the browser (localStorage). Everything stays on this device.
import { normalizeState } from './logic.js';

export const STORAGE_KEY = 'plant-tracker:v1';

/** Saved data, or null on first run. */
export function loadState() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : null;
  } catch {
    // Keep unreadable data aside instead of silently overwriting it.
    if (raw) writePref('unreadable-backup', raw);
    return null;
  }
}

/** Returns false when the browser refuses (storage full or blocked). */
export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function storageAvailable() {
  try {
    const key = `${STORAGE_KEY}:probe`;
    localStorage.setItem(key, '1');
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/** Small per-device UI preferences, such as the selected location filter. */
export function readPref(name) {
  try {
    return localStorage.getItem(`${STORAGE_KEY}:${name}`);
  } catch {
    return null;
  }
}

export function writePref(name, value) {
  try {
    localStorage.setItem(`${STORAGE_KEY}:${name}`, value);
  } catch {
    // Preferences are optional.
  }
}

/** Ask the browser not to clear our data when the device is low on space. */
export function requestPersistence() {
  navigator.storage?.persist?.().catch(() => {});
}
