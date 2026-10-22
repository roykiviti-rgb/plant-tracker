// What the morning reminder says, using the same watering rules as the website.
import { normalizeState, sortPlants } from '../public/js/logic.js';

/** The calendar date in a time zone, e.g. "2026-10-23". */
export function todayIn(timeZone, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** The notification for plants due today or late, or null when none are. */
export function dueReminder(plants, today) {
  const due = sortPlants(normalizeState({ plants }).plants, today)
    .filter(({ status }) => status.kind === 'overdue' || status.kind === 'today')
    .map(({ plant }) => plant.name);
  if (!due.length) return null;
  return {
    title: due.length === 1 ? 'צמח אחד צריך מים היום 💧' : `${due.length} צמחים צריכים מים היום 💧`,
    body: due.length <= 4 ? due.join(', ') : `${due.slice(0, 4).join(', ')} ועוד ${due.length - 4}`,
    tag: 'watering',
  };
}

export const TEST_MESSAGE = {
  title: 'התזכורות פועלות 🔔',
  body: 'כך תיראה ההתראה בבוקר כשיש צמחים להשקות.',
  tag: 'test',
};

/** Push services want a contact URL for the sender; the site's own address will do. */
export function pushSubject(req) {
  return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL || req.headers.host}`;
}

/** The stored subscriber document in the shape the push sender expects. */
export function toSubscription(subscriber) {
  return { endpoint: subscriber.endpoint, keys: { p256dh: subscriber.p256dh, auth: subscriber.auth } };
}
