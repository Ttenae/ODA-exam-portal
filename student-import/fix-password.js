const admin = require('firebase-admin');
const XLSX = require('xlsx');

const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();

async function importSafe() {
  const workbook = XLSX.readFile('./students.xlsx');
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const students = XLSX.utils.sheet_to_json(sheet);
  
  let success = 0;
  
  for (const student of students) {
    try {
      const username = student.Username || student.username;
      const firstName = student.Firstname || student.firstname || '';
      const lastName = student.Lastname || student.lastname || '';
      let password = (student.Password || student.password || '').toString().trim();
      const studentClass = student.class || student.Class || 'Grade 12';
      
      if (!username) continue;
      
      // Ensure password is clean string
      password = password.replace(/[^\x20-\x7E]/g, ''); // Remove non-ASCII chars
      
      const fullName = `${firstName} ${lastName}`.trim();
      const email = `${username.toLowerCase()}@student.portal.local`;
      
      console.log(`Importing: ${username} -> Password: ${password}`);
      
      // Delete if exists
      try {
        const existing = await auth.getUserByEmail(email);
        await auth.deleteUser(existing.uid);
      } catch(e) {}
      
      // Create user
      const user = await auth.createUser({
        email: email,
        password: password,
        displayName: fullName || username,
        emailVerified: true
      });
      
      // Store in Firestore
      await db.collection('students').doc(user.uid).set({
        uid: user.uid,
        username: username,
        firstName: firstName,
        lastName: lastName,
        fullName: fullName || username,
        class: studentClass,
        defaultPassword: password,
        tempPassword: password,
        hasAccount: false,
        createdAt: new Date().toISOString()
      });
      
      // Username lookup
      await db.collection('usernames').doc(username.toLowerCase()).set({
        uid: user.uid,
        fullName: fullName || username,
        class: studentClass
      });
      
      console.log(`   ✅ Success`);
      success++;
      
    } catch (error) {
      console.error(`   ❌ Failed: ${error.message}`);
    }
  }
  
  console.log(`\n✅ Imported ${success} students`);
}

importSafe().then(() => process.exit());