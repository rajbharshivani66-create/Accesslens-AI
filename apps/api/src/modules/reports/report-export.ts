import type { ReportFinding } from './report.repository.js';

const columns: Array<keyof ReportFinding> = ['id', 'project', 'severity', 'status', 'title', 'ruleId', 'wcag', 'pageUrl', 'createdAt'];
function csvCell(value: unknown): string {
  let text = value instanceof Date ? value.toISOString() : String(value ?? '');
  if (/^[\s\u0000-\u001f]*[=+@\-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function findingsCsv(rows: ReportFinding[]): string {
  return [columns.join(','), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(','))].join('\r\n');
}

function pdfEscape(value: string): string {
  return value.normalize('NFKD').replace(/[^\x20-\x7e]/g, '?').replace(/[\\()]/g, '\\$&');
}
export function findingsPdf(rows: ReportFinding[]): Buffer {
  const lines = ['AccessLens AI — Accessibility Findings Report', `Generated ${new Date().toISOString()}`, `Findings: ${rows.length}`, '', ...rows.flatMap((row, i) => [
    `${i + 1}. [${row.severity} / ${row.status}] ${row.title}`,
    `   Project: ${row.project} | Rule: ${row.ruleId} | WCAG: ${row.wcag ?? 'Unmapped'}`,
    `   Page: ${row.pageUrl ?? 'Not recorded'} | Created: ${row.createdAt.toISOString()}`, ''
  ])];
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += 48) pages.push(lines.slice(i, i + 48));
  if (!pages.length) pages.push(['No findings in the selected scope.']);
  const objects: string[] = [];
  const pageRefs = pages.map((_, index) => 4 + index * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageRefs.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  pages.forEach((page, index) => {
    const pageId = pageRefs[index]!; const contentId = pageId + 1;
    const stream = `BT /F1 9 Tf 45 795 Td 12 TL ${page.map((line) => `(${pdfEscape(line)}) Tj T*`).join(' ')} ET`;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream`;
  });
  let output = '%PDF-1.4\n'; const offsets = [0];
  for (let i = 1; i < objects.length; i++) { offsets[i] = Buffer.byteLength(output, 'ascii'); output += `${i} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref = Buffer.byteLength(output, 'ascii');
  output += `xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output, 'ascii');
}
