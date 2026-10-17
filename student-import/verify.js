const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkPassword() {
    const username = "bulbula_11th"; // Change to your student's username
    
    console.log(`🔍 Checking password for: ${username}\n`);
    
    // Find in students collection
    const studentsQuery = await db.collection('students')
        .where('username', '==', username)
        .get();
    
    if (!studentsQuery.empty) {
        const student = studentsQuery.docs[0];
        const data = student.data();
        console.log('📋 Found in students collection:');
        console.log(`   Full Name: ${data.fullName}`);
        console.log(`   Default Password: "${data.defaultPassword}"`);
        console.log(`   Temp Password: "${data.tempPassword}"`);
        console.log(`   Has Account: ${data.hasAccount}`);
        console.log(`   Stored Password: "${data.password}"`);
        console.log('');
        console.log('📝 Note: Student should enter exactly:');
        console.log(`   "${data.defaultPassword || data.tempPassword}"`);
    }
    
    // Check in usernames collection
    const usernameDoc = await db.collection('usernames').doc(username.toLowerCase()).get();
    if (usernameDoc.exists) {
        const data = usernameDoc.data();
        console.log('\n📋 Found in usernames collection:');
        console.log(`   Default Password: "${data.defaultPassword}"`);
        console.log(`   Temp Password: "${data.tempPassword}"`);
    }
    
    // Check in studentNames
    const studentNamesQuery = await db.collection('studentNames')
        .where('username', '==', username)
        .get();
    
    if (!studentNamesQuery.empty) {
        const student = studentNamesQuery.docs[0];
        const data = student.data();
        console.log('\n📋 Found in studentNames collection:');
        console.log(`   Default Password: "${data.defaultPassword}"`);
        console.log(`   Temp Password: "${data.tempPassword}"`);
    }
}

checkPassword().then(() => process.exit());