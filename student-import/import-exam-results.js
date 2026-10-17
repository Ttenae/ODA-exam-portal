const admin = require('firebase-admin');
const XLSX = require('xlsx');

const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, 200));
}

async function importExamsSimple() {
  // Read exam results file
  const workbook = XLSX.readFile('./exam_results.xlsx');
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);
  
  console.log(`📖 Found ${rows.length} exam records\n`);
  
  // Group by student (each student may have multiple rows)
  const studentResults = new Map();
  
  for (const row of rows) {
    const username = row.Username;
    const firstName = row['First name'] || '';
    const lastName = row['Last name'] || '';
    const fullName = `${firstName} ${lastName}`.trim();
    const grade = parseFloat(row['Grade/20.00']) || 0;
    const status = row.Status;
    
    if (!username) continue;
    
    if (!studentResults.has(username)) {
      studentResults.set(username, {
        username: username,
        firstName: firstName,
        lastName: lastName,
        fullName: fullName,
        grade: grade,
        status: status,
        started: row.Started,
        completed: row.Completed,
        duration: row.Duration
      });
    }
  }
  
  console.log(`📊 Found ${studentResults.size} students with exam results\n`);
  
  let success = 0;
  let failed = 0;
  let notFound = [];
  
  for (const [username, examData] of studentResults) {
    try {
      console.log(`\n📝 Processing: ${username}`);
      console.log(`   Name: ${examData.fullName}`);
      console.log(`   Grade: ${examData.grade}/20 (${Math.round((examData.grade/20)*100)}%)`);
      
      // Find the student in Firebase by username
      const usernameDoc = await db.collection('usernames').doc(username.toLowerCase()).get();
      
      if (!usernameDoc.exists) {
        console.log(`   ❌ Student not found in Firebase`);
        notFound.push(username);
        failed++;
        continue;
      }
      
      const studentUid = usernameDoc.data().uid;
      const score = Math.round((examData.grade / 20) * 100);
      
      // Save simplified exam result (no questions/responses)
      await db.collection('results').doc(`${username}_EXAM`).set({
        studentId: studentUid,
        studentUsername: username,
        studentName: examData.fullName,
        examId: 'OROMO_EXAM',
        examTitle: 'Oromo Language Exam',
        gradeOutOf20: examData.grade,
        score: score,
        status: examData.status,
        started: examData.started,
        completed: examData.completed,
        duration: examData.duration,
        uploadedAt: new Date().toISOString()
      });
      
      console.log(`   ✅ Imported: ${score}% (${examData.grade}/20)`);
      success++;
      
    } catch (error) {
      console.error(`   ❌ Failed: ${error.message}`);
      failed++;
    }
    
    await delay(100);
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 IMPORT SUMMARY`);
  console.log(`${'='.repeat(60)}`);
  console.log(`✅ Successfully imported: ${success}`);
  console.log(`❌ Failed: ${failed}`);
  
  if (notFound.length > 0 && notFound.length <= 20) {
    console.log(`\n⚠️ Students not found in Firebase:`);
    notFound.forEach(u => console.log(`   - ${u}`));
  } else if (notFound.length > 20) {
    console.log(`\n⚠️ ${notFound.length} students not found in Firebase`);
  }
  
  console.log(`${'='.repeat(60)}`);
}

importExamsSimple().then(() => process.exit());