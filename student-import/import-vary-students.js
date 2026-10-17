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

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

async function deleteStudentsFromExcel(excelStudents) {
  console.log('\n🗑️ DELETING STUDENTS FROM vary.xlsx THAT EXIST IN FIRESTORE...');
  console.log('='.repeat(60));
  
  let deletedCount = 0;
  let notFoundCount = 0;
  let errorCount = 0;
  const deletedStudents = [];
  
  for (const student of excelStudents) {
    const username = (student.Username || student.username || student.userName || '').toString().trim();
    const firstName = (student.Firstname || student.firstName || student.FirstName || student['First name'] || '').toString().trim();
    const lastName = (student.Lastname || student.lastName || student.LastName || student['Last name'] || '').toString().trim();
    
    if (!username && (!firstName || !lastName)) {
      console.log(`⚠️ Skipping row: No username or name found`);
      continue;
    }
    
    console.log(`\n   Looking for: ${username || `${firstName} ${lastName}`}`);
    
    let found = false;
    let uid = null;
    let studentData = null;
    
    // Try to find by username first
    if (username) {
      const usernameDoc = await db.collection('usernames').doc(username.toLowerCase()).get();
      if (usernameDoc.exists) {
        uid = usernameDoc.data().uid;
        found = true;
        studentData = usernameDoc.data();
        console.log(`      ✅ Found by username: ${username}`);
      }
    }
    
    // If not found by username, try by name
    if (!found && firstName && lastName) {
      const nameDocId = `${firstName.toLowerCase()}_${lastName.toLowerCase()}`;
      const nameDoc = await db.collection('studentNames').doc(nameDocId).get();
      if (nameDoc.exists) {
        uid = nameDoc.data().uid;
        found = true;
        studentData = nameDoc.data();
        console.log(`      ✅ Found by name: ${firstName} ${lastName}`);
      }
    }
    
    if (!found) {
      console.log(`      ⚠️ Not found in Firestore, skipping`);
      notFoundCount++;
      continue;
    }
    
    // Delete the student
    try {
      // Delete from Authentication
      try {
        await auth.deleteUser(uid);
        console.log(`      🗑️ Deleted Auth user`);
      } catch (authError) {
        if (authError.code !== 'auth/user-not-found') {
          console.log(`      ⚠️ Auth delete error: ${authError.message}`);
        }
      }
      
      // Delete from students collection
      await db.collection('students').doc(uid).delete();
      console.log(`      🗑️ Deleted from students collection`);
      
      // Delete from usernames collection
      if (username) {
        await db.collection('usernames').doc(username.toLowerCase()).delete();
        console.log(`      🗑️ Deleted from usernames collection`);
      }
      
      // Delete from studentNames collection
      if (firstName && lastName) {
        const nameDocId = `${firstName.toLowerCase()}_${lastName.toLowerCase()}`;
        await db.collection('studentNames').doc(nameDocId).delete();
        console.log(`      🗑️ Deleted from studentNames collection`);
      }
      
      // Delete exam results
      let resultsDeleted = 0;
      
      if (username) {
        const resultsByUsername = await db.collection('results')
          .where('studentUsername', '==', username)
          .get();
        
        for (const doc of resultsByUsername.docs) {
          await doc.ref.delete();
          resultsDeleted++;
        }
      }
      
      if (firstName && lastName) {
        const resultsByName = await db.collection('results')
          .where('studentFirstName', '==', firstName)
          .where('studentLastName', '==', lastName)
          .get();
        
        for (const doc of resultsByName.docs) {
          await doc.ref.delete();
          resultsDeleted++;
        }
      }
      
      if (resultsDeleted > 0) {
        console.log(`      🗑️ Deleted ${resultsDeleted} exam results`);
      }
      
      deletedCount++;
      deletedStudents.push({ username, firstName, lastName });
      console.log(`      ✅ DELETED SUCCESSFULLY`);
      
    } catch (error) {
      console.log(`      ❌ Error deleting: ${error.message}`);
      errorCount++;
    }
    
    await delay(100);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`📊 DELETE SUMMARY:`);
  console.log(`   ✅ Successfully deleted: ${deletedCount}`);
  console.log(`   ⚠️ Not found in Firestore: ${notFoundCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);
  console.log('='.repeat(60));
  
  return deletedStudents;
}

async function importVaryStudents() {
  console.log('\n' + '='.repeat(60));
  console.log('📚 IMPORTING STUDENTS FROM vary.xlsx');
  console.log('='.repeat(60) + '\n');
  
  try {
    const workbook = XLSX.readFile('./vary.xlsx');
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const students = XLSX.utils.sheet_to_json(sheet);
    
    console.log(`📖 Found ${students.length} students in vary.xlsx\n`);
    console.log('📋 Columns detected:', Object.keys(students[0] || {}).join(', '));
    console.log('');
    
    let success = 0;
    let failed = 0;
    const failedStudents = [];
    
    for (let i = 0; i < students.length; i++) {
      const student = students[i];
      
      try {
        // Get values from vary.xlsx
        let username = (student.Username || student.username || student.userName || '').toString().trim();
        let firstName = (student.Firstname || student.firstName || student.FirstName || student['First name'] || student['first name'] || '').toString().trim();
        let lastName = (student.Lastname || student.lastName || student.LastName || student['Last name'] || student['last name'] || '').toString().trim();
        let password = (student.Password || student.password || '').toString().trim();
        let studentClass = (student.class || student.Class || student.grade || student.Grade || 'Grade 12').toString().trim();
        
        // Also try to extract from fullname if first/last missing
        if ((!firstName || !lastName) && student.fullName) {
          const nameParts = student.fullName.toString().trim().split(' ');
          if (nameParts.length >= 2) {
            firstName = firstName || nameParts[0];
            lastName = lastName || nameParts.slice(1).join(' ');
          } else if (nameParts.length === 1) {
            firstName = firstName || nameParts[0];
            lastName = lastName || '';
          }
        }
        
        const fullName = `${firstName} ${lastName}`.trim();
        const sn = i + 1;
        
        // Validation
        if (!username) {
          console.log(`⚠️ Row ${i + 1}: Missing username, skipping`);
          failed++;
          failedStudents.push({ row: i + 1, reason: 'Missing username' });
          continue;
        }
        
        if (!firstName || !lastName) {
          console.log(`⚠️ Row ${i + 1}: Missing first name or last name for ${username}, skipping`);
          failed++;
          failedStudents.push({ row: i + 1, username, reason: 'Missing first or last name' });
          continue;
        }
        
        // Generate password if missing
        if (!password) {
          password = generatePassword();
          console.log(`⚠️ Generated password for ${username}`);
        } else if (password.length < 6) {
          console.log(`⚠️ Password too short for ${username}, extending...`);
          password = password + 'Abc123';
        }
        
        const email = `${username.toLowerCase()}@student.portal.local`;
        const displayName = fullName || username;
        
        console.log(`\n📝 [${i + 1}/${students.length}] Processing: ${username}`);
        console.log(`   Name: ${displayName}`);
        console.log(`   Class: ${studentClass}`);
        console.log(`   Password: ${password.substring(0, 3)}*** (${password.length} chars)`);
        
        // Create NEW user
        const userRecord = await auth.createUser({
          email: email,
          password: password,
          displayName: displayName,
          emailVerified: true
        });
        
        console.log(`   ✅ Created Auth user: ${userRecord.uid}`);
        
        // Create student document in Firestore
        const studentData = {
          uid: userRecord.uid,
          username: username,
          firstName: firstName,
          lastName: lastName,
          fullName: displayName,
          studentId: `VARY_STU${String(sn).padStart(3, '0')}`,
          class: studentClass,
          year: 2024,
          email: email,
          defaultPassword: password,
          tempPassword: password,
          hasAccount: false,
          loginType: 'both',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: new Date().toISOString()
        };
        
        await db.collection('students').doc(userRecord.uid).set(studentData);
        console.log(`   📚 Saved to students collection`);
        
        // Create username lookup
        await db.collection('usernames').doc(username.toLowerCase()).set({
          uid: userRecord.uid,
          fullName: displayName,
          studentId: `VARY_STU${String(sn).padStart(3, '0')}`,
          class: studentClass,
          username: username
        });
        console.log(`   🔑 Saved to usernames collection`);
        
        // Create name lookup for login (First Name + Last Name)
        const nameDocId = `${firstName.toLowerCase()}_${lastName.toLowerCase()}`;
        await db.collection('studentNames').doc(nameDocId).set({
          uid: userRecord.uid,
          fullName: displayName,
          firstName: firstName,
          lastName: lastName,
          class: studentClass,
          username: username,
          studentId: `VARY_STU${String(sn).padStart(3, '0')}`
        });
        console.log(`   👤 Saved to studentNames collection (ID: ${nameDocId})`);
        
        success++;
        console.log(`   ✅ IMPORTED! (${success}/${students.length})`);
        
      } catch (error) {
        failed++;
        const studentName = student.Username || student.username || student.userName || 'unknown';
        failedStudents.push({ row: i + 1, username: studentName, reason: error.message });
        console.error(`   ❌ FAILED: ${studentName} - ${error.message}`);
      }
      
      await delay(100);
    }
    
    // SUMMARY
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 IMPORT SUMMARY (vary.xlsx - Grade 12 Students)`);
    console.log(`${'='.repeat(60)}`);
    console.log(`✅ Successfully imported: ${success}`);
    console.log(`❌ Failed: ${failed}`);
    
    if (failedStudents.length > 0) {
      console.log(`\n❌ FAILED STUDENTS DETAILS:`);
      failedStudents.forEach(s => {
        console.log(`   Row ${s.row}: ${s.username || 'N/A'} - ${s.reason}`);
      });
    }
    
    console.log(`${'='.repeat(60)}`);
    console.log(`\n💡 Grade 12 students can login using EITHER:`);
    console.log(`   🔑 Username login (with their username)`);
    console.log(`   👤 Name login (with First Name + Last Name)`);
    
  } catch (error) {
    console.error('❌ Error reading Excel file:', error.message);
    console.log('\n💡 Make sure vary.xlsx exists in the same directory');
  }
}

