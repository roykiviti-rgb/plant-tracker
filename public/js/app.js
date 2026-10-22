import {
  todayISO, addDays, diffDays, isISODate, formatDate, plantStatus, sortPlants, addWatering, removeWatering,
  snoozePlant, averageInterval, daysWord, dueLabel, agoText, intervalText, thumbOf, newId, normalizeState,
} from './logic.js';
import { STORAGE_KEY, loadState, saveState, storageAvailable, readPref, writePref, requestPersistence } from './store.js';
import { createSeedState } from './seed.js';

const EMOJIS = ['🪴', '🌿', '🌱', '🍃', '🌵', '🌴', '🌸', '🌼', '🌻', '🌷', '🪻', '🍅', '🌶️', '🍓'];
const LOCATION_IDEAS = ['מרפסת', 'בבית', 'סלון', 'מטבח', 'חדר שינה', 'גינה'];
const LONG_DATE = { weekday: 'long', day: 'numeric', month: 'long' };
const SHORT_DATE = { weekday: 'short', day: 'numeric', month: 'short' };
const HISTORY_SHOWN = 15;

const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const icon = (name) => `<svg class="icon icon-${name}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const isDue = (kind) => kind === 'overdue' || kind === 'today';
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const els = {
  today: $('#today'),
  storageWarning: $('#storage-warning'),
  summary: $('#summary'),
  filters: $('#filters'),
  list: $('#plant-list'),
  empty: $('#empty'),
  details: $('#details'),
  detailsBody: $('#details-body'),
  edit: $('#edit'),
  form: $('#edit-form'),
  toast: $('#toast'),
  toastText: $('#toast-text'),
  toastUndo: $('#toast-undo'),
  importInput: $('#import-input'),
};

const canStore = storageAvailable();
let state = loadState();
if (!state) {
  state = createSeedState();
  saveState(state);
}
let filter = readPref('filter') || 'all';
let renderedDay = '';
let openPlantId = null;
let editingId = null;
let draftPhoto = null;

// ---------- Saving ----------

/** Saves and redraws. Returns false (and changes nothing) if the browser refused to save. */
function commit(plants, { animate = false, highlight = [] } = {}) {
  const next = { ...state, plants };
  if (!saveState(next) && canStore) return false;
  state = next;
  const update = () => {
    render();
    for (const id of highlight) {
      els.list.querySelector(`[data-id="${CSS.escape(id)}"]`)?.classList.add('just-watered');
    }
  };
  if (animate && document.startViewTransition && !reducedMotion()) document.startViewTransition(update);
  else update();
  return true;
}

function updatePlant(id, change, options) {
  return commit(state.plants.map((p) => (p.id === id ? change(p) : p)), options);
}

// ---------- Actions ----------

function waterPlants(ids, date = todayISO()) {
  const previous = state.plants;
  const chosen = new Set(ids);
  const saved = commit(state.plants.map((p) => (chosen.has(p.id) ? addWatering(p, date) : p)), { animate: true, highlight: ids });
  if (!saved) return showToast('השמירה נכשלה');
  requestPersistence();
  const name = previous.find((p) => p.id === ids[0])?.name;
  showToast(ids.length === 1 ? `נרשמה השקיה: ${name}` : `נרשמה השקיה ל-${ids.length} צמחים`, () => commit(previous, { animate: true }));
}

function snooze(id) {
  const previous = state.plants;
  const today = todayISO();
  if (!updatePlant(id, (p) => snoozePlant(p, today), { animate: true })) return showToast('השמירה נכשלה');
  const status = plantStatus(state.plants.find((p) => p.id === id), today);
  const when = status.kind === 'soon' ? 'למחר' : `ל${formatDate(status.nextDue, LONG_DATE)}`;
  showToast(`ההשקיה נדחתה ${when}`, () => commit(previous, { animate: true }));
}

function deletePlant(id) {
  const previous = state.plants;
  const plant = previous.find((p) => p.id === id);
  if (!commit(previous.filter((p) => p.id !== id), { animate: true })) return showToast('השמירה נכשלה');
  showToast(`הצמח „${plant.name}” נמחק`, () => commit(previous, { animate: true }));
}

// ---------- Rendering ----------

function render() {
  const today = todayISO();
  renderedDay = today;
  els.today.textContent = formatDate(today, LONG_DATE);
  els.storageWarning.hidden = canStore;

  const locations = locationsOf(state.plants);
  if (filter !== 'all' && !locations.some((l) => l.name === filter)) filter = 'all';
  const items = sortPlants(state.plants.filter((p) => filter === 'all' || p.location === filter), today);

  renderFilters(locations);
  renderSummary(items);
  renderList(items, today);
  els.empty.hidden = state.plants.length > 0;
  if (openPlantId && els.details.open) renderDetails();
  updateAppBadge(today);
}

function locationsOf(plants) {
  const counts = new Map();
  for (const p of plants) if (p.location) counts.set(p.location, (counts.get(p.location) ?? 0) + 1);
  return [...counts].map(([name, count]) => ({ name, count }));
}

function renderFilters(locations) {
  els.filters.hidden = locations.length < 2;
  if (els.filters.hidden) return;
  const chip = (value, label, count) => `
    <button type="button" class="chip" data-filter="${esc(value)}" aria-pressed="${filter === value}">
      ${esc(label)}<span class="chip-count">${count}</span>
    </button>`;
  els.filters.innerHTML = chip('all', 'הכול', state.plants.length) + locations.map((l) => chip(l.name, l.name, l.count)).join('');
}

function renderSummary(items) {
  els.summary.hidden = items.length === 0;
  if (!items.length) return;

  const due = items.filter((i) => isDue(i.status.kind));
  const unknown = items.filter((i) => i.status.kind === 'unknown');
  let tone = 'ok';
  let title;
  let text = '';
  let late = '';
  let bulk = null;

  if (due.length) {
    tone = 'due';
    const overdue = due.filter((i) => i.status.kind === 'overdue').length;
    title = due.length === 1 ? 'צמח אחד צריך מים היום' : `${due.length} צמחים צריכים מים היום`;
    text = namesList(due.map((i) => i.plant.name));
    if (due.length === 1 && overdue) late = dueLabel(due[0].status);
    else if (overdue) late = overdue === due.length ? 'כולם באיחור' : `${overdue} מהם באיחור`;
    if (due.length > 1) bulk = { ids: due.map((i) => i.plant.id), label: 'השקיתי את כולם' };
  } else if (unknown.length) {
    tone = 'start';
    title = 'מתי השקיתם לאחרונה?';
    text = `${unknown.length === 1 ? 'לצמח אחד' : `ל-${unknown.length} צמחים`} עוד אין תיעוד. „השקיתי” רושם את היום, ובלחיצה על צמח אפשר לבחור תאריך אחר.`;
    if (unknown.length > 1) bulk = { ids: unknown.map((i) => i.plant.id), label: 'השקיתי את כולם היום' };
  } else {
    const next = items[0];
    title = 'כל הצמחים מושקים';
    text = `ההשקיה הבאה ${next.status.kind === 'soon' ? 'מחר' : `בעוד ${daysWord(next.status.daysLeft)}`}: ${next.plant.name}`;
  }

  els.summary.className = `summary summary--${tone}`;
  els.summary.innerHTML = `
    <span class="summary-icon" aria-hidden="true">${icon(tone === 'ok' ? 'leaf' : 'drop')}</span>
    <div class="summary-text">
      <h2>${esc(title)}</h2>
      ${text ? `<p>${esc(text)}</p>` : ''}
      ${late ? `<p class="summary-late">${esc(late)}</p>` : ''}
    </div>
    ${bulk ? `<button type="button" class="btn btn-water" data-bulk="${esc(bulk.ids.join(' '))}">${icon('drop')}<span>${esc(bulk.label)}</span></button>` : ''}`;
}

function namesList(names) {
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} ועוד ${names.length - 3}`;
}

