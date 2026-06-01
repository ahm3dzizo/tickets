import * as XLSX from 'xlsx';

function normalize(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, '');
}

function autoMatch(columns: string[], aliases: string[]): string {
  for (const alias of aliases) {
    const na = normalize(alias);
    const found = columns.find(c => {
      const nc = normalize(c);
      return nc === na || nc.includes(na) || na.includes(nc);
    });
    if (found) return found;
  }
  return '';
}

export interface FieldDef {
  key: string;
  label: string;
  aliases: string[];
}

self.onmessage = (e: MessageEvent<{ buffer: ArrayBuffer; fieldDefs: FieldDef[] }>) => {
  try {
    const { buffer, fieldDefs } = e.data;
    const wb = XLSX.read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];

    // Find the best header row
    const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];
    if (rawRows.length === 0) {
      self.postMessage({ error: 'الملف فارغ أو لا يحتوي على بيانات' });
      return;
    }

    let headerRowIndex = 0;
    let maxMatches = -1;
    let maxCols = -1;

    for (let i = 0; i < Math.min(5, rawRows.length); i++) {
      const cols = rawRows[i].map(c => String(c).trim());
      let matches = 0;
      let nonEmptyCols = cols.filter(c => c !== '').length;

      for (const fd of fieldDefs) {
        if (autoMatch(cols, fd.aliases)) matches++;
      }

      if (matches > maxMatches) {
        maxMatches = matches;
        maxCols = nonEmptyCols;
        headerRowIndex = i;
      } else if (matches === maxMatches && maxMatches === 0) {
        if (nonEmptyCols > maxCols) {
          maxCols = nonEmptyCols;
          headerRowIndex = i;
        }
      }
    }

    const data = XLSX.utils.sheet_to_json(ws, { range: headerRowIndex, defval: '' });
    if (data.length === 0) {
      self.postMessage({ error: 'الملف فارغ أو لا يحتوي على بيانات' });
      return;
    }

    const cols = Object.keys(data[0] as object);
    const autoMapping: Record<string, string> = {};
    for (const fd of fieldDefs) {
      autoMapping[fd.key] = autoMatch(cols, fd.aliases);
    }

    self.postMessage({ success: true, data, cols, autoMapping });
  } catch (err: any) {
    self.postMessage({ error: err.message || 'فشل في قراءة الملف.' });
  }
};
