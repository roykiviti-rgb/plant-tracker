// Runs every morning (see "crons" in vercel.json): notifies every subscribed phone when plants need water.
import { GARDEN, deleteDocument, firestoreConfigured, getDocument, listDocuments, updateFields } from '../lib/firestore.js';
import { dueReminder, pushKeys, pushSubject, toSubscription, todayIn } from '../lib/reminders.js';
import { sendNotification } from '../lib/webpush.js';

export default async function handler(req, res) {
  // Vercel sends this header on scheduled runs when a CRON_SECRET environment variable is set.
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { keys, problem } = pushKeys();
  if (problem || !firestoreConfigured()) {
    return res.status(503).json({ error: problem ?? 'Firebase is not configured' });
  }

  const today = todayIn(process.env.TIME_ZONE || 'Asia/Jerusalem');
  const garden = await getDocument(GARDEN);
  if (garden?.lastReminder === today) return res.status(200).json({ skipped: 'Already sent today' });

  const message = dueReminder(await listDocuments(`${GARDEN}/plants`), today);
  if (!message) return res.status(200).json({ due: 0 });

  const subscribers = await listDocuments(`${GARDEN}/subscribers`);
  const options = { keys, subject: pushSubject(req) };
  let sent = 0;
  let removed = 0;
  for (const subscriber of subscribers) {
    const status = await sendNotification(toSubscription(subscriber), message, options).catch(() => 0);
    if (status === 404 || status === 410) {
      await deleteDocument(`${GARDEN}/subscribers/${subscriber.id}`);
      removed += 1;
    } else if (status >= 200 && status < 300) {
      sent += 1;
    }
  }
  await updateFields(GARDEN, { lastReminder: today });
  return res.status(200).json({ title: message.title, subscribers: subscribers.length, sent, removed });
}