function renderList(items, today) {
  // Keep keyboard focus on the same plant after the list is redrawn.
  const active = document.activeElement;
  const focused = active?.matches?.(':focus-visible') && els.list.contains(active)
    ? { id: active.closest('[data-id]').dataset.id, action: active.dataset.action }
    : null;

  els.list.innerHTML = items.map((item) => cardHTML(item, today)).join('');

  if (focused) {
    const card = els.list.querySelector(`[data-id="${CSS.escape(focused.id)}"]`);
    (card?.querySelector(`[data-action="${focused.action}"]:not(:disabled)`) ?? card?.querySelector('.card-open'))?.focus();
  }
}

function cardHTML({ plant, status }, today) {
  const wateredToday = status.last === today;
  const last = status.last ? `הושקה ${agoText(status.sinceLast)}` : 'עוד לא נרשמה השקיה';
  // With a location filter on, every card is in the same place, so the location is left out.
  const sub = plant.location && filter === 'all' ? `${last} · ${plant.location}` : last;
  return `
    <li class="card" data-id="${esc(plant.id)}" data-status="${status.kind}" style="view-transition-name: card-${esc(plant.id)}">
      <button type="button" class="card-open" data-action="open">
        ${thumbHTML(plant)}
        <span class="card-body">
          <span class="card-title">${esc(plant.name)}</span>
          <span class="badge">${esc(dueLabel(status))}</span>
          <span class="card-sub">${esc(sub)}</span>
        </span>
      </button>
      <button type="button" class="water-btn" data-action="water" ${wateredToday ? 'disabled aria-label="כבר השקיתי היום"' : `aria-label="השקיתי: ${esc(plant.name)}"`}>
        ${icon(wateredToday ? 'check' : 'drop')}<span>${wateredToday ? 'היום' : 'השקיתי'}</span>
      </button>
      <span class="level" aria-hidden="true"><span style="width: ${Math.round(status.level * 100)}%"></span></span>
    </li>`;
}

