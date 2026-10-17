const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();

async function deleteTeacherByEmail() {
    const teacherEmail = "amsalusgs@gmail.com";  // CHANGE THIS TO THE TEACHER'S EMAIL
    
    console.log(`🔍 Searching for teacher with email: ${teacherEmail}\n`);
    
    // Find the teacher by email
    const teachersQuery = await db.collection('teachers')
        .where('email', '==', teacherEmail)
        .get();
    
    if (teachersQuery.empty) {
        console.log(`❌ Teacher with email ${teacherEmail} not found`);
        return;
    }
    
    const teacherDoc = teachersQuery.docs[0];
    const teacherData = teacherDoc.data();
    const uid = teacherDoc.id;
    
    console.log(`✅ Found: ${teacherData.name || teacherData.fullName || 'Unknown'}`);
    console.log(`   UID: ${uid}`);
    console.log(`   Email: ${teacherData.email}`);
    if (teacherData.department) {
        console.log(`   Department: ${teacherData.department}`);
    }
    console.log('');
    
    // Check if teacher has any related data
    let relatedCount = 0;
    
    // Check for classes taught by this teacher
    const classesQuery = await db.collection('classes')
        .where('teacherId', '==', uid)
        .get();
    relatedCount += classesQuery.size;
    
    // Check for subjects taught by this teacher
    const subjectsQuery = await db.collection('subjects')
        .where('teacherId', '==', uid)
        .get();
    relatedCount += subjectsQuery.size;
    
    // Check for any other collections with teacher reference
    const schedulesQuery = await db.collection('schedules')
        .where('teacherEmail', '==', teacherEmail)
        .get();
    relatedCount += schedulesQuery.size;
    
    console.log(`⚠️ About to delete:`);
    console.log(`   - Authentication user account`);
    console.log(`   - Teacher record from 'teachers' collection`);
    if (relatedCount > 0) {
        console.log(`   ⚠️  ${relatedCount} related record(s) will ALSO be deleted!`);
    } else {
        console.log(`   ✅ No related records found`);
    }
    console.log('');
    
    // Confirm before deleting
    console.log(`Press ENTER to confirm deletion or Ctrl+C to cancel...`);
    await new Promise(resolve => process.stdin.once('data', resolve));
    
    // Delete from Authentication
    try {
        await auth.deleteUser(uid);
        console.log(`🗑️ Deleted from Authentication`);
    } catch (error) {
        if (error.code === 'auth/user-not-found') {
            console.log(`⚠️ No Authentication account found for this teacher`);
        } else {
            console.log(`⚠️ Auth delete error: ${error.message}`);
        }
    }
    
    // Delete from teachers collection
    await teacherDoc.ref.delete();
    console.log(`🗑️ Deleted from teachers collection`);
    
    // Delete related data
    if (classesQuery.size > 0) {
        const batch = db.batch();
        classesQuery.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        console.log(`🗑️ Deleted ${classesQuery.size} class(es) taught by this teacher`);
    }
    
    if (subjectsQuery.size > 0) {
        const batch = db.batch();
        subjectsQuery.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        console.log(`🗑️ Deleted ${subjectsQuery.size} subject(s) assigned to this teacher`);
    }
    
    if (schedulesQuery.size > 0) {
        const batch = db.batch();
        schedulesQuery.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        console.log(`🗑️ Deleted ${schedulesQuery.size} schedule(s) for this teacher`);
    }
    
    console.log(`\n✅ Teacher account and ALL related data successfully deleted!`);
    console.log(`\n📋 Summary:`);
    console.log(`   - Auth user: DELETED`);
    console.log(`   - Teacher record: DELETED`);
    console.log(`   - Related records: ${relatedCount} DELETED`);
}

// Run the function
deleteTeacherByEmail().then(() => process.exit());