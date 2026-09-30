/**
 * PDF export of the energy table. jsPDF is loaded only when a user exports,
 * so the dashboard bundle doesn't grow.
 */
export interface PdfReport {
  filename: string
  title: string
  /** Lines under the title: site, period, time zone, generated at. */
  meta: string[]
  head: string[]
  body: string[][]
  foot: string[]
  note: string
  pageLabel: (page: number, pages: number) => string
}

/** Characters outside the PDF core fonts (narrow/no-break spaces, true minus) → plain equivalents. */
export const pdfText = (s: string) => s.replace(/[\u202f\u00a0]/g, ' ').replace(/\u2212/g, '-')

export async function exportPdf(r: PdfReport) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 36

  // Brand header.
  doc.setFillColor(222, 175, 11)
  doc.rect(0, 0, W, 6, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(150, 118, 5)
  doc.text('CARBONOZ', M, 30)
  doc.setFontSize(17)
  doc.setTextColor(15, 23, 42)
  doc.text(pdfText(r.title), M, 52)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(90, 102, 122)
  r.meta.forEach((line, i) => doc.text(pdfText(line), M, 70 + i * 13))

  const numeric = Object.fromEntries(r.head.slice(1).map((_, i) => [i + 1, { halign: 'right' as const }]))
  autoTable(doc, {
    startY: 70 + r.meta.length * 13 + 10,
    margin: { left: M, right: M, bottom: 44 },
    head: [r.head.map(pdfText)],
    body: r.body.map((row) => row.map(pdfText)),
    foot: [r.foot.map(pdfText)],
    showFoot: 'lastPage',
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: { top: 5, bottom: 5, left: 6, right: 6 }, textColor: [30, 41, 59], lineColor: [226, 232, 240], lineWidth: { bottom: 0.5 } },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: numeric,
    didParseCell: (data) => {
      if (data.section !== 'body') return
      // Muted dashes for missing values.
      if (data.cell.raw === '—' || data.cell.raw === '-') data.cell.styles.textColor = [148, 163, 184]
    },
  })

  // Method note and page numbers.
  const end = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  doc.setFontSize(7.5)
  doc.setTextColor(100, 116, 139)
  const note = doc.splitTextToSize(pdfText(r.note), W - 2 * M)
  if (end + 16 + note.length * 10 > H - 44) doc.addPage()
  const y = end + 16 + note.length * 10 > H - 44 ? 40 : end + 16
  doc.text(note, M, y)
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFontSize(7.5)
    doc.setTextColor(148, 163, 184)
    doc.text(pdfText(r.pageLabel(p, pages)), W - M, H - 20, { align: 'right' })
    doc.text('carbonoz.com', M, H - 20)
  }
  doc.save(r.filename)
}
