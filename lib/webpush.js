// Minimal Web Push sender using only Node's crypto:
// VAPID sign-in for the push service (RFC 8292) and end-to-end encrypted payloads (RFC 8291, aes128gcm).
import { createCipheriv, createECDH, createPrivateKey, hkdfSync, randomBytes, sign } from 'node:crypto';

const b64url = (data) => Buffer.from(data).toString('base64url');
const fromB64url = (text) => Buffer.from(text, 'base64url');

/** Both halves of the VAPID key pair, derived from the private key (base64url). */
export function vapidKeys(privateKey) {
  const d = Buffer.alloc(32);
  const raw = fromB64url(privateKey);
  raw.copy(d, 32 - raw.length);
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(d);
  const publicKey = ecdh.getPublicKey();
  const key = createPrivateKey({
    format: 'jwk',
    key: { kty: 'EC', crv: 'P-256', d: b64url(d), x: b64url(publicKey.subarray(1, 33)), y: b64url(publicKey.subarray(33)) },
  });
  return { publicKey: b64url(publicKey), key };
}

/** The Authorization header that proves to the push service that the message comes from us. */
export function vapidAuthorization(endpoint, keys, subject, now = Date.now()) {
  const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64url(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(now / 1000) + 12 * 60 * 60,
    sub: subject,
  }));
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), { key: keys.key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${header}.${claims}.${b64url(signature)}, k=${keys.publicKey}`;
}

/**
 * Encrypts a payload so only the subscribed browser can read it.
 * `local` fixes the sender key and salt, which are random in real use (the tests pass the RFC 8291 example values).
 */
export function encryptPayload(payload, subscriptionKeys, local = {}) {
  const receiverPublic = fromB64url(subscriptionKeys.p256dh);
  const authSecret = fromB64url(subscriptionKeys.auth);
  const ecdh = createECDH('prime256v1');
  if (local.privateKey) ecdh.setPrivateKey(local.privateKey);
  else ecdh.generateKeys();
  const senderPublic = ecdh.getPublicKey();
  const salt = local.salt ?? randomBytes(16);

  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), receiverPublic, senderPublic]);
  const ikm = Buffer.from(hkdfSync('sha256', ecdh.computeSecret(receiverPublic), authSecret, keyInfo, 32));
  const contentKey = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));

  const cipher = createCipheriv('aes-128-gcm', contentKey, nonce);
  const plaintext = Buffer.concat([Buffer.from(payload), Buffer.from([2])]); // 2 = last (and only) record
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);

  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16); // record size
  header.writeUInt8(senderPublic.length, 20);
  return Buffer.concat([header, senderPublic, ciphertext]);
}

/** Sends one notification. Resolves to the push service's status: 201 = accepted, 404/410 = subscription is gone. */
export async function sendNotification(subscription, message, { keys, subject, ttl = 12 * 60 * 60 }) {
  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: vapidAuthorization(subscription.endpoint, keys, subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttl),
      Urgency: 'normal',
    },
    body: encryptPayload(JSON.stringify(message), subscription.keys),
  });
  return response.status;
}
