// The daily reminder on this device: a push subscription saved in the shared garden.
// Every morning the server (api/remind.js) checks the plants and notifies each subscribed device.
import { VAPID_PUBLIC_KEY } from './config.js';
import { removeSubscriber, saveSubscriber } from './cloud.js';

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

/** 'supported' | 'install-first' (iPhone, outside the home-screen app) | 'unsupported' */
export function pushSupport() {
  if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) return 'supported';
  return isIOS() && !isInstalled() ? 'install-first' : 'unsupported';
}

export async function currentSubscription() {
  const registration = await withTimeout(navigator.serviceWorker.ready);
  const subscription = await registration.pushManager.getSubscription();
  return subscription && usesOurKey(subscription) ? subscription : null;
}

/** Call this straight from a tap: browsers only ask for notification permission in response to one. */
export async function enableReminders() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error(permission === 'denied' ? 'denied' : 'dismissed');
  const registration = await withTimeout(navigator.serviceWorker.ready);
  let subscription = await registration.pushManager.getSubscription();
  if (subscription && !usesOurKey(subscription)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: fromBase64Url(VAPID_PUBLIC_KEY),
  });
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jerusalem';
  await withTimeout(saveSubscriber(await subscriberId(subscription), subscription, timeZone));
  return subscription;
}

export async function disableReminders(subscription) {
  // If this fails (e.g. offline), the server drops the record itself once the push service reports it gone.
  await withTimeout(removeSubscriber(await subscriberId(subscription))).catch(() => {});
  await subscription.unsubscribe();
}

/** Asks the server for a test notification. Resolves to the HTTP status. */
export async function sendTestReminder(subscription) {
  const response = await fetch('/api/test-push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: await subscriberId(subscription) }),
  });
  return response.status;
}

async function subscriberId(subscription) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(subscription.endpoint));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function usesOurKey(subscription) {
  const key = subscription.options?.applicationServerKey;
  if (!key) return true;
  const ours = fromBase64Url(VAPID_PUBLIC_KEY);
  const theirs = new Uint8Array(key);
  return theirs.length === ours.length && theirs.every((byte, i) => byte === ours[i]);
}

function fromBase64Url(text) {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function withTimeout(promise, ms = 15000) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
}
