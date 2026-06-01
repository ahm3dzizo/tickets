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

const GEMINI_KEY = (process as any).env?.GEMINI_API_KEY as string | undefined;

const GEMINI_PROMPT = `??? ??? ??? ????? ????? ????? ????? ???? RTL (?? ???? = ???? ?????).
?????? ?? ????? ????? ?? ???? ??????? ?????? ?? JSON array ???? ???? ?? ???????.
??? ????? ???? ??? ?????? ??????:
- ticketId, refNumber (??? NTF-123), clientName, date (d/M/yyyy), daysOpen (??? ???), description, assigneeName, priority
??? ?? JSON array ??? ???? ?? ?? ????? ?? markdown:
[{"ticketId":"...","refNumber":"...","clientName":"...","date":"...","daysOpen":"...","description":"...","assigneeName":"...","priority":"..."}]`;

async function renderPageToBase64(page: pdfjsLib.PDFPageProxy, scale = 1.2): Promise<string> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  // JPEG at 70% quality � good enough for Arabic text OCR
  return canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
}

/** Parse retryDelay string like "35s" or "35.123s" ? milliseconds */
function parseRetryDelayMs(err: any): number {
  try {
    const detail = err?.error?.details?.find((d: any) => d['@type']?.includes('RetryInfo'));
    const s = detail?.retryDelay ?? '';
    const secs = parseFloat(s);
    if (!isNaN(secs)) return Math.ceil(secs * 1000) + 2000; // +2s buffer
  } catch { /* ignore */ }
  return 60_000; // safe fallback: 1 min
}

function parseGeminiRows(text: string): ParsedTicketRow[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const rows = JSON.parse(match[0]) as any[];
    return rows
      .filter(r => r.refNumber && /NTF-\d+/i.test(r.refNumber))
      .map(r => ({
        ticketId:     String(r.ticketId     ?? '').trim(),
        refNumber:    String(r.refNumber    ?? '').trim(),
        clientName:   String(r.clientName   ?? '').trim(),
        date:         String(r.date         ?? '').trim(),
        daysOpen:     String(r.daysOpen     ?? '').replace(/\D/g, ''),
        description:  String(r.description  ?? '').trim(),
        assigneeName: String(r.assigneeName ?? '').trim(),
        priority:     String(r.priority     ?? '').replace(/\D/g, ''),
      }));
  } catch { return []; }
}

/** Send a batch of pages (max 3) in one Gemini request, with retry on 429 */
async function extractBatchWithGemini(
  pages: string[],
  geminiKey: string,
  attempt = 0,
): Promise<ParsedTicketRow[]> {
  const imageParts = pages.map(b64 => ({ inline_data: { mime_type: 'image/jpeg', data: b64 } }));
  const body = {
    contents: [{ parts: [{ text: GEMINI_PROMPT }, ...imageParts] }],
    generationConfig: { temperature: 0, maxOutputTokens: 8192 },
  };
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 429 && attempt < 5) {
      const waitMs = parseRetryDelayMs(err);
      // Log full quota violation details
      const violations = err?.error?.details?.find((d: any) => d['@type']?.includes('QuotaFailure'))?.violations ?? [];
      console.warn(`[pdfParser] 429 violations:`, violations.map((v: any) => v.quotaId).join(', '));
      console.warn(`[pdfParser] 429 � waiting ${Math.round(waitMs / 1000)}s then retry�`);
      await new Promise(r => setTimeout(r, waitMs));
      return extractBatchWithGemini(pages, geminiKey, attempt + 1);
    }
    throw new Error(`Gemini ${res.status}: ${JSON.stringify(err)}`);
  }
  const data = await res.json();
  const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return parseGeminiRows(text);
}

//  Regex fallback 

type RawItem = { text: string; x: number; y: number; w: number };

async function pageItems(page: pdfjsLib.PDFPageProxy): Promise<RawItem[]> {
  const c = await page.getTextContent();
  return c.items
    .filter(it => 'str' in it && (it as any).str.trim() !== '')
    .map(it => ({
      text: (it as any).str.trim(),
      x: Math.round(((it as any).transform as number[])[4]),
      y: Math.round(((it as any).transform as number[])[5]),
      w: Math.round((it as any).width ?? 0),
    }));
}

