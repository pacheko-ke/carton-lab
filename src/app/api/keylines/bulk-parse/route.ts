import { auth } from "@/auth";
import { Workbook, type CellValue } from "exceljs";
import { NextResponse } from "next/server";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 501;
const MAX_COLUMNS = 100;

function cellValue(value: CellValue): string | number | boolean {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if ("formula" in value || "sharedFormula" in value) {
    throw new Error("Formulas are not supported. Replace them with values and upload again.");
  }
  if ("richText" in value) return value.richText.map((part) => part.text).join("");
  if ("text" in value) return value.text;
  throw new Error("The workbook contains unsupported cell values.");
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_FILE_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "Excel file must be 5 MB or smaller." }, { status: 413 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Could not read the uploaded file." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx")) {
    return NextResponse.json({ error: "Choose an Excel .xlsx file." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "Excel file must be 5 MB or smaller." }, { status: 413 });
  }

  const workbook = new Workbook();
  try {
    await workbook.xlsx.load(await file.arrayBuffer());
  } catch {
    return NextResponse.json(
      { error: "Could not read this Excel workbook. Make sure it is a valid .xlsx file." },
      { status: 400 },
    );
  }

  const worksheet = workbook.worksheets.find((sheet) => sheet.state === "visible")
    ?? workbook.worksheets[0];
  if (!worksheet) {
    return NextResponse.json({ error: "The workbook has no worksheets." }, { status: 400 });
  }

  const rows: Array<Array<string | number | boolean>> = [];
  try {
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      if (row.cellCount > MAX_COLUMNS) {
        throw new Error(`The worksheet cannot contain more than ${MAX_COLUMNS} columns.`);
      }
      const values = Array.from({ length: row.cellCount }, (_, index) =>
        cellValue(row.getCell(index + 1).value),
      );
      if (values.some((value) => value !== "")) rows.push(values);
      if (rows.length > MAX_ROWS) {
        throw new Error("The worksheet cannot contain more than 500 data rows.");
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not read worksheet values." },
      { status: 400 },
    );
  }

  return NextResponse.json({ rows }, { headers: { "Cache-Control": "no-store" } });
}