function thumbHTML(plant) {
  return plant.photo
    ? `<span class="thumb"><img src="${esc(thumbOf(plant.photo))}" alt="" loading="lazy" decoding="async"></span>`
    : `<span class="thumb" aria-hidden="true">${esc(plant.emoji)}</span>`;
}

// ---------- Plant details ----------

function openDetails(id) {
  openPlantId = id;
  renderDetails();
  els.details.showModal();
  els.detailsBody.scrollTop = 0;
}

function closeDetails() {
  openPlantId = null;
  if (els.details.open) els.details.close();
}

function renderDetails() {
  const plant = state.plants.find((p) => p.id === openPlantId);
  if (!plant) return closeDetails();
  const today = todayISO();
  const status = plantStatus(plant, today);
  const wateredToday = status.last === today;
  const avg = averageInterval(plant.history);

  let when = 'עוד לא נרשמה השקיה. אפשר לסמן היום או לבחור תאריך.';
  if (status.kind === 'overdue') when = `היה צריך להשקות ב${formatDate(status.nextDue, LONG_DATE)}`;
  else if (status.kind === 'today') when = `ההשקיה האחרונה הייתה ${agoText(status.sinceLast)}`;
  else if (status.kind !== 'unknown') when = `ההשקיה הבאה: ${formatDate(status.nextDue, LONG_DATE)}`;
  if (plant.snoozedUntil && plant.snoozedUntil === status.nextDue) when += ' (אחרי דחייה)';

  els.detailsBody.innerHTML = `
    <div class="hero">
      ${plant.photo ? `<img src="${esc(plant.photo)}" alt="">` : `<span class="hero-emoji" aria-hidden="true">${esc(plant.emoji)}</span>`}
      <button type="button" class="sheet-close" data-action="close" aria-label="סגירה">${icon('x')}</button>
    </div>
    <div class="sheet-content">
      <h2 id="details-title">${esc(plant.name)}</h2>
      <p class="muted">${esc([plant.location, intervalText(plant.intervalDays)].filter(Boolean).join(' · '))}</p>
      <div class="status-box" data-status="${status.kind}">
        <strong>${esc(dueLabel(status))}</strong>
        <span>${esc(when)}</span>
      </div>
      <div class="detail-actions">
        <button type="button" class="btn btn-water btn-block" data-action="water" ${wateredToday ? 'disabled' : ''}>
          ${icon(wateredToday ? 'check' : 'drop')}<span>${wateredToday ? 'כבר השקיתי היום' : 'השקיתי היום'}</span>
        </button>
        <form class="date-form">
          <label for="other-date">השקיתי בתאריך אחר</label>
          <div class="date-row">
            <input class="input" type="date" id="other-date" name="date" required max="${today}" value="${addDays(today, -1)}">
            <button type="submit" class="btn btn-secondary">הוספה</button>
          </div>
        </form>
        ${status.kind === 'unknown' ? '' : `
        <button type="button" class="btn btn-secondary btn-block" data-action="snooze">
          ${icon('clock')}<span>האדמה עוד לחה? לדחות ביום</span>
        </button>`}
      </div>
      ${plant.notes ? `<p class="notes">${icon('info')}<span>${esc(plant.notes)}</span></p>` : ''}
      <h3>היסטוריית השקיה</h3>
      ${historyHTML(plant, today)}
      ${avg ? `<p class="muted small">לפי ההיסטוריה, בפועל השקיתם בממוצע ${esc(avgText(avg))}.</p>` : ''}
      <div class="detail-footer">
        <button type="button" class="btn btn-secondary" data-action="edit">${icon('pencil')}<span>עריכה</span></button>
        <button type="button" class="btn btn-danger" data-action="delete">${icon('trash')}<span>מחיקת הצמח</span></button>
      </div>
    </div>`;
}

