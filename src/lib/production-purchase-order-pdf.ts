import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type ProductionPurchaseOrderPdfData = {
  orderNo: string;
  status: string;
  createdAt: Date | string;
  expectedAt: Date | string | null;
  notes: string;
  company: {
    name: string;
    country: string;
    contactEmail: string;
    contactPhone: string;
    address: string;
  };
  supplier: {
    code: string;
    name: string;
    contactPerson: string | null;
    email: string | null;
    address: string | null;
  };
  lines: Array<{
    orderedQty: string;
    material: { code: string; name: string; unit: string };
  }>;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 44;
const INK = rgb(0.09, 0.18, 0.27);
const MUTED = rgb(0.31, 0.4, 0.49);
const RULE = rgb(0.82, 0.87, 0.91);
const ROW_TINT = rgb(0.95, 0.97, 0.98);
const ACCENT = rgb(0.08, 0.39, 0.57);

function pdfText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x20-\x7e\u00a0-\u00ff]/g, "?");
}

function formatPdfDate(value: Date | string | null) {
  if (!value) return "Not specified";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not specified"
    : date.toLocaleDateString("en-GB", { timeZone: "UTC" });
}

function truncateToWidth(value: string, font: PDFFont, size: number, width: number) {
  let text = pdfText(value);
  while (text && font.widthOfTextAtSize(`${text}...`, size) > width) {
    text = text.slice(0, -1);
  }
  return text === pdfText(value) ? text : `${text}...`;
}

function wrapText(value: string, font: PDFFont, size: number, width: number) {
  const words = pdfText(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = truncateToWidth(word, font, size, width);
  }

  if (line) lines.push(line);
  return lines;
}

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color = INK,
) {
  page.drawText(pdfText(text), { x, y, font, size, color });
}

function drawWrappedText(
  page: PDFPage,
  value: string,
  x: number,
  y: number,
  width: number,
  font: PDFFont,
  size: number,
  color = INK,
  lineHeight = 13,
) {
  const lines = value.split(/\r?\n/).flatMap((line) => wrapText(line, font, size, width));
  lines.forEach((line, index) => drawText(page, line, x, y - index * lineHeight, font, size, color));
  return y - lines.length * lineHeight;
}

function drawFirstPageHeader(
  page: PDFPage,
  data: ProductionPurchaseOrderPdfData,
  regularFont: PDFFont,
  boldFont: PDFFont,
) {
  drawText(page, "PURCHASE ORDER", MARGIN, 785, boldFont, 22, ACCENT);
  const orderNo = pdfText(data.orderNo);
  page.drawText(orderNo, {
    x: PAGE_WIDTH - MARGIN - boldFont.widthOfTextAtSize(orderNo, 11),
    y: 792,
    font: boldFont,
    size: 11,
    color: INK,
  });
  page.drawLine({
    start: { x: MARGIN, y: 772 },
    end: { x: PAGE_WIDTH - MARGIN, y: 772 },
    thickness: 1,
    color: RULE,
  });

  drawText(page, "ORDER DATE", MARGIN, 748, boldFont, 8, MUTED);
  drawText(page, formatPdfDate(data.createdAt), MARGIN, 732, regularFont, 10);
  drawText(page, "EXPECTED DELIVERY", 188, 748, boldFont, 8, MUTED);
  drawText(page, formatPdfDate(data.expectedAt), 188, 732, regularFont, 10);
  drawText(page, "STATUS", 360, 748, boldFont, 8, MUTED);
  drawText(page, data.status.replaceAll("_", " "), 360, 732, regularFont, 10);

  drawText(page, "SUPPLIER", MARGIN, 699, boldFont, 8, MUTED);
  let supplierY = 680;
  supplierY = drawWrappedText(
    page,
    data.supplier.name,
    MARGIN,
    supplierY,
    225,
    boldFont,
    11,
  );
  supplierY = drawWrappedText(
    page,
    [data.supplier.code, data.supplier.contactPerson, data.supplier.email, data.supplier.address]
      .filter((value): value is string => Boolean(value?.trim()))
      .join("\n"),
    MARGIN,
    supplierY - 2,
    225,
    regularFont,
    9,
    MUTED,
  );

  drawText(page, "ORDERED BY", 320, 699, boldFont, 8, MUTED);
  let companyY = 680;
  companyY = drawWrappedText(page, data.company.name, 320, companyY, 230, boldFont, 11);
  companyY = drawWrappedText(
    page,
    [data.company.address, data.company.country, data.company.contactPhone, data.company.contactEmail]
      .filter((value) => Boolean(value.trim()))
      .join("\n"),
    320,
    companyY - 2,
    230,
    regularFont,
    9,
    MUTED,
  );

  return Math.min(supplierY, companyY) - 22;
}

