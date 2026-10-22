// Firebase project settings. They are not secret: they only name the project, and
// firestore.rules decides what anyone may read or write. With null, data stays in this browser only.
export const firebaseConfig = {
  apiKey: 'AIzaSyC-C_DjO1nZa6HYI6FAn4AnEh2pUF2UTLA',
  authDomain: 'plant-tracker-92231.firebaseapp.com',
  projectId: 'plant-tracker-92231',
  storageBucket: 'plant-tracker-92231.firebasestorage.app',
  messagingSenderId: '215032563019',
  appId: '1:215032563019:web:2f790de5d855ff0c6954ce',
  measurementId: 'G-RGDM4RMKBB',
};

// Public half of the push-notification key pair (made by scripts/generate-vapid-keys.js).
// The private half lives only in Vercel, as the VAPID_PRIVATE_KEY environment variable.
export const VAPID_PUBLIC_KEY = 'BGUyEh90gCFhew6CMTUkiD9C8PBJuJYrwlGs61JDjknISSdrYZLyZolQyU3cFHuyzcbY0t2UPuUCTJMayK0xp9E';
