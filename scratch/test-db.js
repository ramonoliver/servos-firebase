const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const projectId = "servos-bcc51";
const app = initializeApp({ projectId });
const db = getFirestore(app);

async function check() {
  console.log("Checking Firestore database...");
  const collections = ["churches", "users", "cells", "ministries", "pastoralNotes", "schedules", "events"];
  for (const col of collections) {
    try {
      const snap = await db.collection(col).get();
      console.log(`Collection: ${col} - Count: ${snap.size}`);
      if (snap.size > 0) {
        console.log("Example document fields:", Object.keys(snap.docs[0].data()));
      }
    } catch (err) {
      console.error(`Error querying ${col}:`, err.message);
    }
  }
}

check().catch(console.error);
