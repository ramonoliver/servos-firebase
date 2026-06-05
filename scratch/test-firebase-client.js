const fs = require("fs");
const path = require("path");
const { initializeApp } = require("firebase/app");
const { getFirestore, collection, query, where, getDocs, limit } = require("firebase/firestore");

// Load .env.local manually
const envPath = path.join(__dirname, "..", ".env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
const env = {};
envContent.split("\n").forEach(line => {
  const match = line.match(/^\s*([\w.\-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] ? match[2].trim() : "";
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
});

const firebaseConfig = {
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function main() {
  console.log("Firebase client initialized with project:", env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  
  // 1. Get a document from users
  const colRef = collection(db, "users");
  const qLimit = query(colRef, limit(1));
  const snap = await getDocs(qLimit);
  if (snap.empty) {
    console.log("No users found.");
    return;
  }
  
  const doc = snap.docs[0];
  const docId = doc.id;
  const docData = doc.data();
  console.log("Found user document ID:", docId);
  console.log("Has 'id' in fields body?", "id" in docData);

  // 2. Query using where("id", "==", docId)
  const qField = query(colRef, where("id", "==", docId));
  const snapField = await getDocs(qField);
  console.log("Query by where('id', '==', docId) count:", snapField.size);

  // 3. Query using where("__name__", "==", docId)
  const qName = query(colRef, where("__name__", "==", docId));
  const snapName = await getDocs(qName);
  console.log("Query by where('__name__', '==', docId) count:", snapName.size);
}

main().catch(console.error);
