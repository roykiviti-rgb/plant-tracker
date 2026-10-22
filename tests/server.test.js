import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createDecipheriv, createECDH, createPublicKey, hkdfSync, randomBytes, verify } from 'node:crypto';
import { encryptPayload, vapidAuthorization, vapidKeys } from '../lib/webpush.js';
import { dueReminder, todayIn } from '../lib/reminders.js';
import { addDays } from '../public/js/logic.js';
import remind from '../api/remind.js';
import testPush from '../api/test-push.js';

// ---------- Web Push crypto ----------

test('payload encryption matches the RFC 8291 example', () => {
  const body = encryptPayload(
    Buffer.from('V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24', 'base64url'),
    {
      p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
      auth: 'BTBZMqHH6r4Tts7J_aSIgg',
    },
    {
      privateKey: Buffer.from('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', 'base64url'),
      salt: Buffer.from('DGv6ra1nlYgDCS1FRnbzlw', 'base64url'),
    },
  );
  assert.equal(
    body.toString('base64url'),
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
  );
});

test('the VAPID token is signed by the key the browser subscribed with', () => {
  const keys = vapidKeys(newPrivateKey());
  const header = vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', keys, 'https://plants.example', Date.UTC(2026, 9, 22));
  const { token, publicKey } = parseVapid(header);
  assert.equal(publicKey, keys.publicKey);
  const [head, claims, signature] = token.split('.');
  assert.ok(verify('sha256', Buffer.from(`${head}.${claims}`), { key: publicKeyObject(publicKey), dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')));
  assert.deepEqual(JSON.parse(Buffer.from(claims, 'base64url')), {
    aud: 'https://fcm.googleapis.com',
    exp: Date.UTC(2026, 9, 22) / 1000 + 12 * 60 * 60,
    sub: 'https://plants.example',
  });
});

// ---------- Reminder wording ----------

test('dueReminder lists the thirsty plants, most urgent first', () => {
  const today = '2026-10-22';
  const plants = [
    { id: 'a', name: 'פוטוס', intervalDays: 7, history: ['2026-10-20'] },
    { id: 'b', name: 'נענע', intervalDays: 2, history: ['2026-10-20'] },
    { id: 'c', name: 'פטרוזיליה', intervalDays: 2, history: ['2026-10-17'] },
    { id: 'd', name: 'בלי תיעוד', intervalDays: 2, history: [] },
  ];
  assert.deepEqual(dueReminder(plants, today), { title: '2 צמחים צריכים מים היום 💧', body: 'פטרוזיליה, נענע', tag: 'watering' });
  assert.equal(dueReminder(plants.slice(0, 1), today), null);
  const many = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `צמח ${i + 1}`, intervalDays: 1, history: ['2026-10-01'] }));
  assert.equal(dueReminder(many, today).body, 'צמח 1, צמח 2, צמח 3, צמח 4 ועוד 2');
});

test('todayIn uses the garden time zone', () => {
  assert.equal(todayIn('Asia/Jerusalem', new Date('2026-10-22T22:30:00Z')), '2026-10-23');
  assert.equal(todayIn('UTC', new Date('2026-10-22T22:30:00Z')), '2026-10-22');
});

// ---------- API handlers against a fake Firestore and push service ----------

const docs = new Map(); // "gardens/main/plants/x" -> plain fields
const pushes = [];
const phone = createECDH('prime256v1');
phone.generateKeys();
const phoneAuth = randomBytes(16);
const realFetch = globalThis.fetch;
const TODAY = todayIn('Asia/Jerusalem');
const SUBSCRIBER_ID = 'a'.repeat(64);

