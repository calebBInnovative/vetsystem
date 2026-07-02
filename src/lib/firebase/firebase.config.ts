import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
// TODO: enable when Firebase Storage plan is upgraded
// import { getStorage, type FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

// Singleton — Next.js puede importar este módulo varias veces (HMR, SSR)
let app: FirebaseApp;
let firestore: Firestore;
let emulatorsConnected = false;
// let storage: FirebaseStorage;

export function getFirebaseApp(): FirebaseApp {
  if (!app) {
    app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);

    // Connect emulators immediately after app init, before Auth or Firestore
    // are used anywhere. Must run before any auth/firestore operation.
    if (process.env.NEXT_PUBLIC_USE_EMULATOR === 'true' && !emulatorsConnected) {
      emulatorsConnected = true;
      connectAuthEmulator(getAuth(app), 'http://localhost:9099', { disableWarnings: true });
      connectFirestoreEmulator(getFirestore(app), 'localhost', 8080);
    }
  }
  return app;
}

export function getFirestoreDb(): Firestore {
  if (!firestore) {
    firestore = getFirestore(getFirebaseApp());
  }
  return firestore;
}

// TODO: enable when Firebase Storage plan is upgraded
// export function getStorageBucket(): FirebaseStorage {
//   if (!storage) {
//     storage = getStorage(getFirebaseApp());
//   }
//   return storage;
// }
