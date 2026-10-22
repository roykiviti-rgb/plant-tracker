// Sends a test notification to one phone, so the "send a test" button can prove the whole path works.
// A GET request only reports whether the server is set up to send (handy after changing settings in Vercel).
import { GARDEN, deleteDocument, firestoreConfigured, getDocument, updateFields } from '../lib/firestore.js';
import { TEST_MESSAGE, pushKeys, pushSubject, toSubscription } from '../lib/reminders.js';
import { sendNotification } from '../lib/webpush.js';

const COOLDOWN_MS = 30 * 1000;

export default async function handler(req, res) {
  const { keys, problem } = pushKeys();
  const setupProblem = problem ?? (firestoreConfigured() ? null : 'Firebase is not configured');
  if (req.method === 'GET') return res.status(200).json({ ready: !setupProblem, problem: setupProblem ?? undefined });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  if (setupProblem) return res.status(503).json({ error: setupProblem });

  const id = String(req.body?.id ?? '');
  if (!/^[a-f0-9]{64}$/.test(id)) return res.status(400).json({ error: 'Bad subscriber id' });
  const path = `${GARDEN}/subscribers/${id}`;
  const subscriber = await getDocument(path);
  if (!subscriber) return res.status(404).json({ error: 'Not subscribed' });
  if (subscriber.lastTest && Date.now() - Date.parse(subscriber.lastTest) < COOLDOWN_MS) {
    return res.status(429).json({ error: 'Too soon' });
  }

  await updateFields(path, { lastTest: new Date().toISOString() });
  const status = await sendNotification(toSubscription(subscriber), TEST_MESSAGE, { keys, subject: pushSubject(req) });
  if (status === 404 || status === 410) {
    await deleteDocument(path);
    return res.status(410).json({ error: 'Subscription expired' });
  }
  return res.status(status >= 200 && status < 300 ? 200 : 502).json({ pushStatus: status });
}
