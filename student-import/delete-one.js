const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();

async function resetStudentLoginOnly() {
    const username = "bulbula_11th";  // Change this to any username
    
    console.log(`🔍 Searching for ${username}...\n`);
    
    // Find the student
    let studentFound = false;
    let studentData = null;
    let uid = null;
    let firstName = null;
    let lastName = null;
    let tempPassword = null;
    
    // Try to find in students collection
    const studentsQuery = await db.collection('students')
        .where('username', '==', username)
        .get();
    
    if (!studentsQuery.empty) {
        const studentDoc = studentsQuery.docs[0];
        studentData = studentDoc.data();
        uid = studentDoc.id;
        firstName = studentData.firstName;
        lastName = studentData.lastName;
        tempPassword = studentData.defaultPassword || studentData.tempPassword;
        studentFound = true;
        console.log(`✅ Found in students collection: ${studentData.fullName}`);
    }
    
    // If not found, try studentNames
    if (!studentFound) {
        const studentNamesQuery = await db.collection('studentNames')
            .where('username', '==', username)
            .get();
        
        if (!studentNamesQuery.empty) {
            const studentDoc = studentNamesQuery.docs[0];
            studentData = studentDoc.data();
            uid = studentData.uid;
            firstName = studentData.firstName;
            lastName = studentData.lastName;
            tempPassword = studentData.defaultPassword || studentData.tempPassword;
            studentFound = true;
            console.log(`✅ Found in studentNames collection: ${studentData.fullName}`);
        }
    }
    
    if (!studentFound) {
        console.log(`❌ ${username} not found`);
        return;
    }
    
    console.log(`   UID: ${uid}`);
    console.log(`   Class: ${studentData.class}`);
    console.log(`   Temp Password: ${tempPassword}`);
    console.log('');
    
    // Count exam results
    const resultsQuery = await db.collection('results')
        .where('studentUsername', '==', username)
        .get();
    const examCount = resultsQuery.size;
    
    console.log(`⚠️ About to RESET login (keeping ${examCount} exam results):`);
    console.log(`   ✅ Auth user - WILL BE DELETED (student must re-signup)`);
    console.log(`   ✅ students/studentNames record - WILL BE DELETED`);
    console.log(`   ✅ KEEPING usernames lookup - So teacher can still upload exams`);
    console.log(`   ✅ KEEPING all exam results`);
    console.log('');
    
    // Delete from Auth (so student must re-signup)
    try {
        await auth.deleteUser(uid);
        console.log(`🗑️ Deleted from Authentication - Student must sign up again`);
    } catch (error) {
        if (error.code === 'auth/user-not-found') {
            console.log(`⚠️ Auth user already deleted`);
        } else {
            console.log(`⚠️ Auth delete error: ${error.message}`);
        }
    }
    
    // Delete from students collection (if exists)
    if (studentsQuery && !studentsQuery.empty) {
        await studentsQuery.docs[0].ref.delete();
        console.log(`🗑️ Deleted from students collection`);
    }
    
    // Delete from studentNames collection (if exists)
    if (firstName && lastName) {
        const nameDocId = `${firstName.toLowerCase()}_${lastName.toLowerCase()}`;
        const nameDoc = await db.collection('studentNames').doc(nameDocId).get();
        if (nameDoc.exists) {
            await nameDoc.ref.delete();
            console.log(`🗑️ Deleted from studentNames collection`);
        }
    }
    
    // KEEP usernames collection (so teacher can still upload exams)
    const usernameDoc = await db.collection('usernames').doc(username.toLowerCase()).get();
    if (usernameDoc.exists) {
        // Update to mark that account needs re-signup
        await db.collection('usernames').doc(username.toLowerCase()).update({
            hasAccount: false,
            needsReSignup: true,
            resetAt: new Date().toISOString()
        });
        console.log(`✅ KEPT usernames lookup (updated to needsReSignup=true)`);
    } else {
        // Recreate username lookup if missing
        await db.collection('usernames').doc(username.toLowerCase()).set({
            uid: uid,
            fullName: studentData.fullName,
            class: studentData.class,
            username: username,
            hasAccount: false,
            needsReSignup: true,
            createdAt: new Date().toISOString()
        });
        console.log(`✅ RE-CREATED usernames lookup`);
    }
    
    console.log(`\n✅ COMPLETE! Student login reset, but teacher can STILL upload exams!`);
    console.log(`\n📋 Student experience:`);
    console.log(`   1. Student goes to Student Portal`);
    console.log(`   2. Clicks "Sign Up"`);
    console.log(`   3. Enters username: ${username}`);
    console.log(`   4. Enters temporary password: ${tempPassword}`);
    console.log(`   5. Creates new password`);
    console.log(`   6. Logs in and sees ALL ${examCount} exam results!`);
    console.log(`\n📋 Teacher experience:`);
    console.log(`   ✅ Can still upload new exams for ${username} - will NOT fail!`);
}

resetStudentLoginOnly().then(() => process.exit());