const admin = require('firebase-admin');
const XLSX = require('xlsx');

const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, 200));
}

async function importAllStudents() {
  // Read students Excel file
  const workbook = XLSX.readFile('./students.xlsx');
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);
  
  console.log(`📖 Found ${rows.length} students in Excel\n`);
  
  let success = 0;
  let failed = 0;
  
  for (let i = 0; i < rows.length; i++) {
    const student = rows[i];
    
    try {
      const username = student.Username;
      const firstName = student.Firstname || '';
      const lastName = student.Lastname || '';
      const fullName = `${firstName} ${lastName}`.trim();
      const sn = student['S/N'] || i + 1;
      
      if (!username) {
        console.log(`⚠️ Row ${i + 1}: No username, skipping`);
        failed++;
        continue;
      }
      
      const email = `${username.toLowerCase()}@student.portal.local`;
      const tempPassword = `Temp${Math.random().toString(36).substring(2, 10)}!`;
      
      console.log(`\n📝 [${i + 1}/${rows.length}] Importing: ${username}`);
      console.log(`   Name: ${fullName}`);
      
      // Delete if exists
      try {
        const existingUser = await auth.getUserByEmail(email);
        await auth.deleteUser(existingUser.uid);
        console.log(`   🗑️ Deleted existing`);
        await delay(100);
      } catch(e) {}
      
      // Create user
      const userRecord = await auth.createUser({
        email: email,
        password: tempPassword,
        displayName: fullName || username,
        emailVerified: true
      });
      
      console.log(`   ✅ Created user in Auth`);
      
      // Store in Firestore
      await db.collection('students').doc(userRecord.uid).set({
        uid: userRecord.uid,
        username: username,
        firstName: firstName,
        lastName: lastName,
        fullName: fullName || username,
        studentId: `STU${String(sn).padStart(3, '0')}`,
        class: 'Grade 11',
        year: 2024,
        email: email,
        hasAccount: false,
        createdAt: new Date().toISOString()
      });
      
      // Username lookup
      await db.collection('usernames').doc(username.toLowerCase()).set({
        uid: userRecord.uid,
        fullName: fullName || username,
        studentId: `STU${String(sn).padStart(3, '0')}`
      });
      
      console.log(`   📚 Saved to Firestore`);
      success++;
      
    } catch (error) {
      console.error(`   ❌ FAILED: ${student.Username} - ${error.message}`);
      failed++;
    }
    
    await delay(100);
  }
  
  console.log(`\n${'='.repeat(50)}`);
  console.log(`📊 IMPORT COMPLETE`);
  console.log(`✅ Successful: ${success}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`${'='.repeat(50)}`);
  console.log(`\n💡 Now run: node import-exam-results.js to import exam results`);
}

importAllStudents().then(() => process.exit());