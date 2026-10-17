const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();

async function checkTeacher() {
    const email = process.argv[2] || "mr_johnson@school.com";
    
    console.log(`🔍 Teacher Info: ${email}\n`);
    console.log('='.repeat(60));
    
    // Find teacher in Firestore
    const teachersQuery = await db.collection('teachers')
        .where('email', '==', email)
        .get();
    
    if (teachersQuery.empty) {
        console.log(`❌ Teacher "${email}" not found in Firestore`);
        return;
    }
    
    const teacherDoc = teachersQuery.docs[0];
    const data = teacherDoc.data();
    
    console.log(`\n📋 TEACHER INFORMATION`);
    console.log(`   Full Name: ${data.fullName || 'N/A'}`);
    console.log(`   Email: ${data.email}`);
    console.log(`   Teacher ID: ${data.teacherId || 'N/A'}`);
    console.log(`   Subject: ${data.subject || 'N/A'}`);
    console.log(`   Department: ${data.department || 'N/A'}`);
    console.log(`   Status: ${data.hasAccount ? '✅ Has account' : '❌ No account yet'}`);
    
    // PASSWORDS
    console.log(`\n🔐 PASSWORD INFORMATION`);
    
    // Check if teacher has an Auth account
    try {
        const user = await auth.getUserByEmail(email);
        console.log(`   ✅ Auth account exists (UID: ${user.uid})`);
        console.log(`   ⚠️ Password is hashed and cannot be retrieved for security reasons`);
        console.log(`   💡 Teacher can reset password using "Forgot Password" or admin reset`);
        
        // Show when account was created
        console.log(`   📅 Account Created: ${user.metadata.creationTime || 'N/A'}`);
        console.log(`   📅 Last Sign In: ${user.metadata.lastSignInTime || 'Never'}`);
        
    } catch (error) {
        if (error.code === 'auth/user-not-found') {
            console.log(`   ❌ No Auth account found for this email`);
            console.log(`   💡 Teacher needs to sign up using the temporary password`);
        } else {
            console.log(`   ⚠️ Error checking Auth: ${error.message}`);
        }
    }
    
    // Show temporary password from Firestore (if exists)
    if (data.defaultPassword || data.tempPassword) {
        console.log(`\n📋 TEMPORARY PASSWORD (from Excel):`);
        console.log(`   ${data.defaultPassword || data.tempPassword}`);
        console.log(`   💡 Teacher can use this to sign up for the first time`);
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`\n💡 To reset teacher password, run:`);
    console.log(`   node reset-teacher-password.js ${email}`);
}

checkTeacher().then(() => process.exit());