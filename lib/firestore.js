// Reads and writes the shared garden through Firestore's REST API.
// Requests carry only the public web API key, so the same rules as the website apply (see firestore.rules).
import { firebaseConfig } from '../public/js/config.js';

export const GARDEN = 'gardens/main';

function project() {
  const projectId = process.env.FIREBASE_PROJECT_ID ?? firebaseConfig?.projectId;
  const apiKey = process.env.FIREBASE_API_KEY ?? firebaseConfig?.apiKey;
  return projectId && apiKey ? { projectId, apiKey } : null;
}

export const firestoreConfigured = () => Boolean(project());

function url(path, query = '') {
  const { projectId, apiKey } = project();
  const params = `${query}${query ? '&' : ''}key=${encodeURIComponent(apiKey)}`;
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}?${params}`;
}

async function check(response, what) {
  if (!response.ok) throw new Error(`Firestore ${what}: ${response.status} ${await response.text()}`);
  return response;
}

export async function getDocument(path) {
  const response = await fetch(url(path));
  if (response.status === 404) return null;
  return toObject(await (await check(response, `get ${path}`)).json());
}

export async function listDocuments(path) {
  const documents = [];
  let pageToken = '';
  do {
    const query = `pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const page = await (await check(await fetch(url(path, query)), `list ${path}`)).json();
    documents.push(...(page.documents ?? []).map(toObject));
    pageToken = page.nextPageToken ?? '';
  } while (pageToken);
  return documents;
}

/** Sets the given string fields, leaving the rest of the document as it is. */
export async function updateFields(path, fields) {
  const mask = Object.keys(fields).map((name) => `updateMask.fieldPaths=${encodeURIComponent(name)}`).join('&');
  const body = { fields: Object.fromEntries(Object.entries(fields).map(([name, value]) => [name, { stringValue: value }])) };
  await check(await fetch(url(path, mask), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }), `update ${path}`);
}

export async function deleteDocument(path) {
  const response = await fetch(url(path), { method: 'DELETE' });
  if (response.status !== 404) await check(response, `delete ${path}`);
}

function toObject(document) {
  return { ...decodeFields(document.fields ?? {}), id: document.name.split('/').pop() };
}

function decodeFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([name, value]) => [name, decodeValue(value)]));
}

export function decodeValue(value) {
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(decodeValue);
  if ('mapValue' in value) return decodeFields(value.mapValue.fields ?? {});
  return null;
}
