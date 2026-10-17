// import-students-no-email.js
const admin = require('firebase-admin');
const XLSX = require('xlsx');

// Initialize Firebase Admin SDK
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();

// Read Excel file
function readStudentsFromExcel(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const students = XLSX.utils.sheet_to_json(worksheet);
  return students;
}

// Create fake email from username (Firebase requires email)
function createFakeEmail(username) {
  // Create a unique email that won't conflict
  return `${username}@student.portal.local`;
}

// Import to Firebase
async function importStudentsToFirebase(students) {
  let successCount = 0;
  let errorCount = 0;
  
  for (const student of students) {
    try {
      const fakeEmail = createFakeEmail(student.username);
      
      // Check if user exists
      let userRecord;
      try {
        userRecord = await auth.getUserByEmail(fakeEmail);
        console.log(`User ${student.username} exists, updating...`);
      } catch (error) {
        // Create new user with fake email
        userRecord = await auth.createUser({
          email: fakeEmail,
          password: student.password,
          displayName: student.full_name,
          emailVerified: true
        });
        console.log(`✅ Created user: ${student.username}`);
      }
      
      // Store in Firestore (no email needed)
      await db.collection('students').doc(userRecord.uid).set({
        uid: userRecord.uid,
        username: student.username,
        fullName: student.full_name,
        studentId: student.student_id,
        class: student.class,
        year: student.year || new Date().getFullYear(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        isActive: true
      });
      
      // Username to UID mapping for login
      await db.collection('usernames').doc(student.username.toLowerCase()).set({
        uid: userRecord.uid,
        fullName: student.full_name,
        studentId: student.student_id
      });
      
      successCount++;
      console.log(`   → Stored: ${student.full_name} (${student.username})`);
      
    } catch (error) {
      console.error(`❌ Failed for ${student.username}:`, error.message);
      errorCount++;
    }
  }
  
  console.log(`\n📊 Import Complete!`);
  console.log(`✅ Success: ${successCount}`);
  console.log(`❌ Errors: ${errorCount}`);
}

// Main execution
async function main() {
  try {
    const students = readStudentsFromExcel('./students.xlsx');
    console.log(`📖 Found ${students.length} students in Excel\n`);
    await importStudentsToFirebase(students);
  } catch (error) {
    console.error('Import failed:', error);
  }
  process.exit();
}

main();