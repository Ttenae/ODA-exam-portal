// reset-teachers.js - Complete teacher reset
const admin = require('firebase-admin');
const XLSX = require('xlsx');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const auth = admin.auth();
const db = admin.firestore();

async function resetAllTeachers() {
  console.log('🔄 Starting complete teacher reset...\n');
  
  // 1. Delete all teacher auth accounts
  console.log('📋 Step 1: Deleting teacher auth accounts...');
  const listUsers = await auth.listUsers();
  let deleted = 0;
  
  for (const user of listUsers.users) {
    if (user.email && (user.email.includes('@school.com') || user.email.includes('@student.portal.local'))) {
      await auth.deleteUser(user.uid);
      console.log(`   🗑️ Deleted: ${user.email}`);
      deleted++;
    }
  }
  console.log(`   ✅ Deleted ${deleted} accounts\n`);
  
  // 2. Delete Firestore teacher records
  console.log('📋 Step 2: Deleting Firestore teacher records...');
  const teachersSnapshot = await db.collection('teachers').get();
  let firestoreDeleted = 0;
  for (const doc of teachersSnapshot.docs) {
    await doc.ref.delete();
    firestoreDeleted++;
  }
  console.log(`   ✅ Deleted ${firestoreDeleted} teacher records\n`);
  
  // 3. Re-import teachers from Excel
  console.log('📋 Step 3: Re-importing teachers from Excel...');
  const workbook = XLSX.readFile('./teachers.xlsx');
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const teachers = XLSX.utils.sheet_to_json(sheet);
  
  let imported = 0;
  for (const teacher of teachers) {
    await db.collection('teachers').add({
      email: teacher.email,
      fullName: teacher.full_name,
      teacherId: teacher.teacher_id,
      subject: teacher.subject,
      department: teacher.department,
      hasAccount: false,
      createdAt: new Date()
    });
    console.log(`   ✅ Imported: ${teacher.email}`);
    imported++;
  }
  
  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ RESET COMPLETE!`);
  console.log(`✅ Deleted ${deleted} auth accounts`);
  console.log(`✅ Deleted ${firestoreDeleted} Firestore records`);
  console.log(`✅ Imported ${imported} new teachers`);
  console.log(`\n💡 Now teachers can register with their email!`);
  console.log(`${'='.repeat(50)}`);
}

resetAllTeachers().then(() => process.exit());