function historyHTML(plant, today) {
  if (!plant.history.length) return '<p class="muted">עוד אין השקיות רשומות.</p>';
  const rows = plant.history.slice(0, HISTORY_SHOWN).map((date) => `
    <li>
      <span>${esc(formatDate(date, SHORT_DATE))}</span>
      <span class="muted">${esc(agoText(diffDays(date, today)))}</span>
      <button type="button" class="icon-btn" data-action="remove-date" data-date="${date}" aria-label="מחיקת ההשקיה מ${esc(formatDate(date, SHORT_DATE))}">${icon('x')}</button>
    </li>`).join('');
  const more = plant.history.length > HISTORY_SHOWN
    ? `<p class="muted small">ועוד ${plant.history.length - HISTORY_SHOWN} השקיות קודמות</p>`
    : '';
  return `<ul class="history">${rows}</ul>${more}`;
}

function avgText(avg) {
  const rounded = Math.round(avg * 10) / 10;
  return Number.isInteger(rounded) ? intervalText(rounded) : `כל ${rounded} ימים`;
}

// ---------- Add / edit form ----------

function openEdit(id = null) {
  const plant = id ? state.plants.find((p) => p.id === id) : null;
  editingId = plant?.id ?? null;
  draftPhoto = plant?.photo ?? null;

  $('#edit-title').textContent = plant ? 'עריכת צמח' : 'צמח חדש';
  $('#f-name').value = plant?.name ?? '';
  $('#f-location').value = plant?.location ?? (filter === 'all' ? '' : filter);
  $('#f-interval').value = plant?.intervalDays ?? 7;
  $('#f-notes').value = plant?.notes ?? '';
  $('#f-last').value = '';
  $('#f-last').max = todayISO();
  $('#last-field').hidden = Boolean(plant);
  $('#photo-error').hidden = true;
  $('#form-error').hidden = true;
  $('#location-list').innerHTML = [...new Set([...locationsOf(state.plants).map((l) => l.name), ...LOCATION_IDEAS])]
    .map((name) => `<option value="${esc(name)}"></option>`).join('');
  setEmoji(plant?.emoji ?? EMOJIS[0]);
  syncChips();
  renderPhotoPreview();

  closeDetails();
  els.edit.showModal();
  if (!plant && matchMedia('(pointer: fine)').matches) $('#f-name').focus();
}

function setEmoji(value) {
  const radios = [...els.form.querySelectorAll('input[name="emoji"]')];
  (radios.find((r) => r.value === value) ?? radios[0]).checked = true;
}

function currentEmoji() {
  return els.form.querySelector('input[name="emoji"]:checked')?.value ?? EMOJIS[0];
}

function renderPhotoPreview() {
  $('#photo-preview').innerHTML = draftPhoto
    ? `<img src="${esc(thumbOf(draftPhoto))}" alt="">`
    : `<span aria-hidden="true">${esc(currentEmoji())}</span>`;
  $('#photo-remove').hidden = !draftPhoto;
  $('#emoji-field').hidden = Boolean(draftPhoto);
}

