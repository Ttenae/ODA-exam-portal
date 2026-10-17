const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function clearResults() {
  console.log('🗑️ Clearing all exam results...');
  
  const resultsSnapshot = await db.collection('results').get();
  let count = 0;
  
  for (const doc of resultsSnapshot.docs) {
    await doc.ref.delete();
    count++;
  }
  
  console.log(`✅ Deleted ${count} exam results`);
  console.log('💡 Now students will see "No Results Available Yet"');
}

clearResults();