import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

function getStorageBucketUrl(bucket) {
  if (!bucket) return undefined;
  if (bucket.startsWith("gs://")) return bucket;
  return `gs://${bucket}`;
}

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = firebaseConfig.storageBucket
  ? getStorage(app, getStorageBucketUrl(firebaseConfig.storageBucket))
  : getStorage(app);
export const googleProvider = new GoogleAuthProvider();

export const firebaseSetup = {
  hasStorageBucket: Boolean(firebaseConfig.storageBucket),
  storageBucket: firebaseConfig.storageBucket || "",
};

export default app;
