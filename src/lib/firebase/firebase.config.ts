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
  }
  return app;
}

export function getFirestoreDb(): Firestore {
  if (!firestore) {
    firestore = getFirestore(getFirebaseApp());
    if (process.env.NEXT_PUBLIC_USE_EMULATOR === 'true' && !emulatorsConnected) {
      connectFirestoreEmulator(firestore, 'localhost', 8080);
      connectAuthEmulator(getAuth(getFirebaseApp()), 'http://localhost:9099');
      emulatorsConnected = true;
    }
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
