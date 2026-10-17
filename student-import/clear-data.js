// clear-data.js - Delete all test users
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const auth = admin.auth();
const db = admin.firestore();

async function clearAllData() {
  console.log('🧹 Starting cleanup...\n');
  
  // Delete all Firebase Auth users
  const listUsers = await auth.listUsers();
  let deleted = 0;
  
  for (const user of listUsers.users) {
    if (user.email && user.email.endsWith('@student.portal.local')) {
      await auth.deleteUser(user.uid);
      console.log(`   🗑️ Deleted user: ${user.email}`);
      deleted++;
    }
  }
  console.log(`\n✅ Deleted ${deleted} users from Auth`);
  
  // Delete Firestore collections
  const collections = ['students', 'usernames'];
  for (const collection of collections) {
    const snapshot = await db.collection(collection).get();
    let count = 0;
    for (const doc of snapshot.docs) {
      await doc.ref.delete();
      count++;
    }
    console.log(`   🗑️ Deleted ${count} documents from ${collection}`);
  }
  
  console.log('\n✨ Cleanup complete!');
}

clearAllData().then(() => process.exit());