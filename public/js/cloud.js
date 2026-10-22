// Shared storage in Firebase Firestore: everyone who opens the site sees and edits the same garden.
// Firestore keeps a copy on the device, so the app keeps working offline and catches up when back online.
const SDK = 'https://www.gstatic.com/firebasejs/12.19.0';

let fs = null;
let db = null;

export async function connect(config) {
  const [{ initializeApp }, firestore] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-firestore.js`),
  ]);
  fs = firestore;
  const app = initializeApp(config);
  try {
    db = fs.initializeFirestore(app, {
      localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
    });
  } catch {
    db = fs.getFirestore(app); // no device storage available (e.g. private browsing): memory only
  }
}

const gardenRef = () => fs.doc(db, 'gardens', 'main');
const plantRef = (id) => fs.doc(db, 'gardens', 'main', 'plants', id);
const subscriberRef = (id) => fs.doc(db, 'gardens', 'main', 'subscribers', id);

/** Calls onPlants with every change, from this device or anyone else's. */
export function watchPlants(onPlants, onError) {
  return fs.onSnapshot(
    fs.collection(db, 'gardens', 'main', 'plants'),
    { includeMetadataChanges: true },
    (snapshot) => onPlants(
      snapshot.docs.map((d) => ({ ...d.data(), id: d.id })),
      { fromCache: snapshot.metadata.fromCache, pending: snapshot.metadata.hasPendingWrites },
    ),
    onError,
  );
}

export function savePlants(upserts, deletes = []) {
  const batch = fs.writeBatch(db);
  for (const plant of upserts) batch.set(plantRef(plant.id), toDocument(plant));
  for (const id of deletes) batch.delete(plantRef(id));
  return batch.commit();
}

/** Fills a brand-new garden with the given plants. Returns false if the garden was set up before. */
export async function setUpGarden(plants) {
  const garden = await fs.getDocFromServer(gardenRef());
  if (garden.data()?.initialized) return false;
  const batch = fs.writeBatch(db);
  for (const plant of plants) batch.set(plantRef(plant.id), toDocument(plant));
  batch.set(gardenRef(), { initialized: true }, { merge: true });
  await batch.commit();
  return true;
}

function toDocument({ id, ...plant }) {
  return { ...plant, updatedAt: fs.serverTimestamp() };
}

export function saveSubscriber(id, subscription, timeZone) {
  const { endpoint, keys } = subscription.toJSON();
  return fs.setDoc(subscriberRef(id), {
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    timeZone,
    createdAt: fs.serverTimestamp(),
  });
}

export function removeSubscriber(id) {
  return fs.deleteDoc(subscriberRef(id));
}