function drawContinuationHeader(page: PDFPage, orderNo: string, boldFont: PDFFont) {
  drawText(page, "PURCHASE ORDER - CONTINUED", MARGIN, 785, boldFont, 16, ACCENT);
  const safeOrderNo = pdfText(orderNo);
  page.drawText(safeOrderNo, {
    x: PAGE_WIDTH - MARGIN - boldFont.widthOfTextAtSize(safeOrderNo, 11),
    y: 790,
    font: boldFont,
    size: 11,
    color: INK,
  });
}

function drawTableHeader(page: PDFPage, y: number, boldFont: PDFFont) {
  page.drawRectangle({
    x: MARGIN,
    y: y - 7,
    width: PAGE_WIDTH - MARGIN * 2,
    height: 24,
    color: ACCENT,
  });
  drawText(page, "CODE", MARGIN + 9, y, boldFont, 8, rgb(1, 1, 1));
  drawText(page, "MATERIAL", MARGIN + 94, y, boldFont, 8, rgb(1, 1, 1));
  drawText(page, "QUANTITY", PAGE_WIDTH - 141, y, boldFont, 8, rgb(1, 1, 1));
  drawText(page, "UNIT", PAGE_WIDTH - 73, y, boldFont, 8, rgb(1, 1, 1));
}

function formatQuantity(value: string) {
  const quantity = Number(value);
  return Number.isFinite(quantity)
    ? quantity.toLocaleString("en-KE", { maximumFractionDigits: 3 })
    : value;
}

export async function generateProductionPurchaseOrderPdf(
  data: ProductionPurchaseOrderPdfData,
) {
  const document = await PDFDocument.create();
  document.setTitle(`Purchase order ${data.orderNo}`);
  document.setAuthor(data.company.name || "PackStudio");
  const regularFont = await document.embedFont(StandardFonts.Helvetica);
  const boldFont = await document.embedFont(StandardFonts.HelveticaBold);
  const linesPerPage = 25;
  const pageCount = Math.max(1, Math.ceil(data.lines.length / linesPerPage));
  let finalPage: PDFPage | undefined;
  let finalY = 0;

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    finalPage = page;
    let tableY = pageIndex === 0
      ? drawFirstPageHeader(page, data, regularFont, boldFont)
      : 748;
    if (pageIndex > 0) drawContinuationHeader(page, data.orderNo, boldFont);
    drawTableHeader(page, tableY, boldFont);
    tableY -= 28;

    const pageLines = data.lines.slice(
      pageIndex * linesPerPage,
      (pageIndex + 1) * linesPerPage,
    );
    pageLines.forEach((line, lineIndex) => {
      const rowY = tableY - lineIndex * 20;
      if (lineIndex % 2 === 1) {
        page.drawRectangle({
          x: MARGIN,
          y: rowY - 5,
          width: PAGE_WIDTH - MARGIN * 2,
          height: 19,
          color: ROW_TINT,
        });
      }
      drawText(page, line.material.code, MARGIN + 9, rowY, regularFont, 8);
      drawText(
        page,
        truncateToWidth(line.material.name, regularFont, 8, 278),
        MARGIN + 94,
        rowY,
        regularFont,
        8,
      );
      const quantity = formatQuantity(line.orderedQty);
      page.drawText(quantity, {
        x: PAGE_WIDTH - 141 - regularFont.widthOfTextAtSize(quantity, 8),
        y: rowY,
        font: regularFont,
        size: 8,
        color: INK,
      });
      drawText(page, line.material.unit, PAGE_WIDTH - 73, rowY, regularFont, 8);
    });

    finalY = tableY - pageLines.length * 20 - 12;
  }

  if (data.notes.trim() && finalPage) {
    let notesPage = finalPage;
    let notesY = finalY;
    if (notesY < 240) {
      notesPage = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      drawContinuationHeader(notesPage, data.orderNo, boldFont);
      notesY = 745;
    }
    drawText(notesPage, "NOTES", MARGIN, notesY, boldFont, 9, ACCENT);
    drawWrappedText(
      notesPage,
      data.notes.trim(),
      MARGIN,
      notesY - 17,
      PAGE_WIDTH - MARGIN * 2,
      regularFont,
      9,
      INK,
    );
  }

  const pages = document.getPages();
  pages.forEach((page, index) => {
    const label = `Page ${index + 1} of ${pages.length}`;
    page.drawText(label, {
      x: PAGE_WIDTH - MARGIN - regularFont.widthOfTextAtSize(label, 8),
      y: 24,
      font: regularFont,
      size: 8,
      color: MUTED,
    });
  });

  return document.save();
}