function groupIntoRows(items: RawItem[], yTol = 6): RawItem[][] {
  const buckets = new Map<number, RawItem[]>();
  for (const it of items) {
    let matched = false;
    for (const [ky] of buckets) {
      if (Math.abs(ky - it.y) <= yTol) { buckets.get(ky)!.push(it); matched = true; break; }
    }
    if (!matched) buckets.set(it.y, [it]);
  }
  return [...buckets.entries()].sort(([a], [b]) => b - a).map(([, row]) => row.sort((a, b) => b.x - a.x));
}

const HEADER_KEYWORDS = ['?????', '?????', '???', '?????', '????', '????', 'NTF', '?????', '????', '??????'];
const DATE_RE = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/;
const ASSIGNEE_PATTERNS = ['???? ???', 'Ahmed Mohamed', '????', '????', '????', '?????', '????'];

interface ColBounds { minX: number; maxX: number; name: string }

function detectColumns(headerRow: RawItem[]): ColBounds[] | null {
  const anchors = headerRow.filter(it => HEADER_KEYWORDS.some(kw => it.text.includes(kw)));
  if (anchors.length < 3) return null;
  anchors.sort((a, b) => b.x - a.x);
  return anchors.map((cur, i, arr) => ({
    name: cur.text,
    maxX: cur.x + (cur.w || 40) + 10,
    minX: arr[i + 1] ? arr[i + 1].x - 5 : 0,
  }));
}

function assignToCols(row: RawItem[], cols: ColBounds[]): string[] {
  const buckets = cols.map(() => [] as string[]);
  for (const it of row) {
    for (let c = 0; c < cols.length; c++) {
      if (it.x >= cols[c].minX && it.x <= cols[c].maxX) { buckets[c].push(it.text); break; }
    }
  }
  return buckets.map(b => b.join(' ').trim());
}

function parseRowRegex(rowText: string): ParsedTicketRow | null {
  const ntfMatch = rowText.match(/\bNTF-(\d{2,4})\b/);
  if (!ntfMatch) return null;
  const refNumber = ntfMatch[0];
  const idMatch = rowText.match(/\b(\d{5,6})\b/);
  const ticketId = idMatch ? idMatch[1] : '';
  const dateMatch = DATE_RE.exec(rowText);
  const date = dateMatch ? dateMatch[0] : '';
  const afterNtf = rowText.slice(rowText.indexOf(refNumber) + refNumber.length).trim();
  const clientRaw = date ? afterNtf.slice(0, afterNtf.indexOf(date)).trim() : afterNtf.slice(0, 60).trim();
  const clientName = clientRaw.replace(/\s+/g, ' ').trim();
  const afterDate = date ? afterNtf.slice(afterNtf.indexOf(date) + date.length).trim() : afterNtf;
  let assigneeName = '', descRaw = afterDate;
  for (const p of ASSIGNEE_PATTERNS) {
    const idx = descRaw.lastIndexOf(p);
    if (idx !== -1) { assigneeName = (p === '?????' || p === '????') ? '' : p; descRaw = descRaw.slice(0, idx).trim(); break; }
  }
  const priorityMatches = [...descRaw.matchAll(/(?<!\d)([1-9])(?!\d)/g)];
  const pm = priorityMatches.pop();
  let priority = '';
  if (pm) { priority = pm[1]; descRaw = (descRaw.slice(0, pm.index!) + descRaw.slice(pm.index! + 1)).replace(/\s+/g, ' ').trim(); }
  return { ticketId, refNumber, clientName, date, daysOpen: '', description: descRaw.trim(), priority, assigneeName };
}

