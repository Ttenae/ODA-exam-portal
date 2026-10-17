// import-teachers.js - Only imports to Firestore, NOT Auth
const admin = require('firebase-admin');
const XLSX = require('xlsx');

const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

function readExcel(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(worksheet);
}

async function importTeachers() {
  const teachers = readExcel('./teachers.xlsx');
  console.log(`📖 Found ${teachers.length} teachers in Excel\n`);
  
  let success = 0;
  let failed = 0;
  
  for (const teacher of teachers) {
    try {
      // Check if teacher already exists
      const existingQuery = await db.collection('teachers')
        .where('email', '==', teacher.email)
        .get();
      
      if (!existingQuery.empty) {
        console.log(`⚠️ Teacher already exists: ${teacher.email}`);
        continue;
      }
      
      // Add to Firestore only (NO Auth account created)
      await db.collection('teachers').add({
        email: teacher.email,
        fullName: teacher.full_name,
        teacherId: teacher.teacher_id,
        subject: teacher.subject,
        department: teacher.department,
        hasAccount: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      console.log(`✅ Imported: ${teacher.email} (${teacher.full_name})`);
      success++;
      
    } catch (error) {
      failed++;
      console.error(`❌ Failed: ${teacher.email} -`, error.message);
    }
  }
  
  console.log(`\n${'='.repeat(50)}`);
  console.log(`📊 TEACHER IMPORT COMPLETE`);
  console.log(`✅ Successful: ${success}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`${'='.repeat(50)}`);
  console.log(`\n💡 Teachers can now register using their email on teacher.html`);
}

importTeachers().then(() => process.exit());