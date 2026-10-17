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

async function importGrade9And11Students() {
  console.log('\n' + '='.repeat(60));
  console.log('📚 IMPORT GRADE 9 & 11 STUDENTS FROM students.xlsx');
  console.log('='.repeat(60) + '\n');
  
  try {
    const workbook = XLSX.readFile('./students.xlsx');
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const students = XLSX.utils.sheet_to_json(sheet);
    
    console.log(`📖 Found ${students.length} students in students.xlsx\n`);
    console.log('📋 Columns detected:', Object.keys(students[0] || {}).join(', '));
    console.log('');
    
    let success = 0;
    let failed = 0;
    let skipped = 0;
    let updated = 0;
    let created = 0;
    const failedStudents = [];
    
    for (let i = 0; i < students.length; i++) {
      const student = students[i];
      
      try {
        // Get values from Excel - support multiple column name variations
        let username = (student.Username || student.username || student.userName || student.USERNAME || '').toString().trim();
        let firstName = (student.Firstname || student.firstName || student.FirstName || student['First name'] || student['first name'] || student.FIRSTNAME || '').toString().trim();
        let lastName = (student.Lastname || student.lastName || student.LastName || student['Last name'] || student['last name'] || student.LASTNAME || '').toString().trim();
        let password = (student.Password || student.password || student.PASSWORD || '').toString().trim();
        let studentClass = (student.class || student.Class || student.grade || student.Grade || student.CLASS || '').toString().trim();
        let studentId = (student.studentId || student.StudentId || student.STUDENTID || student.ID || '').toString().trim();
        
        // Also try to extract from fullname if first/last missing
        if ((!firstName || !lastName) && (student.fullName || student.FullName || student.fullname)) {
          const fullNameValue = student.fullName || student.FullName || student.fullname;
          const nameParts = fullNameValue.toString().trim().split(' ');
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
        
        // Validate grade (must be 9 or 11)
        let validClass = false;
        if (studentClass.toLowerCase().includes('grade 9') || studentClass === '9' || studentClass === 'Grade 9') {
          studentClass = 'Grade 9';
          validClass = true;
        } else if (studentClass.toLowerCase().includes('grade 11') || studentClass === '11' || studentClass === 'Grade 11') {
          studentClass = 'Grade 11';
          validClass = true;
        } else {
          // If class not specified, try to detect from username or skip
          console.log(`⚠️ Row ${i + 1}: Invalid or missing class for ${username || 'unknown'}, skipping (only Grade 9 and 11 allowed)`);
          skipped++;
          failedStudents.push({ row: i + 1, username: username || 'unknown', reason: 'Invalid or missing class (must be Grade 9 or 11)' });
          continue;
        }
        
        // Validation
        if (!username) {
          console.log(`⚠️ Row ${i + 1}: Missing username, skipping`);
          skipped++;
          failedStudents.push({ row: i + 1, reason: 'Missing username' });
          continue;
        }
        
        if (!firstName || !lastName) {
          console.log(`⚠️ Row ${i + 1}: Missing first name or last name for ${username}, skipping`);
          skipped++;
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
        
        // CHECK IF USER EXISTS
        let existingUid = null;
        let isUpdate = false;
        
        try {
          // Try to find existing user by email
          const existingUser = await auth.getUserByEmail(email);
          existingUid = existingUser.uid;
          isUpdate = true;
          console.log(`   🔍 Found existing user, will update`);
          
          // Update password
          await auth.updateUser(existingUid, {
            password: password,
            displayName: displayName
          });
          console.log(`   ✅ Updated Auth user`);
          
        } catch (error) {
          if (error.code === 'auth/user-not-found') {
            // Create new user
            const userRecord = await auth.createUser({
              email: email,
              password: password,
              displayName: displayName,
              emailVerified: true
            });
            existingUid = userRecord.uid;
            console.log(`   ✅ Created NEW Auth user: ${existingUid}`);
          } else {
            throw error;
          }
        }
        
        // Generate student ID if not provided
        if (!studentId) {
          const prefix = studentClass === 'Grade 9' ? 'GR9' : 'GR11';
          studentId = `${prefix}_${String(sn).padStart(4, '0')}`;
        }
        
        // Prepare student data
        const studentData = {
          uid: existingUid,
          username: username,
          firstName: firstName,
          lastName: lastName,
          fullName: displayName,
          studentId: studentId,
          class: studentClass,
          year: 2024,
          email: email,
          defaultPassword: password,
          tempPassword: password,
          hasAccount: false,
          loginType: 'username',  // Grade 9 & 11 use username login only
          updatedAt: new Date().toISOString()
        };
        
        // Add createdAt only for new students
        if (!isUpdate) {
          studentData.createdAt = admin.firestore.FieldValue.serverTimestamp();
        }
        
        // Save to students collection
        await db.collection('students').doc(existingUid).set(studentData, { merge: true });
        console.log(`   📚 Saved to students collection (${isUpdate ? 'updated' : 'created'})`);
        
        // Save to usernames collection (for username login)
        await db.collection('usernames').doc(username.toLowerCase()).set({
          uid: existingUid,
          fullName: displayName,
          firstName: firstName,
          lastName: lastName,
          studentId: studentId,
          class: studentClass,
          username: username,
          defaultPassword: password,
          tempPassword: password,
          hasAccount: false
        }, { merge: true });
        console.log(`   🔑 Saved to usernames collection`);
        
        // NOTE: Grade 9 & 11 students are NOT added to studentNames collection
        // Only Grade 12 students use name-based login
        
        if (isUpdate) {
          updated++;
        } else {
          created++;
        }
        success++;
        console.log(`   ✅ ${isUpdate ? 'UPDATED' : 'CREATED'}! (${success}/${students.length})`);
        
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
    console.log(`📊 IMPORT SUMMARY (students.xlsx - Grade 9 & 11 Students)`);
    console.log(`${'='.repeat(60)}`);
    console.log(`✅ Total successful: ${success}`);
    console.log(`   🆕 Created: ${created}`);
    console.log(`   🔄 Updated: ${updated}`);
    console.log(`⏭️ Skipped (invalid class): ${skipped}`);
    console.log(`❌ Failed: ${failed}`);
    
    if (failedStudents.length > 0) {
      console.log(`\n❌ FAILED STUDENTS DETAILS:`);
      failedStudents.forEach(s => {
        console.log(`   Row ${s.row}: ${s.username || 'N/A'} - ${s.reason}`);
      });
    }
    
    console.log(`${'='.repeat(60)}`);
    console.log(`\n💡 Grade 9 & 11 students can login using:`);
    console.log(`   🔑 Username login only (with their username)`);
    console.log(`\n📚 Grade 12 students use separate import (vary.xlsx)`);
    console.log(`🔐 Temporary passwords are from students.xlsx (or auto-generated)`);
    
  } catch (error) {
    console.error('❌ Error reading Excel file:', error.message);
    console.log('\n💡 Make sure students.xlsx exists in the same directory');
    console.log('   Required columns: Username, Firstname, Lastname');
    console.log('   Optional columns: Password, class (must be "Grade 9" or "Grade 11")');
    console.log('\n   Example Excel format:');
    console.log('   | Username | Firstname | Lastname | Password | class     |');
    console.log('   |----------|-----------|----------|----------|-----------|');
    console.log('   | abdi_9th | Abdi      | Gizachew | pass123  | Grade 9   |');
    console.log('   | ifa_11th | Ifa       | Gemechu  | pass456  | Grade 11  |');
  }
}

// Run the import
importGrade9And11Students().then(() => process.exit());