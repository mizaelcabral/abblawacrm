const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function testModel(modelName) {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Diga apenas OK se você receber isso.' }] }]
        }),
      }
    );
    const data = await response.json();
    console.log(`Model ${modelName} -> Status: ${response.status}`);
    if (!response.ok) {
      console.log(`Error:`, data.error?.message);
    } else {
      console.log(`Reply:`, data.candidates?.[0]?.content?.parts?.[0]?.text?.trim());
    }
  } catch (err) {
    console.error(`Exception for ${modelName}:`, err);
  }
}

async function main() {
  const models = [
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest',
    'gemini-1.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-pro'
  ];
  for (const model of models) {
    await testModel(model);
  }
}

main();
