import type { Border, Borders, Worksheet } from "exceljs";

export type ExcelColumn = {
  key: string;
  label: string;
  width?: number;
};

export type BrandedExcelExportOptions = {
  sectionTitle: string;
  sheetName?: string;
  fileName: string;
  columns: ExcelColumn[];
  rows: Record<string, unknown>[];
  subtitle?: string;
  filtersSummary?: string;
  exportedBy?: string;
};

const BRAND = {
  orgTitle: "مصرف الرافدين / مكتب مندوب الأنبار / الوحدة القانونية",
  green: "FF1A5C2A",
  greenLight: "FFE8F5E9",
  white: "FFFFFFFF",
  gray: "FF666666",
  border: "FFD1D5DB",
  zebra: "FFF9FAFB",
  font: "Arial",
};

function thinBorder(): Partial<Borders> {
  const side: Border = { style: "thin", color: { argb: BRAND.border } };
  return { top: side, left: side, bottom: side, right: side };
}

function styleHeaderBlock(
  ws: Worksheet,
  row: number,
  colCount: number,
  value: string,
  opts: { fill?: string; fontColor?: string; fontSize?: number; bold?: boolean },
) {
  ws.mergeCells(row, 1, row, colCount);
  const cell = ws.getCell(row, 1);
  cell.value = value;
  cell.font = {
    name: BRAND.font,
    size: opts.fontSize ?? 11,
    bold: opts.bold ?? false,
    color: { argb: opts.fontColor ?? BRAND.gray },
  };
  if (opts.fill) {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.fill } };
  }
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
}

export function mapRowsForExcel(
  items: Record<string, unknown>[],
  columns: ExcelColumn[],
): Record<string, unknown>[] {
  return items.map((item) => {
    const row: Record<string, unknown> = {};
    columns.forEach((col) => {
      row[col.key] = item[col.key] ?? "";
    });
    return row;
  });
}

export function brandedExcelFileName(slug: string): string {
  const safe = slug.replace(/[^\w\u0600-\u06FF-]+/g, "_").replace(/_+/g, "_");
  return `${safe}_${new Date().toISOString().slice(0, 10)}.xlsx`;
}

export async function exportBrandedExcel(options: BrandedExcelExportOptions): Promise<void> {
  const {
    sectionTitle,
    sheetName,
    fileName,
    columns,
    rows,
    subtitle,
    filtersSummary,
    exportedBy,
  } = options;

  if (!columns.length) {
    throw new Error("لا توجد أعمدة للتصدير");
  }

  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "الوحدة القانونية — مصرف الرافدين";
  workbook.created = new Date();

  const ws = workbook.addWorksheet((sheetName || sectionTitle).slice(0, 31), {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 5 }],
  });

  const colCount = columns.length;
  const dateStr = new Date().toLocaleDateString("ar-IQ");

  styleHeaderBlock(ws, 1, colCount, BRAND.orgTitle, {
    fill: BRAND.green,
    fontColor: BRAND.white,
    fontSize: 14,
    bold: true,
  });
  ws.getRow(1).height = 30;

  styleHeaderBlock(ws, 2, colCount, sectionTitle, {
    fill: BRAND.greenLight,
    fontColor: BRAND.green,
    fontSize: 12,
    bold: true,
  });
  ws.getRow(2).height = 24;

  const metaParts = [`تاريخ التصدير: ${dateStr}`, `عدد السجلات: ${rows.length}`];
  if (subtitle?.trim()) metaParts.push(subtitle.trim());
  if (filtersSummary?.trim()) metaParts.push(filtersSummary.trim());
  if (exportedBy?.trim()) metaParts.push(`المُصدّر: ${exportedBy.trim()}`);

  styleHeaderBlock(ws, 3, colCount, metaParts.join("  |  "), {
    fontSize: 10,
    fontColor: BRAND.gray,
  });
  ws.getRow(3).height = 20;

  ws.getRow(4).height = 8;

  const headerRow = ws.getRow(5);
  columns.forEach((col, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = col.label;
    cell.font = { name: BRAND.font, size: 11, bold: true, color: { argb: BRAND.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.green } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = thinBorder();
    ws.getColumn(index + 1).width = col.width ?? Math.min(42, Math.max(12, col.label.length + 6));
  });
  headerRow.height = 26;

  rows.forEach((row, rowIndex) => {
    const excelRow = ws.getRow(6 + rowIndex);
    columns.forEach((col, colIndex) => {
      const cell = excelRow.getCell(colIndex + 1);
      const value = row[col.key];
      cell.value = value == null ? "" : String(value);
      cell.font = { name: BRAND.font, size: 10 };
      cell.alignment = { horizontal: "right", vertical: "top", wrapText: true };
      cell.border = thinBorder();
      if (rowIndex % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.zebra } };
      }
    });
    excelRow.height = 20;
  });

  if (rows.length > 0) {
    ws.autoFilter = {
      from: { row: 5, column: 1 },
      to: { row: 5 + rows.length, column: colCount },
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}
