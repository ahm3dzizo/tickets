import * as pdfjsLib from 'pdfjs-dist';
import PdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = PdfWorkerUrl;

export interface ParsedTicketRow {
  ticketId: string;
  refNumber: string;
  clientName: string;
  date: string;
  daysOpen: string;
  description: string;
  priority: string;
  assigneeName: string;
}

export type PdfParseProgress = (done: number, total: number) => void;

// ─── Unicode RTL/LTR control characters ─────────────────────────────────────
const RTL_MARKS = /[‎‏‪-‮⁦-⁩​-‍﻿­]/g;

// ─── Date pattern ────────────────────────────────────────────────────────────
const DATE_RE = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;

// ─── Days+supervisor suffix at end of text ───────────────────────────────────
// e.g.  "...جاري 12 أحمد محمد"  → daysOpen=12, assigneeName="أحمد محمد"
const DAYS_SUFFIX_RE = /\s(\d{1,3})\s+([؀-ۿ][^\d\n]{2,40})$/;

// ─── Standalone last-line days+supervisor ────────────────────────────────────
// e.g.  "12 أحمد طاهر" alone on a line
const STANDALONE_DAY_RE = /^(\d{1,3})\s+([؀-ۿ].{2,40})$/;

// ────────────────────────────────────────────────────────────────────────────
// Parse structured NTF-format text (works for both pdfjs and OCR output)
// ────────────────────────────────────────────────────────────────────────────
function parseNtfText(rawText: string): ParsedTicketRow[] {
  // Strip RTL marks that may break NTF- pattern matching
  const text = rawText.replace(RTL_MARKS, '');

  // Merge split NTF sequences like "NTF- 3 59" → "NTF-359"
  const cleaned = text
    .replace(/NTF-\s*(\d)/gi, 'NTF-$1')
    .replace(/N\s*T\s*F\s*-\s*(\d)/gi, 'NTF-$1'); // handle "N T F-359"

  const rows: ParsedTicketRow[] = [];
  const seen = new Set<string>();
  const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // A ticket starts when we find NTF-XXX on the line
    const ntfMatch = line.match(/NTF-(\d{2,4})/i);
    if (!ntfMatch) continue;

    const refNum  = 'NTF-' + ntfMatch[1];
    const villaNum = ntfMatch[1];         // "359" not "NTF-359"

    // ── ticket ID: 5-6 digit number on same line OR previous line ────────────
    let ticketId = '';
    const idOnLine = line.match(/\b(\d{5,6})\b/);
    if (idOnLine) {
      ticketId = idOnLine[1];
    } else if (i > 0) {
      const prev = lines[i - 1];
      const prevId = prev.match(/^(\d{5,6})$/);
      if (prevId) ticketId = prevId[1];
    }

    // ── date: on same line ───────────────────────────────────────────────────
    const dateMatch = DATE_RE.exec(line);
    const date = dateMatch ? dateMatch[0] : '';

    // ── client name: text between NTF-XXX and date on same line ─────────────
    let clientName = '';
    const ntfEnd = line.indexOf(refNum) + refNum.length;
    const afterNtf = line.slice(ntfEnd).trim();
    if (date) {
      const di = afterNtf.indexOf(date);
      if (di > 0) clientName = afterNtf.slice(0, di).trim();
      else if (di === 0) clientName = '';
      else clientName = afterNtf.slice(0, 50).trim();
    } else {
      // No date on NTF line — might be on next line
      if (i + 1 < lines.length) {
        const nxtDateMatch = DATE_RE.exec(lines[i + 1]);
        if (nxtDateMatch) {
          // date found on next line, so afterNtf might be the name
          clientName = afterNtf || lines[i + 1].slice(0, lines[i + 1].indexOf(nxtDateMatch[0])).trim();
          // skip that next line since we consumed name+date
          i++;
        } else {
          clientName = afterNtf.slice(0, 50).trim();
        }
      } else {
        clientName = afterNtf.slice(0, 50).trim();
      }
    }

    // ── description lines: until next NTF or next 5-6 digit ticket ID ────────
    const descLines: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const nxt = lines[j];
      if (/NTF-\d+/i.test(nxt)) break;               // next ticket
      if (/^\d{5,6}$/.test(nxt)) break;               // standalone ticket ID
      if (/^\d{5,6}\s/.test(nxt) && /NTF-\d+/i.test(lines[j] ?? '')) break;
      descLines.push(nxt);
    }

    // ── extract daysOpen + assigneeName ──────────────────────────────────────
    let daysOpen     = '';
    let assigneeName = '';
    let description  = '';

    if (descLines.length > 0) {
      // Try standalone last line first: "12 أحمد محمد"
      const lastLine = descLines[descLines.length - 1];
      const standaloneM = STANDALONE_DAY_RE.exec(lastLine);
      if (standaloneM && Number(standaloneM[1]) <= 365) {
        daysOpen     = standaloneM[1];
        assigneeName = standaloneM[2].trim();
        description  = descLines.slice(0, -1).join(' ').trim();
      } else {
        // Try suffix pattern in joined text
        const combined = descLines.join(' ');
        const suffixM  = DAYS_SUFFIX_RE.exec(combined);
        if (suffixM && Number(suffixM[1]) <= 365) {
          daysOpen     = suffixM[1];
          assigneeName = suffixM[2].trim();
          description  = combined.slice(0, suffixM.index).trim();
        } else {
          description = descLines.join(' ').trim();
        }
      }
    }

    // Remove stray Latin OCR artifacts from description
    description = description
      .replace(/[a-zA-Z]{3,}/g, '')   // long Latin runs (OCR noise)
      .replace(/\s{2,}/g, ' ')
      .trim();

    const key = refNum + '|' + ticketId;
    if (!seen.has(key)) {
      seen.add(key);
      rows.push({
        ticketId,
        refNumber: villaNum,
        clientName,
        date,
        daysOpen,
        description: description || '[' + refNum + ']',
        assigneeName,
        priority: '',
      });
    }
  }

  return rows;
}