// Main function
async function main() {
  console.log('\n🚀 STARTING GRADE 12 STUDENT RE-IMPORT');
  console.log('='.repeat(60));
  
  // Read Excel file first to get the list of students
  let students = [];
  try {
    const workbook = XLSX.readFile('./vary.xlsx');
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    students = XLSX.utils.sheet_to_json(sheet);
    console.log(`\n📖 Read ${students.length} students from vary.xlsx`);
  } catch (error) {
    console.error('❌ Cannot read vary.xlsx:', error.message);
    process.exit(1);
  }
  
  // Ask for confirmation
  console.log('\n⚠️  WARNING: This will DELETE the following students from Firebase:');
  students.slice(0, 10).forEach(s => {
    const username = s.Username || s.username || 'unknown';
    console.log(`   - ${username}`);
  });
  if (students.length > 10) {
    console.log(`   ... and ${students.length - 10} more`);
  }
  console.log('\n   Then re-import them fresh from vary.xlsx');
  console.log('\n   Press Ctrl+C to cancel, or wait 5 seconds to continue...');
  
  await delay(5000);
  
  // Step 1: Delete students that are in vary.xlsx
  await deleteStudentsFromExcel(students);
  
  // Step 2: Import fresh from vary.xlsx
  await importVaryStudents();
  
  console.log('\n✅ GRADE 12 STUDENT RE-IMPORT COMPLETE!');
  console.log('='.repeat(60));
}

// Run the main function
main().then(() => process.exit());