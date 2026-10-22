// Creates the key pair for push notifications and saves it to .env.local (which git ignores).
// The public key goes in public/js/config.js; the private key goes in Vercel as VAPID_PRIVATE_KEY.
// Usage: node scripts/generate-vapid-keys.js [--force]
import { createECDH } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const file = fileURLToPath(new URL('../.env.local', import.meta.url));
if (existsSync(file) && !process.argv.includes('--force')) {
  console.error('.env.local already exists. Run with --force to replace the keys (existing phone subscriptions will stop working).');
  process.exit(1);
}

const ecdh = createECDH('prime256v1');
ecdh.generateKeys();
const publicKey = ecdh.getPublicKey().toString('base64url');
const privateKey = ecdh.getPrivateKey().toString('base64url');

writeFileSync(file, `VAPID_PUBLIC_KEY=${publicKey}\nVAPID_PRIVATE_KEY=${privateKey}\n`);
console.log(`Saved .env.local\nPublic key (for public/js/config.js):\n${publicKey}`);
