const fs = require('fs');
const path = require('path');

let knowledgeBase = '';

function loadKnowledgeBase() {
  const kbPath = path.join(__dirname, 'jadran_solar_kb.txt');
  if (fs.existsSync(kbPath)) {
    knowledgeBase = fs.readFileSync(kbPath, 'utf-8');
    console.log('Knowledge base loaded successfully.');
  } else {
    console.warn('Knowledge base file not found at:', kbPath);
  }
}

function getKnowledgeBase() {
  return knowledgeBase;
}

loadKnowledgeBase();

module.exports = { getKnowledgeBase };
