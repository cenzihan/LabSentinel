/**
 * One-time script: convert data/safe.pdf → data/safe.txt
 * Usage: node scripts/pdf-to-txt.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDF_PATH = path.resolve(__dirname, '..', 'data', 'safe.pdf');
const TXT_PATH = path.resolve(__dirname, '..', 'data', 'safe.txt');

async function main() {
  if (!fs.existsSync(PDF_PATH)) {
    console.error(`PDF not found: ${PDF_PATH}`);
    process.exit(1);
  }

  const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
  const buffer = fs.readFileSync(PDF_PATH);
  const data = await pdfParse(buffer);
  let text = data.text || '';

  // Clean up PDF extraction artifacts
  // Remove form-feed / page-break characters
  text = text.replace(/\f/g, '\n');
  // Collapse runs of whitespace (spaces/tabs) within lines into single space
  text = text.replace(/[^\S\n]+/g, ' ');
  // Remove spaces between consecutive CJK characters
  text = text.replace(/([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g, '$1$2');
  text = text.replace(/([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g, '$1$2');
  // Collapse 3+ newlines into 2
  text = text.replace(/\n{3,}/g, '\n\n');
  // Trim each line
  text = text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0).join('\n');

  fs.writeFileSync(TXT_PATH, text, 'utf-8');
  console.log(`Converted ${PDF_PATH} → ${TXT_PATH} (${text.length} chars)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
