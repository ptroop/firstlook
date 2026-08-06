// Generates a minimal, valid PDF with two lines of extractable text.
// Used by scripts/pdf-smoke-test.mjs to verify the vendored pdf.js pipeline.
import { writeFile } from 'node:fs/promises';

function escapePdfString(value) {
  return `(${value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')})`;
}

function buildPdf(lines) {
  const objects = [null];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
  objects[3] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>';
  objects[5] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  const content = lines
    .map((text, index) => {
      const y = 720 - index * 24;
      return `BT /F1 12 Tf 72 ${y} Td ${escapePdfString(text)} Tj ET`;
    })
    .join('\n');
  objects[4] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;

  const header = '%PDF-1.4\n';
  const chunks = [];
  const offsets = [0];
  let cursor = Buffer.byteLength(header, 'utf8');
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = cursor;
    const chunk = `${index} 0 obj\n${objects[index]}\nendobj\n`;
    chunks.push(chunk);
    cursor += Buffer.byteLength(chunk, 'utf8');
  }
  const xrefStart = cursor;
  const entries = objects.slice(1).map((_, index) => `${String(offsets[index + 1]).padStart(10, '0')} 00000 n \n`).join('');
  const tail = `xref\n0 ${objects.length}\n0000000000 65535 f \n${entries}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return header + chunks.join('') + tail;
}

const lines = ['Finance Analyst', 'MBA Finance 2026, Excel SQL Bloomberg'];
await writeFile(new URL('./sample-resume.pdf', import.meta.url), buildPdf(lines), 'utf8');
console.log('Wrote scripts/sample-resume.pdf');
