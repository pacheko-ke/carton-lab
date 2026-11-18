import { auth } from "@/auth";
import { Workbook } from "exceljs";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const unit = new URL(request.url).searchParams.get("unit") === "in" ? "in" : "mm";
  const scale = unit === "in" ? 1 / 25.4 : 1;
  const workbook = new Workbook();
  const dimensions = workbook.addWorksheet("Dimensions");
  dimensions.columns = [
    { header: "L", key: "L", width: 14, style: { numFmt: unit === "in" ? "0.000" : "0.0" } },
    { header: "W", key: "W", width: 14, style: { numFmt: unit === "in" ? "0.000" : "0.0" } },
    { header: "H", key: "H", width: 14, style: { numFmt: unit === "in" ? "0.000" : "0.0" } },
    { header: "Job", key: "Job", width: 28 },
  ];
  dimensions.addRows([
    { L: 300 * scale, W: 200 * scale, H: 150 * scale, Job: "Example carton 1" },
    { L: 400 * scale, W: 300 * scale, H: 200 * scale, Job: "Example carton 2" },
  ]);
  dimensions.getRow(1).font = { bold: true };
  dimensions.autoFilter = "A1:D1";
  dimensions.views = [{ state: "frozen", ySplit: 1 }];

  const guide = workbook.addWorksheet("Guide");
  guide.addRows([
    ["CartonLab bulk keyline sample"],
    ["Use the Dimensions sheet for bulk generation. Its first row contains the required L, W and H headers."],
    [`Measurements are in ${unit === "in" ? "inches" : "millimeters"}, matching the unit selected when this file was downloaded.`],
    ["Job is optional. Add one column per keyline input using its exact input ID to override that input for a row."],
    ["Blank optional cells use saved sidebar settings or keyline defaults."],
  ]);
  guide.getColumn(1).width = 110;
  guide.getRow(1).font = { bold: true, size: 14 };

  const content = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(content), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": 'attachment; filename="cartonlab-bulk-sample.xlsx"',
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
}