function syncChips() {
  const interval = $('#f-interval').value;
  for (const chip of document.querySelectorAll('#interval-chips [data-days]')) {
    chip.setAttribute('aria-pressed', String(chip.dataset.days === interval));
  }
  const last = $('#f-last').value;
  for (const chip of document.querySelectorAll('#last-chips [data-ago]')) {
    chip.setAttribute('aria-pressed', String(last !== '' && addDays(todayISO(), -Number(chip.dataset.ago)) === last));
  }
}

/** Crops a photo to a square and shrinks it so it fits comfortably in browser storage. */
function resizePhoto(file, size = 480) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      canvas.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Unreadable image'));
    };
    img.src = url;
  });
}

function saveForm() {
  const nameInput = $('#f-name');
  nameInput.value = nameInput.value.trim();
  if (!els.form.reportValidity()) return;

  const fields = {
    name: nameInput.value,
    location: $('#f-location').value.trim(),
    intervalDays: Math.min(365, Math.max(1, Math.round(Number($('#f-interval').value)) || 7)),
    notes: $('#f-notes').value.trim(),
    emoji: currentEmoji(),
    photo: draftPhoto,
  };

  let message;
  if (editingId) {
    if (!updatePlant(editingId, (p) => ({ ...p, ...fields }))) return showFormError();
    message = 'השינויים נשמרו';
  } else {
    let plant = { id: newId(), ...fields, history: [], snoozedUntil: null };
    const last = $('#f-last').value;
    if (isISODate(last) && last <= todayISO()) plant = addWatering(plant, last);
    if (filter !== 'all' && plant.location !== filter) {
      filter = 'all';
      writePref('filter', filter);
    }
    if (!commit([...state.plants, plant], { animate: true, highlight: [plant.id] })) return showFormError();
    message = `הצמח „${plant.name}” נוסף`;
  }
  els.edit.close();
  showToast(message);
}

function showFormError() {
  $('#form-error').hidden = false;
}

// ---------- Toast ----------

let toastTimer = null;
let undoAction = null;

function showToast(message, undo = null) {
  clearTimeout(toastTimer);
  undoAction = undo;
  els.toastText.textContent = message;
  els.toastUndo.hidden = !undo;
  els.toast.hidden = false;
  requestAnimationFrame(() => els.toast.classList.add('show'));
  toastTimer = setTimeout(hideToast, undo ? 7000 : 3500);
}

function hideToast() {
  clearTimeout(toastTimer);
  undoAction = null;
  els.toast.classList.remove('show');
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, 250);
}

// ---------- Backup ----------

function exportBackup() {
  const data = JSON.stringify({ app: 'plant-tracker', exportedAt: new Date().toISOString(), ...state }, null, 2);
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: `plants-backup-${todayISO()}.json` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  showToast('קובץ הגיבוי נשמר בהורדות');
}

async function importBackup(file) {
  let next;
  try {
    next = normalizeState(JSON.parse(await file.text()));
  } catch {
    return showToast('הקובץ הזה לא נראה כמו גיבוי של האתר');
  }
  const count = (n) => (n === 1 ? 'צמח אחד' : `${n} צמחים`);
  if (!confirm(`לטעון מהגיבוי ${count(next.plants.length)}? הרשימה הנוכחית (${count(state.plants.length)}) תוחלף.`)) return;
  const previous = state.plants;
  if (!commit(next.plants)) return showToast('הטעינה נכשלה: אין מספיק מקום בדפדפן');
  showToast('הגיבוי נטען', () => commit(previous));
}

// ---------- App icon badge (installed app on supported devices) ----------

function updateAppBadge(today) {
  if (!('setAppBadge' in navigator)) return;
  const due = state.plants.filter((p) => isDue(plantStatus(p, today).kind)).length;
  try {
    (due ? navigator.setAppBadge(due) : navigator.clearAppBadge()).catch(() => {});
  } catch {
    // Not available here.
  }
}

// ---------- Events ----------

$('#add-btn').addEventListener('click', () => openEdit());

