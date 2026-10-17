// import-exams.js
const admin = require('firebase-admin');
const XLSX = require('xlsx');

const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

function readExcel(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(worksheet);
}

async function importExams() {
  const exams = readExcel('./exams.xlsx');
  console.log(`📖 Found ${exams.length} exam records\n`);
  
  // Group by student and exam
  const grouped = {};
  
  for (const record of exams) {
    const key = `${record.student_username}_${record.exam_id}`;
    if (!grouped[key]) {
      grouped[key] = {
        examId: record.exam_id,
        examTitle: record.exam_title,
        studentUsername: record.student_username,
        questions: [],
        totalScore: 0
      };
    }
    grouped[key].questions.push({
      question: record.question,
      studentAnswer: record.student_answer,
      correctAnswer: record.correct_answer,
      isCorrect: record.is_correct === true || record.is_correct === 'true'
    });
    grouped[key].totalScore = record.score || 0;
  }
  
  // Save to Firestore
  for (const [key, examData] of Object.entries(grouped)) {
    // Get student UID from username
    const usernameDoc = await db.collection('usernames').doc(examData.studentUsername.toLowerCase()).get();
    if (!usernameDoc.exists) {
      console.log(`❌ Student not found: ${examData.studentUsername}`);
      continue;
    }
    
    const studentUid = usernameDoc.data().uid;
    
    // Save exam result
    await db.collection('results').doc(`${studentUid}_${examData.examId}`).set({
      studentId: studentUid,
      studentUsername: examData.studentUsername,
      examId: examData.examId,
      examTitle: examData.examTitle,
      score: examData.totalScore,
      totalQuestions: examData.questions.length,
      questions: examData.questions,
      date: new Date().toISOString(),
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ Saved: ${examData.studentUsername} - ${examData.examTitle} (Score: ${examData.totalScore})`);
  }
  
  console.log('\n📊 Import Complete!');
}

importExams().then(() => process.exit());