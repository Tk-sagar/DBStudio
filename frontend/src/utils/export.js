/**
 * Derive ordered column headers from rows + optional fields array.
 * fields: [{ name }] from query results, or undefined for table data.
 */
function getHeaders(rows, fields) {
  if (fields?.length > 0) return fields.map(f => f.name);
  if (rows?.length > 0) return Object.keys(rows[0]);
  return [];
}

/** Trigger a file download in the browser */
function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Export rows as a CSV file */
export function exportCsv(rows, fields, filename = 'export') {
  const headers = getHeaders(rows, fields);
  if (!headers.length) return;

  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    // Wrap in quotes if it contains comma, quote, or newline
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  const lines = [
    headers.map(escape).join(','),
    ...rows.map(row => headers.map(h => escape(row[h])).join(',')),
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  download(blob, `${filename}.csv`);
}

/** Export rows as an Excel (.xlsx) file — xlsx loaded on demand */
export async function exportExcel(rows, fields, filename = 'export') {
  const headers = getHeaders(rows, fields);
  if (!headers.length) return;

  const XLSX = await import('xlsx');

  const sheetData = [
    headers,
    ...rows.map(row => headers.map(h => row[h] ?? '')),
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Auto column widths based on content
  const colWidths = headers.map((h) => {
    const maxLen = Math.max(
      h.length,
      ...rows.slice(0, 100).map(r => String(r[h] ?? '').length)
    );
    return { wch: Math.min(Math.max(maxLen + 2, 8), 50) };
  });
  ws['!cols'] = colWidths;

  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}
