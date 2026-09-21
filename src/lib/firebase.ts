"use client";

import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from "firebase/app-check";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const hasRequiredFirebaseConfig = [
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.appId,
].every((value) => typeof value === "string" && value.length > 0);

const appCheckSiteKey = process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_RECAPTCHA_ENTERPRISE_SITE_KEY;
const isAppCheckConfigured = typeof appCheckSiteKey === "string" && appCheckSiteKey.length > 0;
const isLocalAppCheckDebugEnabled = process.env.NODE_ENV !== "production"
  && process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_DEBUG === "true";

type AppCheckRuntime = typeof globalThis & {
  FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string;
  __pomotmFirebaseAppCheck?: AppCheck;
};

function getOrInitializeFirebaseApp(): FirebaseApp {
  const existingApp = getApps()[0];
  return existingApp ?? initializeApp(firebaseConfig);
}

function getOrInitializeFirebaseAppCheck(app: FirebaseApp): AppCheck | null {
  if (!isAppCheckConfigured) {
    return null;
  }

  const runtime = globalThis as AppCheckRuntime;
  if (runtime.__pomotmFirebaseAppCheck) {
    return runtime.__pomotmFirebaseAppCheck;
  }

  if (isLocalAppCheckDebugEnabled) {
    runtime.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }

  const instance = initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
  runtime.__pomotmFirebaseAppCheck = instance;
  return instance;
}

export const firebaseApp: FirebaseApp | null = typeof window !== "undefined" && hasRequiredFirebaseConfig
  ? getOrInitializeFirebaseApp()
  : null;
export const appCheck: AppCheck | null = firebaseApp
  ? getOrInitializeFirebaseAppCheck(firebaseApp)
  : null;
export const auth: Auth | null = firebaseApp ? getAuth(firebaseApp) : null;
export const googleProvider: GoogleAuthProvider | null = auth ? new GoogleAuthProvider() : null;

if (googleProvider) {
  googleProvider.setCustomParameters({ prompt: "select_account" });
}