async function parsePdfFallback(pdf: pdfjsLib.PDFDocumentProxy): Promise<ParsedTicketRow[]> {
  const results: ParsedTicketRow[] = [];
  const seen = new Set<string>();
  for (let p = 1; p <= pdf.numPages; p++) {
    const pg = await pdf.getPage(p);
    const items = await pageItems(pg);
    const rows = groupIntoRows(items);
    const headerRowIdx = rows.findIndex(r => r.some(it => HEADER_KEYWORDS.some(kw => it.text.includes(kw))));
    const cols = headerRowIdx >= 0 ? detectColumns(rows[headerRowIdx]) : null;
    let i = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;
    while (i < rows.length) {
      const rowItems = rows[i];
      const rowText = rowItems.map(r => r.text).join(' ');
      if (!/\bNTF-\d+\b/.test(rowText)) { i++; continue; }
      let parsed: ParsedTicketRow | null = null;
      if (cols) {
        const colValues = assignToCols(rowItems, cols);
        let descExtra = '';
        let j = i + 1;
        while (j < rows.length) {
          const nxt = rows[j].map(r => r.text).join(' ');
          if (/\bNTF-\d+\b/.test(nxt)) break;
          descExtra += ' ' + nxt; j++;
        }
        i = j;
        const byName: Record<string, string> = {};
        cols.forEach((c, idx) => { byName[c.name] = colValues[idx]; });
        const getNamed = (...keys: string[]) => {
          const found = Object.entries(byName).find(([n]) => keys.some(kw => n.includes(kw)));
          return found ? found[1] : '';
        };
        let assigneeName = getNamed('?????', '?????', '????');
        if (!assigneeName) {
          for (const p of ASSIGNEE_PATTERNS) {
            if (colValues.join(' ').includes(p) && p !== '?????' && p !== '????') { assigneeName = p; break; }
          }
        }
        let description = (getNamed('???', '????') + ' ' + descExtra).replace(/\s+/g, ' ').trim();
        const ntfMatch = rowText.match(/\bNTF-\d+\b/);
        const refNumber = ntfMatch ? ntfMatch[0] : '';
        const idMatch = rowText.match(/\b(\d{5,6})\b/);
        const ticketId = idMatch ? idMatch[1] : '';
        const dateMatch = DATE_RE.exec(rowText);
        const date = dateMatch ? dateMatch[0] : '';
        let daysOpen = getNamed('????', '??????', '???');
        if (!daysOpen) { const m = rowText.match(/\b([1-9]\d{1,2})\b/); if (m) daysOpen = m[1]; }
        daysOpen = daysOpen.replace(/\D/g, '');
        let clientName = getNamed('????', '?????');
        if (!clientName) {
          const afterNtf = rowText.slice(rowText.indexOf(refNumber) + refNumber.length).trim();
          clientName = date ? afterNtf.slice(0, afterNtf.indexOf(date)).trim() : afterNtf.slice(0, 60).trim();
        }
        const priority = getNamed('???', '??????', 'priority').match(/\b([1-9])\b/)?.[1] ?? '';
        if (refNumber) parsed = { ticketId, refNumber, clientName, date, daysOpen, description, priority, assigneeName };
      } else {
        let j = i + 1, combined = rowText;
        while (j < rows.length) {
          const nxt = rows[j].map(r => r.text).join(' ');
          if (/\bNTF-\d+\b/.test(nxt)) break;
          combined += ' ' + nxt; j++;
        }
        i = j;
        parsed = parseRowRegex(combined);
      }
      if (parsed) {
        const key = parsed.refNumber + parsed.ticketId;
        if (!seen.has(key)) { seen.add(key); results.push(parsed); }
      }
    }
  }
  return results;
}

// 
// Main export
// 

export async function parsePdfTickets(file: File, onProgress?: PdfParseProgress): Promise<ParsedTicketRow[]> {
  const formData = new FormData();
  formData.append('file', file);
  onProgress?.(0, 1);
  const token = localStorage.getItem('token');
  const response = await fetch('/api/ocr/extract-pdf', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error('Failed to extract PDF: ' + errorText);
  }
  const json = await response.json();
  onProgress?.(1, 1);
  const rawData = json.results || json;
  let combinedText = '';
  if (Array.isArray(rawData)) {
    combinedText = rawData.map(r => typeof r === 'string' ? r : JSON.stringify(r)).join('\n');
  } else {
    combinedText = typeof rawData === 'string' ? rawData : JSON.stringify(rawData);
  }
  const rows: ParsedTicketRow[] = [];
  const lines = combinedText.split('\n');
  const seen = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const rowText = lines[i];
    if (/\\bNTF-\\d+\\b/.test(rowText)) {
      let j = i + 1, combined = rowText;
      while (j < lines.length) {
        const nxt = lines[j];
        if (/\\bNTF-\\d+\\b/.test(nxt)) break;
        combined += ' ' + nxt; j++;
      }
      i = j - 1;
      const parsed = parseRowRegex(combined);
      if (parsed) {
        const key = parsed.refNumber + parsed.ticketId;
        if (!seen.has(key)) { seen.add(key); rows.push(parsed); }
      }
    }
  }
  return rows;
}
