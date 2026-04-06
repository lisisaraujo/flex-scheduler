import admin from "firebase-admin";

let app: admin.app.App | undefined;

export function isFirestoreConfigured() {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT);
}

export function getAdminApp() {
  if (app) return app;

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccount) {
    throw new Error("Missing FIREBASE_SERVICE_ACCOUNT");
  }

  const credentials = JSON.parse(serviceAccount);
  app = admin.apps.length
    ? admin.app()
    : admin.initializeApp({
        credential: admin.credential.cert(credentials),
        projectId: process.env.FIREBASE_PROJECT_ID || credentials.project_id,
      });

  return app;
}

export function getDb() {
  return getAdminApp().firestore();
}

export function getAuth() {
  return getAdminApp().auth();
}