els.list.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const id = button.closest('[data-id]').dataset.id;
  if (button.dataset.action === 'water') waterPlants([id]);
  else if (button.dataset.action === 'open') openDetails(id);
});

els.summary.addEventListener('click', (event) => {
  const button = event.target.closest('[data-bulk]');
  if (button) waterPlants(button.dataset.bulk.split(' '));
});

els.filters.addEventListener('click', (event) => {
  const chip = event.target.closest('[data-filter]');
  if (!chip || chip.dataset.filter === filter) return;
  filter = chip.dataset.filter;
  writePref('filter', filter);
  if (document.startViewTransition && !reducedMotion()) document.startViewTransition(render);
  else render();
});

els.empty.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (button?.dataset.action === 'add') openEdit();
  if (button?.dataset.action === 'restore-seed') commit(createSeedState().plants);
});

els.details.addEventListener('click', (event) => {
  if (event.target === els.details) return closeDetails(); // click on the dimmed backdrop
  const button = event.target.closest('button[data-action]');
  const id = openPlantId;
  if (!button || !id) return;
  switch (button.dataset.action) {
    case 'close': closeDetails(); break;
    case 'water': closeDetails(); waterPlants([id]); break;
    case 'snooze': closeDetails(); snooze(id); break;
    case 'edit': openEdit(id); break;
    case 'delete': closeDetails(); deletePlant(id); break;
    case 'remove-date': updatePlant(id, (p) => removeWatering(p, button.dataset.date)); break;
  }
});

els.details.addEventListener('submit', (event) => {
  event.preventDefault();
  const date = event.target.elements.date.value;
  if (isISODate(date) && date <= todayISO()) updatePlant(openPlantId, (p) => addWatering(p, date));
});

els.details.addEventListener('close', () => { openPlantId = null; });

$('#emoji-options').innerHTML = EMOJIS.map((emoji) => `
  <label class="emoji-option">
    <input type="radio" name="emoji" value="${emoji}"><span>${emoji}</span>
  </label>`).join('');

els.edit.addEventListener('click', (event) => {
  if (event.target.closest('[data-close]')) els.edit.close();
});

els.form.addEventListener('submit', (event) => {
  event.preventDefault();
  saveForm();
});

els.form.addEventListener('change', (event) => {
  if (event.target.name === 'emoji') renderPhotoPreview();
  if (event.target.id === 'f-last') syncChips();
});

$('#f-interval').addEventListener('input', syncChips);

$('#interval-chips').addEventListener('click', (event) => {
  const chip = event.target.closest('[data-days]');
  if (!chip) return;
  $('#f-interval').value = chip.dataset.days;
  syncChips();
});

$('#last-chips').addEventListener('click', (event) => {
  const chip = event.target.closest('[data-ago]');
  if (!chip) return;
  $('#f-last').value = addDays(todayISO(), -Number(chip.dataset.ago));
  syncChips();
});

$('#photo-pick').addEventListener('click', () => $('#photo-input').click());

$('#photo-input').addEventListener('change', async (event) => {
  const [file] = event.target.files;
  event.target.value = '';
  if (!file) return;
  $('#photo-error').hidden = true;
  try {
    draftPhoto = await resizePhoto(file);
  } catch {
    $('#photo-error').hidden = false;
  }
  renderPhotoPreview();
});

$('#photo-remove').addEventListener('click', () => {
  draftPhoto = null;
  renderPhotoPreview();
});

els.toastUndo.addEventListener('click', () => {
  const undo = undoAction;
  hideToast();
  undo?.();
});

$('#export-btn').addEventListener('click', exportBackup);
$('#import-btn').addEventListener('click', () => els.importInput.click());
els.importInput.addEventListener('change', () => {
  const [file] = els.importInput.files;
  els.importInput.value = '';
  if (file) importBackup(file);
});

// Redraw when the date changes (e.g. the page stayed open overnight) or another tab saved changes.
setInterval(() => {
  if (todayISO() !== renderedDay) render();
}, 60 * 1000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && todayISO() !== renderedDay) render();
});
window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY) return;
  state = loadState() ?? state;
  render();
});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

render();
