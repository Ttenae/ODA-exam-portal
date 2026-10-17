// convert-exams.js - Convert your exam data to Firebase format
const XLSX = require('xlsx');
const fs = require('fs');

// Read the Excel file
const workbook = XLSX.readFile('./exam_results.xlsx');
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet);

console.log(`📖 Found ${rows.length} student records\n`);

// Array to store converted exam data
const convertedExams = [];

// For each student row
for (const row of rows) {
    const username = row.Username;
    const firstName = row['First name'];
    const lastName = row['Last name'];
    const fullName = `${firstName} ${lastName}`;
    const grade = parseFloat(row['Grade/20.00']) || 0;
    const score = (grade / 20) * 100; // Convert to percentage
    
    // Get responses (Response 1 to Response 16)
    const responses = [];
    for (let i = 1; i <= 16; i++) {
        const response = row[`Response ${i}`];
        if (response !== undefined && response !== null && response !== '') {
            responses.push(response);
        }
    }
    
    // Skip if no username or no responses
    if (!username || responses.length === 0) continue;
    
    // Create exam data structure
    const examData = {
        exam_id: `EXAM_${new Date().toISOString().slice(0, 10)}`,
        exam_title: "Oromo Language Exam",
        student_username: username,
        student_name: fullName,
        grade: grade,
        score: Math.round(score),
        status: row.Status,
        started: row.Started,
        completed: row.Completed || null,
        duration: row.Duration,
        responses: responses,
        convertedAt: new Date().toISOString()
    };
    
    convertedExams.push(examData);
}

console.log(`✅ Converted ${convertedExams.length} student records\n`);

// Save to JSON for reference
fs.writeFileSync('./converted_exams.json', JSON.stringify(convertedExams, null, 2));
console.log(`💾 Saved to converted_exams.json`);

// Create Excel file in the format expected by teacher portal
const teacherFormatData = [];

for (const exam of convertedExams) {
    // For each response, create a row
    for (let i = 0; i < exam.responses.length; i++) {
        // You'll need to define questions based on your exam
        // This is a sample - adjust questions according to your actual exam
        const questionNumber = i + 1;
        const isCorrect = exam.responses[i]?.includes('true') || exam.responses[i]?.includes('True');
        
        teacherFormatData.push({
            exam_id: exam.exam_id,
            exam_title: exam.exam_title,
            student_username: exam.student_username,
            question: `Question ${questionNumber}`,
            student_answer: exam.responses[i] || '',
            correct_answer: isCorrect ? 'True' : 'False', // Adjust based on your answer key
            is_correct: isCorrect,
            score: exam.score
        });
    }
}

// Save to Excel for teacher upload
const ws = XLSX.utils.json_to_sheet(teacherFormatData);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Exam Results');
XLSX.writeFile(wb, 'teacher_exam_upload.xlsx');

console.log(`📊 Created teacher_exam_upload.xlsx with ${teacherFormatData.length} rows`);
console.log(`\n📋 Sample data for ${convertedExams[0]?.student_username}:`);
console.log(`   Score: ${convertedExams[0]?.score}%`);
console.log(`   Responses: ${convertedExams[0]?.responses.length}`);