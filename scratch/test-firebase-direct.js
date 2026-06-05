const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

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

const projectId = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
if (!admin.apps.length) {
  admin.initializeApp({ projectId });
}

const db = admin.firestore();

async function main() {
  console.log("Using Project ID:", projectId);
  
  // 1. Fetch first document from users
  const snap = await db.collection("users").limit(1).get();
  if (snap.empty) {
    console.log("No users found in Firestore!");
    return;
  }
  const userDoc = snap.docs[0];
  const docId = userDoc.id;
  const docData = userDoc.data();
  console.log("User doc ID:", docId);
  console.log("User data has 'id' field in body?", "id" in docData);

  // 2. Query using field 'id'
  const snapByField = await db.collection("users").where("id", "==", docId).get();
  console.log("Query by where('id', '==', docId) result count:", snapByField.size);

  // 3. Query using __name__ (Internal field path for document ID)
  const snapByName = await db.collection("users").where("__name__", "==", docId).get();
  console.log("Query by where('__name__', '==', docId) result count:", snapByName.size);

  // 4. Query using FieldPath.documentId()
  const snapByFieldPath = await db.collection("users").where(admin.firestore.FieldPath.documentId(), "==", docId).get();
  console.log("Query by where(FieldPath.documentId(), '==', docId) result count:", snapByFieldPath.size);
}

main().catch(console.error);
