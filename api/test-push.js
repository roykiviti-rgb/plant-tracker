// Sends a test notification to one phone, so the "send a test" button can prove the whole path works.
import { GARDEN, deleteDocument, firestoreConfigured, getDocument, updateFields } from '../lib/firestore.js';
import { TEST_MESSAGE, pushSubject, toSubscription } from '../lib/reminders.js';
import { sendNotification, vapidKeys } from '../lib/webpush.js';

const COOLDOWN_MS = 30 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  if (!process.env.VAPID_PRIVATE_KEY || !firestoreConfigured()) {
    return res.status(503).json({ error: 'Reminders are not configured' });
  }

  const id = String(req.body?.id ?? '');
  if (!/^[a-f0-9]{64}$/.test(id)) return res.status(400).json({ error: 'Bad subscriber id' });
  const path = `${GARDEN}/subscribers/${id}`;
  const subscriber = await getDocument(path);
  if (!subscriber) return res.status(404).json({ error: 'Not subscribed' });
  if (subscriber.lastTest && Date.now() - Date.parse(subscriber.lastTest) < COOLDOWN_MS) {
    return res.status(429).json({ error: 'Too soon' });
  }

  await updateFields(path, { lastTest: new Date().toISOString() });
  const options = { keys: vapidKeys(process.env.VAPID_PRIVATE_KEY), subject: pushSubject(req) };
  const status = await sendNotification(toSubscription(subscriber), TEST_MESSAGE, options);
  if (status === 404 || status === 410) {
    await deleteDocument(path);
    return res.status(410).json({ error: 'Subscription expired' });
  }
  return res.status(status >= 200 && status < 300 ? 200 : 502).json({ pushStatus: status });
}