// ────────────────────────────────────────────────────────────────────────────
// Extract plain text from every PDF page using pdfjs (no OCR)
// Groups items by Y-coordinate into visual lines, sorted RTL
// ────────────────────────────────────────────────────────────────────────────
async function extractPdfjsText(
  pdf: pdfjsLib.PDFDocumentProxy,
  onPage?: (p: number, total: number) => void,
): Promise<string> {
  let allText = '';
  const total = pdf.numPages;

  for (let p = 1; p <= total; p++) {
    onPage?.(p, total);
    const page    = await pdf.getPage(p);
    const content = await page.getTextContent();

    // Collect items with position
    const items: { str: string; x: number; y: number }[] = [];
    for (const it of content.items) {
      if (!('str' in it)) continue;
      const raw = (it as any).str.replace(RTL_MARKS, '').trim();
      if (!raw) continue;
      items.push({
        str: raw,
        x:   Math.round((it as any).transform[4]),
        y:   Math.round((it as any).transform[5]),
      });
    }

    // Group by Y (tolerance = 5 px)
    const lineMap = new Map<number, typeof items>();
    for (const it of items) {
      let matched = false;
      for (const [ky] of lineMap) {
        if (Math.abs(ky - it.y) <= 5) {
          lineMap.get(ky)!.push(it);
          matched = true;
          break;
        }
      }
      if (!matched) lineMap.set(it.y, [it]);
    }

    // Sort lines top→bottom (PDF Y increases upward, so invert)
    // Within each line sort right→left (Arabic RTL)
    const lines = [...lineMap.entries()]
      .sort(([a], [b]) => b - a)
      .map(([, its]) =>
        its
          .sort((a, b) => b.x - a.x)
          .map(i => i.str)
          .join(' ')
          .trim(),
      )
      .filter(Boolean);

    allText += lines.join('\n') + '\n';
  }

  return allText;
}

// ────────────────────────────────────────────────────────────────────────────
// Server OCR fallback (for scanned/image PDFs)
// ────────────────────────────────────────────────────────────────────────────
async function tryServerOcr(
  file: File,
  onProgress?: PdfParseProgress,
): Promise<ParsedTicketRow[]> {
  onProgress?.(0, 1);
  const token    = localStorage.getItem('retal_auth_token') || localStorage.getItem('token') || '';
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/ocr/extract-pdf', {
    method:  'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body:    formData,
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error('OCR server error: ' + err);
  }
  const json    = await response.json();
  const rawData = json.results || json;
  let combined  = '';
  if (Array.isArray(rawData)) {
    combined = rawData.map(r => (typeof r === 'string' ? r : JSON.stringify(r))).join('\n');
  } else {
    combined = typeof rawData === 'string' ? rawData : JSON.stringify(rawData);
  }

  onProgress?.(1, 1);
  return parseNtfText(combined);
}

// ────────────────────────────────────────────────────────────────────────────
// Main export
// ────────────────────────────────────────────────────────────────────────────
export async function parsePdfTickets(
  file: File,
  onProgress?: PdfParseProgress,
): Promise<ParsedTicketRow[]> {
  const buffer = await file.arrayBuffer();
  const pdf    = await pdfjsLib.getDocument({ data: buffer }).promise;
  const total  = pdf.numPages;

  // ── Step 1: direct text extraction via pdfjs ──────────────────────────────
  // Best for computer-generated PDFs (preserves NTF-XXX exactly, no OCR noise)
  const rawText = await extractPdfjsText(pdf, (p, t) => onProgress?.(p - 1, t));
  const rows    = parseNtfText(rawText);

  if (rows.length > 0) {
    onProgress?.(total, total);
    return rows;
  }

  // ── Step 2: server OCR fallback (for scanned/image PDFs) ─────────────────
  console.warn('[pdfParser] pdfjs found 0 tickets — falling back to server OCR');
  return tryServerOcr(file, onProgress);
}
