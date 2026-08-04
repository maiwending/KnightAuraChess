import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

function parseFirebaseConfig(rawConfig) {
  if (!rawConfig) return {};
  try {
    return JSON.parse(rawConfig);
  } catch (error) {
    console.warn('Ignoring invalid VITE_FIREBASE_CONFIG JSON:', error?.message || error);
    return {};
  }
}

function compactConfig(config) {
  return Object.fromEntries(
    Object.entries(config).filter(([, value]) => value != null && value !== '')
  );
}

const env = import.meta.env;
const jsonConfig = parseFirebaseConfig(env.VITE_FIREBASE_CONFIG);
const projectId = env.VITE_FIREBASE_PROJECT_ID || jsonConfig.projectId;
const apiKey = env.VITE_FIREBASE_API_KEY || env.VITE_FIREBASE_WEB_API_KEY || jsonConfig.apiKey;

const firebaseConfig = {
  apiKey,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || jsonConfig.authDomain || (projectId ? `${projectId}.firebaseapp.com` : undefined),
  projectId,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || jsonConfig.storageBucket || (projectId ? `${projectId}.appspot.com` : undefined),
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || jsonConfig.messagingSenderId,
  appId: env.VITE_FIREBASE_APP_ID || jsonConfig.appId,
};

const hasFirebaseConfig = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId
);

let app = null;
let auth = null;
let db = null;
let googleProvider = null;

if (hasFirebaseConfig) {
  try {
    app = initializeApp(compactConfig(firebaseConfig));
    auth = getAuth(app);
    db = getFirestore(app);
    googleProvider = new GoogleAuthProvider();
  } catch (error) {
    console.warn('Firebase disabled due to configuration error:', error?.message || error);
  }
} else {
  console.warn('Firebase env vars missing. Running in local practice mode.');
}

export const firebaseEnabled = Boolean(auth && db);
export { app, auth, db, googleProvider };