beforeEach(() => {
  docs.clear();
  pushes.length = 0;
  Object.assign(process.env, { FIREBASE_PROJECT_ID: 'demo', FIREBASE_API_KEY: 'test-key', VAPID_PRIVATE_KEY: newPrivateKey(), TIME_ZONE: 'Asia/Jerusalem' });
  delete process.env.CRON_SECRET;
  docs.set('gardens/main', { initialized: true });
  docs.set('gardens/main/plants/mint', { name: 'נענע', intervalDays: 2, history: [addDays(TODAY, -3)], order: 0 });
  docs.set('gardens/main/plants/zz', { name: 'זמיוקולקס', intervalDays: 14, history: [addDays(TODAY, -1)], order: 1 });
  docs.set(`gardens/main/subscribers/${SUBSCRIBER_ID}`, {
    endpoint: 'https://push.example.test/phone',
    p256dh: phone.getPublicKey().toString('base64url'),
    auth: phoneAuth.toString('base64url'),
    timeZone: 'Asia/Jerusalem',
  });
  globalThis.fetch = fakeFetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

test('the morning job notifies subscribers once a day', async () => {
  const first = await call(remind, { method: 'GET' });
  assert.equal(first.statusCode, 200);
  assert.deepEqual(first.body, { title: 'צמח אחד צריך מים היום 💧', subscribers: 1, sent: 1, removed: 0 });

  assert.equal(pushes.length, 1);
  const [push] = pushes;
  assert.equal(push.headers['Content-Encoding'], 'aes128gcm');
  const { token, publicKey } = parseVapid(push.headers.Authorization);
  assert.equal(JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).aud, 'https://push.example.test');
  assert.equal(publicKey, vapidKeys(process.env.VAPID_PRIVATE_KEY).publicKey);
  assert.deepEqual(JSON.parse(decrypt(push.body)), { title: 'צמח אחד צריך מים היום 💧', body: 'נענע', tag: 'watering' });
  assert.equal(docs.get('gardens/main').lastReminder, TODAY);

  const second = await call(remind, { method: 'GET' });
  assert.deepEqual(second.body, { skipped: 'Already sent today' });
  assert.equal(pushes.length, 1);
});

test('the morning job stays quiet when nothing needs water', async () => {
  docs.set('gardens/main/plants/mint', { name: 'נענע', intervalDays: 2, history: [TODAY], order: 0 });
  const result = await call(remind, { method: 'GET' });
  assert.deepEqual(result.body, { due: 0 });
  assert.equal(pushes.length, 0);
});

test('expired phones are removed and CRON_SECRET is enforced', async () => {
  docs.get(`gardens/main/subscribers/${SUBSCRIBER_ID}`).endpoint = 'https://push.example.test/gone';
  process.env.CRON_SECRET = 'secret';
  assert.equal((await call(remind, { method: 'GET' })).statusCode, 401);

  const result = await call(remind, { method: 'GET', headers: { authorization: 'Bearer secret' } });
  assert.equal(result.body.removed, 1);
  assert.equal(docs.has(`gardens/main/subscribers/${SUBSCRIBER_ID}`), false);
});

test('test-push checks its input and sends one encrypted test message', async () => {
  assert.equal((await call(testPush, { method: 'GET' })).statusCode, 405);
  assert.equal((await call(testPush, { method: 'POST', body: { id: 'nope' } })).statusCode, 400);
  assert.equal((await call(testPush, { method: 'POST', body: { id: 'b'.repeat(64) } })).statusCode, 404);

  const ok = await call(testPush, { method: 'POST', body: { id: SUBSCRIBER_ID } });
  assert.equal(ok.statusCode, 200);
  assert.equal(JSON.parse(decrypt(pushes[0].body)).tag, 'test');
  assert.equal((await call(testPush, { method: 'POST', body: { id: SUBSCRIBER_ID } })).statusCode, 429);
});

test('handlers answer 503 until the push key is configured', async () => {
  delete process.env.VAPID_PRIVATE_KEY;
  assert.equal((await call(remind, { method: 'GET' })).statusCode, 503);
  assert.equal((await call(testPush, { method: 'POST', body: { id: SUBSCRIBER_ID } })).statusCode, 503);
});

// ---------- Helpers ----------

function newPrivateKey() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return ecdh.getPrivateKey().toString('base64url');
}

function parseVapid(header) {
  const [, token, publicKey] = header.match(/^vapid t=([^,]+), k=(.+)$/);
  return { token, publicKey };
}

function publicKeyObject(publicKey) {
  const raw = Buffer.from(publicKey, 'base64url');
  return createPublicKey({
    format: 'jwk',
    key: { kty: 'EC', crv: 'P-256', x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33).toString('base64url') },
  });
}

/** What the phone's browser does with an incoming message (RFC 8291, receiver side). */
function decrypt(body) {
  const salt = body.subarray(0, 16);
  const senderPublic = body.subarray(21, 21 + body.readUInt8(20));
  const ciphertext = body.subarray(21 + senderPublic.length);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), phone.getPublicKey(), senderPublic]);
  const ikm = hkdfSync('sha256', phone.computeSecret(senderPublic), phoneAuth, keyInfo, 32);
  const key = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const decipher = createDecipheriv('aes-128-gcm', key, nonce);
  decipher.setAuthTag(ciphertext.subarray(-16));
  const padded = Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]);
  assert.equal(padded.at(-1), 2);
  return padded.subarray(0, -1).toString();
}

async function call(handler, { method, headers = {}, body }) {
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  await handler({ method, headers: { host: 'plants.example', ...headers }, body, query: {} }, res);
  return res;
}

async function fakeFetch(input, init = {}) {
  const url = new URL(input);
  const method = init.method ?? 'GET';
  if (url.hostname === 'push.example.test') {
    pushes.push({ headers: init.headers, body: init.body });
    return new Response(null, { status: url.pathname === '/gone' ? 410 : 201 });
  }
  assert.equal(url.hostname, 'firestore.googleapis.com');
  assert.equal(url.searchParams.get('key'), 'test-key');
  const path = decodeURIComponent(url.pathname.split('/documents/')[1]);
  const name = (p) => `projects/demo/databases/(default)/documents/${p}`;

  if (method === 'GET' && docs.has(path)) return Response.json({ name: name(path), fields: encodeFields(docs.get(path)) });
  if (method === 'GET' && path.split('/').length % 2 === 1) {
    const documents = [...docs].filter(([p]) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/'))
      .map(([p, fields]) => ({ name: name(p), fields: encodeFields(fields) }));
    return Response.json(documents.length ? { documents } : {});
  }
  if (method === 'PATCH') {
    const update = JSON.parse(init.body).fields;
    const fields = Object.fromEntries(Object.entries(update).map(([k, v]) => [k, v.stringValue]));
    docs.set(path, { ...docs.get(path), ...fields });
    return Response.json({ name: name(path) });
  }
  if (method === 'DELETE') {
    docs.delete(path);
    return Response.json({});
  }
  return new Response('{"error":"not found"}', { status: 404 });
}

function encodeFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, encodeValue(v)]));
}

function encodeValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return { integerValue: String(value) };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  return { mapValue: { fields: encodeFields(value) } };
}
