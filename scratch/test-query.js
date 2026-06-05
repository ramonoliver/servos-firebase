const { getFirebaseAdminClient } = require("../src/lib/firebase-admin");

async function main() {
  const supabase = getFirebaseAdminClient();
  // We try querying users by an ID. If we don't know an ID, let's list all first.
  const { data: users, error: listError } = await supabase.from("users").select("*").limit(2);
  if (listError) {
    console.error("List error:", listError);
    return;
  }
  if (!users || users.length === 0) {
    console.log("No users found.");
    return;
  }
  const firstUser = users[0];
  console.log("Found user ID:", firstUser.id);

  // Now query this user specifically by ID using standard eq
  const { data: userByEq, error: eqError } = await supabase.from("users").select("*").eq("id", firstUser.id).maybeSingle();
  if (eqError) {
    console.error("Query by eq error:", eqError);
  } else {
    console.log("Query by eq result:", userByEq ? "Success (found)" : "Not found");
  }
}

main().catch(console.error);
