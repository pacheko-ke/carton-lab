"use strict";

const JOB_SHEET_STORAGE_KEY = "packstudio.production-job-sheet.v1";
const JOB_SHEET_TRACKING_STAGES = [
  "Board issued",
  "Cut & creased",
  "Printing",
  "Slotting",
  "Joint (stitch)",
  "QC",
  "Packing",
  "Dispatch",
];
const JOB_SHEET_WORKFLOW_STAGES = [
  "Order Booking",
  "Origination",
  "Paper Booking",
  "Board Production",
  "Printing",
  "Dispatch",
];
const MAX_JOB_SHEET_ARTWORK_BYTES = 5 * 1024 * 1024;

function jobSheetToday() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function jobSheetNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function jobSheetFormat(value, decimals = 1) {
  if (!Number.isFinite(value)) return "";
  return Number(value.toFixed(decimals)).toString();
}

function calculateJobSheetQuantities(data) {
  const unit = data.unit === "in" ? "in" : "mm";
  const length = jobSheetNumber(data.boardLength);
  const width = jobSheetNumber(data.boardWidth);
  const reelWidth = jobSheetNumber(data.reelWidth);
  const orderQuantity = jobSheetNumber(data.orderQty);
  const spoilage = Math.max(0, jobSheetNumber(data.spoilage) || 0);
  const ups = Math.max(1, Math.floor(jobSheetNumber(data.ups) || 1));
  const enteredProduction = jobSheetNumber(data.productionQty);
  const productionQuantity = enteredProduction !== null && enteredProduction >= 0
    ? enteredProduction
    : orderQuantity !== null && orderQuantity > 0
      ? Math.ceil(orderQuantity * (1 + spoilage / 100))
      : null;
  const cuts = productionQuantity === null ? null : Math.ceil(productionQuantity / ups);
  const toMetres = unit === "mm" ? 1 / 1000 : 0.0254;
  const trim = reelWidth !== null && width !== null ? reelWidth - width * ups : null;
  const reelRun = length !== null && cuts !== null ? length * toMetres * cuts : null;
  const boardArea = reelWidth !== null && reelRun !== null
    ? reelWidth * toMetres * reelRun
    : null;
  const palletSize = jobSheetNumber(data.pcsPerPallet);
  const pallets = orderQuantity !== null && orderQuantity > 0 && palletSize !== null && palletSize > 0
    ? Math.ceil(orderQuantity / palletSize)
    : null;
  return {
    productionQuantity,
    cuts,
    trim,
    trimPercent: trim !== null && reelWidth > 0 ? trim / reelWidth * 100 : null,
    reelRun,
    boardArea,
    pallets,
    unit,
  };
}

function pdfAscii(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "?");
}

function pdfEscape(value) {
  return pdfAscii(value).replace(/([\\()])/g, "\\$1");
}

function pdfNumber(value) {
  return Number.isFinite(value) ? Number(value.toFixed(3)).toString() : "0";
}

function createJobSheetPdf(data, model) {
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const pages = [];

  function page(number) {
    const ops = [];
    const color = (hex) => {
      const rgb = hex.replace("#", "").match(/.{2}/g).map((part) => parseInt(part, 16) / 255);
      return rgb.map(pdfNumber).join(" ");
    };
    const topY = (y) => pageHeight - y;
    const fill = (hex) => ops.push(`${color(hex)} rg`);
    const stroke = (hex, width = 0.6) => ops.push(`${color(hex)} RG ${pdfNumber(width)} w`);
    const rect = (x, y, width, height, fillColor, strokeColor) => {
      if (fillColor) fill(fillColor);
      if (strokeColor) stroke(strokeColor);
      ops.push(`${pdfNumber(x)} ${pdfNumber(pageHeight - y - height)} ${pdfNumber(width)} ${pdfNumber(height)} re ${fillColor && strokeColor ? "B" : fillColor ? "f" : "S"}`);
    };
    const line = (x1, y1, x2, y2, colorValue = "#cbd5e1", width = 0.55) => {
      stroke(colorValue, width);
      ops.push(`${pdfNumber(x1)} ${pdfNumber(topY(y1))} m ${pdfNumber(x2)} ${pdfNumber(topY(y2))} l S`);
    };
    const text = (x, y, value, size = 8, bold = false, colorValue = "#0f172a", maxWidth) => {
      let output = pdfAscii(value);
      if (maxWidth && output.length * size * 0.53 > maxWidth) {
        const capacity = Math.max(1, Math.floor(maxWidth / (size * 0.53)) - 1);
        output = `${output.slice(0, capacity)}...`;
      }
      fill(colorValue);
      ops.push(`BT /${bold ? "F2" : "F1"} ${pdfNumber(size)} Tf 1 0 0 1 ${pdfNumber(x)} ${pdfNumber(topY(y))} Tm (${pdfEscape(output)}) Tj ET`);
    };
    const paragraph = (x, y, value, maxWidth, size = 7.5, maxLines = 3) => {
      const capacity = Math.max(1, Math.floor(maxWidth / (size * 0.53)));
      const words = pdfAscii(value).trim().split(/\s+/).filter(Boolean);
      const lines = [];
      let currentLine = "";
      words.forEach((word) => {
        const nextLine = currentLine ? `${currentLine} ${word}` : word;
        if (nextLine.length > capacity && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = nextLine;
        }
      });
      if (currentLine) lines.push(currentLine);
      const visibleLines = lines.slice(0, maxLines);
      if (lines.length > maxLines && visibleLines.length) {
        const lastIndex = visibleLines.length - 1;
        const lastLine = visibleLines[lastIndex];
        visibleLines[lastIndex] = `${lastLine.slice(0, Math.max(1, capacity - 3))}...`;
      }
      visibleLines.forEach((line, index) => text(x, y + index * (size + 2), line, size, false, "#0f172a", maxWidth));
    };
    const section = (title, y, width = pageWidth - 72) => {
      rect(36, y, width, 18, "#eaf3fb");
      text(44, y + 12.5, title.toUpperCase(), 8, true, "#0f6cbd");
      line(36, y + 18, 36 + width, y + 18, "#bfdbef", 0.7);
    };
    const field = (x, y, width, label, value, opts = {}) => {
      text(x, y, label, 6.4, true, "#64748b", width);
      const valueText = value === undefined || value === null || value === "" ? "" : String(value);
      text(x, y + 12, valueText, opts.size || 8, !!opts.bold, "#0f172a", width);
      if (opts.line !== false) line(x, y + 16, x + width, y + 16, "#cbd5e1", 0.45);
    };
    const footer = () => {
      line(36, 814, pageWidth - 36, 814, "#cbd5e1", 0.5);
      text(36, 827, "Generated with PackStudio", 7, false, "#64748b");
      text(pageWidth - 86, 827, `Page ${number} of 2`, 7, false, "#64748b");
    };
    const header = () => {
      rect(0, 0, pageWidth, 54, "#0f6cbd");
      text(36, 28, "JOB SHEET", 18, true, "#ffffff");
      text(36, 43, number === 1 ? "Production copy - internal - no prices" : "Production instructions and tracking", 7.5, false, "#eaf5ff");
      const jobTitle = [data.jobNo, data.jobName, `${data.length || ""} x ${data.width || ""} x ${data.height || ""}`]
        .filter(Boolean).join(" | ");
      text(350, 25, `No. ${data.jobNo || "Not assigned"}`, 9, true, "#ffffff", 210);
      text(350, 41, jobTitle || "Production job", 7.2, false, "#eaf5ff", 210);
      if (number === 1) text(350, 51, `Issued: ${data.issueDate || ""}`, 6.8, false, "#eaf5ff", 210);
      line(36, 65, pageWidth - 36, 65, "#0f6cbd", 0.8);
    };
    pages.push({ ops, header, footer, section, field, rect, line, text, paragraph, pageHeight, pageWidth });
    return pages[pages.length - 1];
  }

  function rowFields(p, y, fields, gap = 12, height = 28) {
    const usableWidth = pageWidth - 72;
    const cellWidth = (usableWidth - gap * (fields.length - 1)) / fields.length;
    fields.forEach(([label, value, key], index) => {
      p.field(36 + index * (cellWidth + gap), y, cellWidth, label, key ? valueFor(data, key, quantities) : value);
    });
    return y + height;
  }

  function valueFor(source, key, calculations) {
    if (key === "productionQty") return calculations.productionQuantity;
    if (key === "cuts") return calculations.cuts;
    if (key === "trim") {
      return calculations.trim === null
        ? ""
        : `${jobSheetFormat(calculations.trim)} ${calculations.unit}${calculations.trimPercent === null ? "" : ` (${jobSheetFormat(calculations.trimPercent, 1)}%)`}`;
    }
    if (key === "reelRun") return calculations.reelRun === null ? "" : `${jobSheetFormat(calculations.reelRun)} m`;
    if (key === "boardArea") return calculations.boardArea === null ? "" : `${jobSheetFormat(calculations.boardArea)} m2`;
    if (key === "pallets") return calculations.pallets;
    return source[key];
  }

  const quantities = calculateJobSheetQuantities(data);
  const p1 = page(1);
  p1.header();
  p1.section("Job and customer", 75);
  rowFields(p1, 101, [
    ["Customer", data.customer],
    ["Job name", data.jobName],
    ["Customer PO no.", data.customerPO],
  ]);
  rowFields(p1, 129, [
    ["Order date", data.orderDate],
    ["Delivery date", data.deliveryDate],
    ["Priority / document", `${data.priority || "Normal"} / ${data.documentType || "JOB"}`],
  ]);

  p1.section("Box specification", 160);
  rowFields(p1, 186, [
    ["Box type", data.boxType],
    ["Size (OD) L x W x H", `${data.length || ""} x ${data.width || ""} x ${data.height || ""} ${quantities.unit}`],
    ["Plies / flute", `${data.plies || ""}${data.flute ? `, ${data.flute}` : ""}`],
  ]);
  rowFields(p1, 214, [
    ["Glue flap / slot width", `${data.glue || ""} / ${data.slot || ""} ${quantities.unit}`],
    ["Joint", data.joint],
    ["Artwork", data.artwork],
  ]);

  p1.section("Keyline and board", 245);
  p1.rect(36, 269, 308, 148, "#ffffff", "#cbd5e1");
  drawJobSheetKeyline(p1, model, 48, 278, 284, 115);
  p1.text(48, 406, "All dimensions in " + quantities.unit + ". Not to scale.", 6.5, false, "#64748b");
  p1.rect(356, 269, 203, 148, "#ffffff", "#cbd5e1");
  [
    ["Top liner", data.topLiner],
    ["Medium (fluting)", data.medium],
    ["Bottom liner", data.bottomLiner],
    ["Nominal board weight", data.boardWeight],
    ["Moisture content", data.moisture],
    ["Board supplier / batch", data.boardSupplier],
  ].forEach(([label, value], index) => {
    const y = 282 + index * 21;
    p1.field(366, y, 180, label, value);
  });

  p1.section("Board & cutting", 428);
  rowFields(p1, 454, [
    ["Board length (cut-off)", `${data.boardLength || ""} ${quantities.unit}`],
    ["Board width", `${data.boardWidth || ""} ${quantities.unit}`],
    ["Creasing dimension", data.creasing],
  ]);
  rowFields(p1, 482, [
    ["Reel width / ups", `${data.reelWidth || ""} ${quantities.unit} / ${data.ups || ""}`],
    ["Trim", valueFor(data, "trim", quantities)],
    ["Grain / flute direction", data.grain],
  ]);

  p1.section("Quantity & material requirement", 513);
  rowFields(p1, 539, [
    ["Order quantity", data.orderQty ? `${data.orderQty} pcs` : ""],
    ["Production quantity", valueFor(data, "productionQty", quantities) ? `${valueFor(data, "productionQty", quantities)} pcs` : ""],
    ["Spoilage allowance", data.spoilage ? `${data.spoilage}%` : ""],
    ["Cuts to run", valueFor(data, "cuts", quantities)],
  ], 8);
  rowFields(p1, 567, [
    ["Reel run length (approx.)", valueFor(data, "reelRun", quantities)],
    ["Board area (approx.)", valueFor(data, "boardArea", quantities)],
    ["Ups across", data.ups],
    ["Pallets (order qty)", valueFor(data, "pallets", quantities)],
  ], 8);

  p1.section("Special instructions", 598);
  p1.paragraph(40, 630, data.specialInstructions || "Check first-off against this sheet before running the full job. Stop and report any deviation.", pageWidth - 80, 7.5, 3);
  p1.section("Approvals", 664);
  rowFields(p1, 690, [
    ["Prepared by", data.preparedBy],
    ["Approved by", data.approvedBy],
    ["Received by (production)", data.receivedBy],
  ]);
  rowFields(p1, 718, [
    ["Production supervisor", data.supervisor],
    ["QC approved", data.qcApproved],
    ["Dispatch / driver", data.dispatchBy],
  ]);
  p1.footer();

  const p2 = page(2);
  p2.header();
  p2.section("Printing", 75);
  rowFields(p2, 101, [
    ["Printing", data.printing],
    ["Method", data.printMethod],
    ["Colour 1", data.printColor],
  ]);
  rowFields(p2, 129, [
    ["Ink type", data.inkType],
    ["Artwork ref / revision", data.artworkRef],
    ["Plate / cylinder ref", data.plateRef],
  ]);
  rowFields(p2, 157, [
    ["Print area", data.printArea],
    ["Registration tolerance", data.registration],
    ["Print position", data.printPosition],
  ]);
  p2.paragraph(40, 192, data.printInstructions || "", pageWidth - 80, 7.2, 2);

  p2.section("Converting (slot, joint)", 211);
  rowFields(p2, 237, [
    ["Slotting / scoring", data.slotting],
    ["Slot width", data.slotWidth ? `${data.slotWidth} ${quantities.unit}` : ""],
    ["Joint type", data.jointType],
  ]);
  rowFields(p2, 265, [
    ["Stitches", data.stitches],
    ["Stitch position", data.stitchPosition],
    ["Box squareness", data.squareness],
  ]);

  p2.section("Quality control", 296);
  rowFields(p2, 322, [
    ["Size tolerance (L, W, H)", data.sizeTolerance],
    ["Crease", data.creaseCheck],
    ["Sampling", data.sampling],
  ]);
  rowFields(p2, 350, [
    ["Print check", data.printCheck],
    ["Joint check", data.jointCheck],
    ["Min. compression (BCT)", data.bct],
  ]);

  p2.section("Packing", 381);
  rowFields(p2, 407, [
    ["Pack as", data.packAs],
    ["Pcs per bundle", data.pcsPerBundle],
    ["Strapping", data.strapping],
  ]);
  rowFields(p2, 435, [
    ["Pallet size", data.palletSize],
    ["Pcs per pallet", data.pcsPerPallet],
    ["Pallets (order qty)", valueFor(data, "pallets", quantities)],
  ]);

  p2.section("Dispatch", 466);
  rowFields(p2, 492, [
    ["Deliver to", data.deliverTo],
    ["Address", data.deliveryAddress],
    ["Contact / phone", data.deliveryContact],
  ]);
  rowFields(p2, 520, [
    ["Delivery window", data.deliveryWindow],
    ["Vehicle / driver", data.vehicleDriver],
    ["Delivery note no.", data.deliveryNote],
  ]);
  p2.paragraph(40, 550, data.dispatchInstructions || "", pageWidth - 80, 7, 2);

  p2.section("Production tracking", 572);
  const columns = [
    { title: "Stage", width: 94 },
    { title: "Date", width: 65 },
    { title: "Operator", width: 97 },
    { title: "Qty in", width: 51 },
    { title: "Qty out", width: 53 },
    { title: "Rejects", width: 53 },
    { title: "Sign", width: 70 },
  ];
  let columnX = 36;
  columns.forEach((column) => {
    p2.rect(columnX, 593, column.width, 16, "#f1f5f9", "#cbd5e1");
    p2.text(columnX + 4, 604, column.title, 6.3, true, "#475569", column.width - 6);
    columnX += column.width;
  });
  const tracking = Array.isArray(data.tracking) ? data.tracking : [];
  JOB_SHEET_TRACKING_STAGES.forEach((stage, index) => {
    const y = 609 + index * 20;
    const values = tracking[index] || {};
    const row = [stage, values.date, values.operator, values.qtyIn, values.qtyOut, values.rejects, values.sign];
    let x = 36;
    row.forEach((value, cellIndex) => {
      const width = columns[cellIndex].width;
      p2.rect(x, y, width, 20, index % 2 ? "#f8fafc" : "#ffffff", "#cbd5e1");
      p2.text(x + 4, y + 13, value || "", 6.2, false, "#0f172a", width - 7);
      x += width;
    });
  });
  p2.footer();

  const contentObjects = pages.map((p) => {
    p.ops.unshift("q");
    p.ops.push("Q");
    return p.ops.join("\n");
  });
  const pageObjectIds = pages.map((_, index) => 3 + index * 2);
  const fontObjectId = 3 + pages.length * 2;
  const objects = [
    null,
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  ];
  pages.forEach((p, index) => {
    const pageObjectId = pageObjectIds[index];
    const streamObjectId = pageObjectId + 1;
    const content = contentObjects[index];
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontObjectId} 0 R /F2 ${fontObjectId + 1} 0 R >> >> /Contents ${streamObjectId} 0 R >>`,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    );
  });
  objects.push(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  );
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (let index = 1; index < objects.length; index++) {
    offsets[index] = pdf.length;
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < objects.length; index++) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}

function drawJobSheetKeyline(page, model, x, y, width, height) {
  if (!model || !Array.isArray(model.items)) {
    page.text(x + 8, y + 50, "Generate a valid keyline in Studio to include its drawing.", 7, false, "#64748b", width - 16);
    return;
  }
  const geometry = model.items.filter((item) => item.layer === "CUT" || item.layer === "CREASE");
  const points = [];
  geometry.forEach((item) => {
    if (item.t === "line") points.push([item.x1, item.y1], [item.x2, item.y2]);
    else if (item.t === "poly") points.push(...item.pts);
    else if (item.t === "path" && typeof flattenSegs === "function") {
      flattenSegs(item.segs).forEach((subpath) => points.push(...subpath.pts));
    }
  });
  if (!points.length) {
    page.text(x + 8, y + 50, "No cut or crease geometry is available for this keyline.", 7, false, "#64748b", width - 16);
    return;
  }
  const minX = Math.min(...points.map(([px]) => px));
  const maxX = Math.max(...points.map(([px]) => px));
  const minY = Math.min(...points.map(([, py]) => py));
  const maxY = Math.max(...points.map(([, py]) => py));
  const scale = Math.min(width / Math.max(maxX - minX, 1), height / Math.max(maxY - minY, 1));
  const left = x + (width - (maxX - minX) * scale) / 2;
  const top = y + (height - (maxY - minY) * scale) / 2;
  const mapX = (px) => left + (px - minX) * scale;
  const mapY = (py) => top + (py - minY) * scale;
  geometry.forEach((item) => {
    page.ops.push("q");
    if (item.layer === "CREASE") {
      page.ops.push("0.82 0.2 0.22 RG 0.65 w [3 2] 0 d");
    } else {
      page.ops.push("0.12 0.17 0.23 RG 0.75 w [] 0 d");
    }
    const subpaths = item.t === "line"
      ? [{ pts: [[item.x1, item.y1], [item.x2, item.y2]], closed: false }]
      : item.t === "poly"
        ? [{ pts: item.pts, closed: !!item.closed }]
        : item.t === "path" && typeof flattenSegs === "function"
          ? flattenSegs(item.segs)
          : [];
    subpaths.forEach((subpath) => {
      if (!subpath.pts.length) return;
      const [first, ...rest] = subpath.pts;
      page.ops.push(`${pdfNumber(mapX(first[0]))} ${pdfNumber(page.pageHeight - mapY(first[1]))} m`);
      rest.forEach(([px, py]) => page.ops.push(`${pdfNumber(mapX(px))} ${pdfNumber(page.pageHeight - mapY(py))} l`));
      if (subpath.closed) page.ops.push("h");
      page.ops.push("S");
    });
    page.ops.push("Q");
  });
}

function defaultJobSheetData(context = {}) {
  const today = jobSheetToday();
  const profile = context.profile || {};
  const params = context.params || {};
  return {
    jobNo: "",
    workflowStage: "Origination",
    issueDate: today,
    documentType: "JOB",
    priority: "Normal",
    customer: profile.companyName || "",
    jobName: params.job || "",
    customerPO: "",
    orderDate: today,
    deliveryDate: "",
    boxType: context.typeName || "RSC 0201",
    length: params.L ?? "",
    width: params.W ?? "",
    height: params.H ?? "",
    unit: params.unit || "mm",
    plies: params.ply ? `${params.ply} ply` : "3 ply",
    flute: "B flute",
    glue: params.glue ?? "",
    slot: params.slot ?? "",
    joint: "Stitched (outside)",
    artwork: "1 colour print",
    crease: params.crease ?? 2,
    bwadd: params.bwadd ?? 4,
    boardLength: context.boardLength ?? "",
    boardWidth: context.boardWidth ?? "",
    creasing: context.creasing ?? "",
    topLiner: "Kraft 140 gsm",
    medium: "Semi-chem 100 gsm",
    bottomLiner: "Kraft 140 gsm",
    boardWeight: "approx. 420 gsm",
    moisture: "8 - 12 %",
    boardSupplier: "",
    reelWidth: params.unit === "in" ? 1250 / 25.4 : 1250,
    ups: 2,
    grain: "Flutes run vertical",
    orderQty: "",
    productionQty: "",
    spoilage: 3,
    printing: "Yes",
    printMethod: "Flexo, inline",
    printColor: "Black (Pantone Black C)",
    inkType: "Water-based",
    artworkRef: "",
    plateRef: "",
    printArea: "",
    registration: "+/- 3 mm",
    printPosition: "Outside, flat view",
    printInstructions: "Print on both L panels, centred between creases. Approve first-off print before running the job.",
    slotting: "Inline with print",
    slotWidth: params.slot ?? "",
    jointType: "Wire stitch, outside",
    stitches: "5 per joint",
    stitchPosition: "25 mm from each edge",
    squareness: "Diff. max 3 mm",
    sizeTolerance: "+/- 3 mm",
    creaseCheck: "No cracking / fracture",
    sampling: "5 boxes per 500 pcs",
    printCheck: "Rub test, registration",
    jointCheck: "Stitches flat, no spikes",
    bct: "2,500 N",
    packAs: "Flat, folded, bundled",
    pcsPerBundle: 25,
    strapping: "2 straps / bundle",
    palletSize: "1200 x 1000 mm",
    pcsPerPallet: 1000,
    deliverTo: profile.companyName || "",
    deliveryAddress: profile.address || "",
    deliveryContact: profile.contact || "",
    deliveryWindow: "",
    vehicleDriver: "",
    deliveryNote: "",
    dispatchInstructions: "Label every bundle with customer, job name, size, quantity per bundle and job number. Wrap pallets and protect corners.",
    specialInstructions: "Check first-off against this sheet before running the full job. Stop and report any deviation.",
    preparedBy: profile.createdBy || "",
    approvedBy: "",
    receivedBy: "",
    supervisor: "",
    qcApproved: "",
    dispatchBy: "",
    tracking: JOB_SHEET_TRACKING_STAGES.map(() => ({})),
  };
}

function initializeJobSheet(getContext) {
  const workspace = document.getElementById("jobSheetWorkspace");
  if (!workspace) return;
  const printingOnly = new URLSearchParams(window.location.search).get("mode") === "printing";
  if (printingOnly) {
    workspace.querySelector(".job-sheet-heading").hidden = true;
    workspace.querySelector(".production-shared-panel").hidden = true;
    workspace.querySelector(".production-stage-control").hidden = true;
    workspace.querySelector("#jobSheetStatus").hidden = true;
    workspace.querySelector(".production-artwork-actions")?.setAttribute("hidden", "");
    workspace.querySelector("#printingJobSummary").hidden = false;
    workspace.querySelectorAll(".job-sheet-stage").forEach((stage) => {
      if (!stage.querySelector("#jobSheetPrintingTitle")) stage.remove();
    });
  }
  const fields = Array.from(workspace.querySelectorAll("[data-job-field]"));
  const trackingRows = Array.from(workspace.querySelectorAll("[data-stage]"));
  const status = document.getElementById("jobSheetStatus");
  const accountKey = typeof accountId === "string" && accountId ? accountId : "offline";
  const storageKey = `${JOB_SHEET_STORAGE_KEY}.${encodeURIComponent(accountKey)}`;
  const workspaceName = document.getElementById("productionWorkspaceName");
  const jobSelect = document.getElementById("productionJobSelect");
  const workspaceRoleBadge = document.getElementById("productionWorkspaceRole");
  const loadSharedJobButton = document.getElementById("productionLoadJob");
  const createSharedJobButton = document.getElementById("productionCreateJob");
  const saveSharedJobButton = document.getElementById("productionSaveJob");
  const artworkPanel = document.getElementById("jobSheetArtworkPanel");
  const artworkFileInput = document.getElementById("productionArtworkFile");
  const artworkUploadButton = document.getElementById("productionArtworkUpload");
  const artworkStatus = document.getElementById("productionArtworkStatus");
  const artworkList = document.getElementById("productionArtworkList");
  let activeSharedJobId = null;
  let activeSharedJobWorkspaceId = null;
  let activeProductionRole = null;
  let sharedJobDirty = false;
  let savedSharedJobData = null;
  let availableOrganizations = [];
  let activeWorkspaceId = "";
  let context = getContext();

  const showStatus = (message, isError = false) => {
    status.textContent = message;
    status.dataset.error = String(isError);
  };
  const getCurrentGeometry = () => {
    const params = { ...context.params };
    const unit = params.unit === "in" ? "in" : "mm";
    if (params.type === "rsc" && typeof compute === "function") {
      const geometry = compute(params);
      if (!geometry.error) {
        return {
          boardLength: geometry.boardLen,
          boardWidth: geometry.boardWid,
          creasing: `${jobSheetFormat(geometry.creaseFlap)} - ${jobSheetFormat(geometry.H)} - ${jobSheetFormat(geometry.creaseFlap)}`,
          unit,
        };
      }
    }
    const model = context.model;
    const cutItems = model && Array.isArray(model.items)
      ? model.items.filter((item) => item.layer === "CUT" || item.layer === "CREASE")
      : [];
    const points = [];
    cutItems.forEach((item) => {
      if (item.t === "line") points.push([item.x1, item.y1], [item.x2, item.y2]);
      else if (item.t === "poly") points.push(...item.pts);
      else if (item.t === "path" && typeof flattenSegs === "function") flattenSegs(item.segs).forEach((path) => points.push(...path.pts));
    });
    if (!points.length) return { boardLength: "", boardWidth: "", creasing: "", unit };
    return {
      boardLength: Math.max(...points.map(([x]) => x)) - Math.min(...points.map(([x]) => x)),
      boardWidth: Math.max(...points.map(([, y]) => y)) - Math.min(...points.map(([, y]) => y)),
      creasing: "",
      unit,
    };
  };
  const collectData = () => {
    const values = {};
    fields.forEach((field) => { values[field.dataset.jobField] = field.value; });
    values.tracking = trackingRows.map((row) => {
      const entry = {};
      row.querySelectorAll("[data-track-field]").forEach((field) => { entry[field.dataset.trackField] = field.value; });
      return entry;
    });
    return values;
  };
  const writeData = (data) => {
    fields.forEach((field) => {
      const value = data[field.dataset.jobField];
      if (value !== undefined && value !== null) field.value = value;
    });
    trackingRows.forEach((row, index) => {
      const entry = Array.isArray(data.tracking) ? data.tracking[index] : null;
      if (!entry) return;
      row.querySelectorAll("[data-track-field]").forEach((field) => {
        field.value = entry[field.dataset.trackField] ?? "";
      });
    });
    refreshOutputs();
  };
  const saveDraft = () => {
    if (activeSharedJobId) {
      if (activeProductionRole === "PRODUCTION") {
        sharedJobDirty = true;
        updateEditorPermissions();
        showStatus("Unsaved changes to this shared job. Save shared changes to sync with the workspace.");
      }
      return;
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify(collectData()));
      showStatus("Draft saved on this device.");
    } catch (error) {
      console.error("Could not save the production job sheet draft:", error);
      showStatus("Could not save this draft in browser storage.", true);
    }
  };
  const notifyProductionUpdated = () => {
    window.parent.postMessage(
      { type: "packstudio:production-updated" },
      window.location.origin,
    );
  };
  const refreshOutputs = () => {
    const data = collectData();
    const quantities = calculateJobSheetQuantities(data);
    const output = (key, value) => {
      const element = workspace.querySelector(`[data-job-output="${key}"]`);
      if (element) element.value = value ?? "";
    };
    const unit = quantities.unit;
    output("trim", quantities.trim === null ? "" : `${jobSheetFormat(quantities.trim)} ${unit}${quantities.trimPercent === null ? "" : ` (${jobSheetFormat(quantities.trimPercent, 1)}%)`}`);
    output("cuts", quantities.cuts);
    output("reelRun", quantities.reelRun === null ? "" : `${jobSheetFormat(quantities.reelRun)} m`);
    output("boardArea", quantities.boardArea === null ? "" : `${jobSheetFormat(quantities.boardArea)} m2`);
    output("pallets", quantities.pallets);
    const outputFields = workspace.querySelectorAll("[data-job-output]");
    outputFields.forEach((element) => { element.title = element.value ? "Calculated from the current sheet values" : ""; });
  };
  const fillFromStudio = (includeJobName) => {
    context = getContext();
    const geometry = getCurrentGeometry();
    const data = collectData();
    const params = context.params || {};
    data.boxType = context.typeName || data.boxType;
    data.length = params.L ?? data.length;
    data.width = params.W ?? data.width;
    data.height = params.H ?? data.height;
    data.unit = params.unit || data.unit;
    data.plies = params.ply ? `${params.ply} ply` : data.plies;
    data.glue = params.glue ?? data.glue;
    data.slot = params.slot ?? data.slot;
    data.slotWidth = params.slot ?? data.slotWidth;
    data.crease = params.crease ?? data.crease;
    data.bwadd = params.bwadd ?? data.bwadd;
    data.boardLength = geometry.boardLength ?? data.boardLength;
    data.boardWidth = geometry.boardWidth ?? data.boardWidth;
    data.creasing = geometry.creasing || data.creasing;
    if (includeJobName && params.job) data.jobName = params.job;
    writeData(data);
    lastSheetUnit = data.unit === "in" ? "in" : "mm";
  };
  const defaultData = defaultJobSheetData(context);
  const newJobNumber = () => {
    const datePart = jobSheetToday().replace(/-/g, "");
    const suffix = Date.now().toString(36).slice(-4).toUpperCase();
    return `JS-${datePart}-${suffix}`;
  };
  let initialData = defaultData;
  let hasSavedDraft = false;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (saved && typeof saved === "object" && !Array.isArray(saved)) {
      initialData = { ...defaultData, ...saved };
      hasSavedDraft = true;
    }
  } catch (error) {
    console.error("Could not load the production job sheet draft:", error);
    showStatus("Could not load the saved job sheet draft.", true);
  }
  if (!initialData.jobNo) initialData.jobNo = newJobNumber();
  writeData(initialData);
  let lastSheetUnit = initialData.unit === "in" ? "in" : "mm";
  const requestJson = async (url, options = {}) => {
    const response = await fetch(url, {
      cache: "no-store",
      ...options,
      headers: {
        ...(options.headers || {}),
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    let responseBody = null;
    try {
      responseBody = await response.json();
    } catch {
      responseBody = null;
    }
    if (!response.ok) {
      throw new Error(responseBody?.error || `Request failed (${response.status}).`);
    }
    return responseBody;
  };
  const selectedWorkspace = () =>
    availableOrganizations.find((workspace) => workspace.id === activeWorkspaceId) || null;
  const updateEditorPermissions = () => {
    const readOnly = printingOnly || (Boolean(activeSharedJobId) && activeProductionRole !== "PRODUCTION");
    fields.forEach((field) => { field.disabled = readOnly; });
    trackingRows.forEach((row) => row.querySelectorAll("[data-track-field]").forEach((field) => {
      field.disabled = readOnly;
    }));
    document.getElementById("jobSheetUseStudio").disabled = readOnly;
    const workspace = selectedWorkspace();
    workspaceRoleBadge.textContent = activeSharedJobId
      ? activeProductionRole === "DESIGNER" ? "Designer" : "Production"
      : workspace?.role === "DESIGNER" ? "Designer" : workspace?.role === "PRODUCTION" ? "Production" : "";
    workspaceName.textContent = workspace?.name || "No company workspace linked";
    jobSelect.disabled = availableOrganizations.length === 0 || jobSelect.options.length < 2;
    loadSharedJobButton.disabled = !jobSelect.value;
    createSharedJobButton.disabled =
      !workspace || workspace.role !== "PRODUCTION" || Boolean(activeSharedJobId);
    saveSharedJobButton.hidden =
      !activeSharedJobId ||
      activeProductionRole !== "PRODUCTION" ||
      jobSelect.value !== activeSharedJobId;
    saveSharedJobButton.disabled = !sharedJobDirty;
    artworkPanel.hidden = !activeSharedJobId;
    const designerCanUpload = !printingOnly &&
      Boolean(activeSharedJobId) &&
      activeProductionRole === "DESIGNER";
    artworkFileInput.disabled = !designerCanUpload;
    artworkUploadButton.disabled = !designerCanUpload;
  };
  const formatFileSize = (size) => size < 1024 * 1024
    ? `${Math.max(1, Math.round(size / 1024))} KB`
    : `${(size / (1024 * 1024)).toFixed(1)} MB`;
  const renderAttachments = (attachments) => {
    artworkList.replaceChildren();
    (Array.isArray(attachments) ? attachments : []).forEach((attachment) => {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = `/api/production/artwork/${encodeURIComponent(attachment.id)}`;
      link.textContent = attachment.originalName;
      link.download = attachment.originalName;
      const size = document.createElement("small");
      size.textContent = formatFileSize(attachment.size);
      item.append(link, size);
      artworkList.append(item);
    });
  };
  const loadWorkspaceJobs = async (workspaceId, selectedJobId = "") => {
    jobSelect.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = workspaceId ? "Select a shared job" : "Select an workspace first";
    jobSelect.append(placeholder);
    if (!workspaceId) {
      updateEditorPermissions();
      return;
    }
    const result = await requestJson(
      `/api/production/workspaces/${encodeURIComponent(workspaceId)}/jobs`,
    );
    (result.jobs || []).forEach((job) => {
      const option = document.createElement("option");
      option.value = job.id;
      option.textContent = [
        job.jobNo || "Untitled job",
        job.jobName,
        job.customer,
      ].filter(Boolean).join(" · ");
      jobSelect.append(option);
    });
    if (selectedJobId) jobSelect.value = selectedJobId;
    updateEditorPermissions();
  };
  const loadProductionWorkspaces = async () => {
    try {
      const result = await requestJson("/api/production/workspaces");
      availableOrganizations = Array.isArray(result.workspaces) ? result.workspaces : [];
      if (!availableOrganizations.length) {
        activeWorkspaceId = "";
        jobSelect.replaceChildren();
        const jobOption = document.createElement("option");
        jobOption.textContent = "No company workspace linked";
        jobSelect.append(jobOption);
        updateEditorPermissions();
        showStatus("No company workspace is linked. Create one from Company setup in the dashboard; your local draft remains available.");
        return;
      }
      activeWorkspaceId = availableOrganizations[0].id;
      const requestedJobId = new URLSearchParams(window.location.search).get("job");
      activeProductionRole = selectedWorkspace()?.role || null;
      updateEditorPermissions();
      await loadWorkspaceJobs(activeWorkspaceId, requestedJobId || "");
      if (requestedJobId && jobSelect.value === requestedJobId) {
        await loadSelectedSharedJob();
      }
      showStatus("Choose a shared job to open it. Local drafts remain on this device.");
    } catch (error) {
      console.error("Could not load production workspaces:", error);
      showStatus(`Could not load production workspaces: ${error.message || error}`, true);
    }
  };
  const loadJobAttachments = async (jobId) => {
    const result = await requestJson(`/api/production/jobs/${encodeURIComponent(jobId)}/artwork`);
    renderAttachments(result.attachments);
  };
  const loadSelectedSharedJob = async () => {
    if (sharedJobDirty && !window.confirm("Discard unsaved changes to this shared job?")) return;
    const jobId = jobSelect.value;
    if (!jobId) return;
    try {
      const result = await requestJson(`/api/production/jobs/${encodeURIComponent(jobId)}`);
      activeSharedJobId = result.job.id;
      activeSharedJobWorkspaceId = result.job.workspaceId;
      activeProductionRole = result.role;
      const loadedData = result.job.data || {};
      savedSharedJobData = {
        ...loadedData,
        workflowStage: JOB_SHEET_WORKFLOW_STAGES.includes(loadedData.workflowStage)
          ? loadedData.workflowStage
          : "Origination",
      };
      sharedJobDirty = false;
      writeData(savedSharedJobData);
      if (printingOnly) {
        const quantityValue = savedSharedJobData.productionQty || savedSharedJobData.orderQty;
        const quantity = Number(quantityValue);
        const size = [savedSharedJobData.length, savedSharedJobData.width, savedSharedJobData.height]
          .filter(Boolean)
          .join(" × ");
        const unit = savedSharedJobData.unit === "in" ? "in" : "mm";
        const spec = [savedSharedJobData.topLiner, savedSharedJobData.medium, savedSharedJobData.bottomLiner]
          .filter(Boolean)
          .join("/");
        document.getElementById("printingSummaryJobNo").textContent = savedSharedJobData.jobNo || "—";
        document.getElementById("printingSummaryJobName").textContent = savedSharedJobData.jobName || "—";
        document.getElementById("printingSummaryCustomer").textContent = savedSharedJobData.customer || "—";
        document.getElementById("printingSummarySize").textContent = size ? `${size} ${unit}` : "—";
        document.getElementById("printingSummaryQty").textContent =
          Number.isFinite(quantity) && quantity >= 0 ? quantity.toLocaleString() : "—";
        document.getElementById("printingSummarySpec").textContent = spec || "—";
      }
      lastSheetUnit = result.job.data?.unit === "in" ? "in" : "mm";
      updateEditorPermissions();
      artworkStatus.textContent = activeProductionRole === "DESIGNER"
        ? "Select an artwork file to attach it to this shared job."
        : "Only Designers can upload artwork. Workspace members can download existing files.";
      artworkStatus.dataset.error = "false";
      await loadJobAttachments(activeSharedJobId);
      showStatus(`Loaded shared job ${result.job.data?.jobNo || result.job.id}.`);
    } catch (error) {
      console.error("Could not load the shared production job:", error);
      showStatus(`Could not load shared job: ${error.message || error}`, true);
    }
  };
  const createSharedJob = async () => {
    if (!validate()) return;
    const workspace = selectedWorkspace();
    if (!workspace || workspace.role !== "PRODUCTION") return;
    try {
      const result = await requestJson(
        `/api/production/workspaces/${encodeURIComponent(workspace.id)}/jobs`,
        { method: "POST", body: JSON.stringify({ data: collectData() }) },
      );
      activeSharedJobId = result.job.id;
      activeSharedJobWorkspaceId = result.job.workspaceId;
      activeProductionRole = workspace.role;
      savedSharedJobData = result.job.data || {};
      sharedJobDirty = false;
      await loadWorkspaceJobs(workspace.id, result.job.id);
      renderAttachments([]);
      updateEditorPermissions();
      artworkStatus.textContent = "Only Designers can upload artwork. Workspace members can download existing files.";
      artworkStatus.dataset.error = "false";
      showStatus(`Created shared job ${result.job.data?.jobNo || result.job.id}.`);
      notifyProductionUpdated();
    } catch (error) {
      console.error("Could not create a shared production job:", error);
      showStatus(`Could not create shared job: ${error.message || error}`, true);
    }
  };
  const saveSharedJob = async () => {
    if (!activeSharedJobId || activeProductionRole !== "PRODUCTION" || !validate()) return;
    try {
      const result = await requestJson(
        `/api/production/jobs/${encodeURIComponent(activeSharedJobId)}`,
        { method: "PATCH", body: JSON.stringify({ data: collectData() }) },
      );
      savedSharedJobData = result.job.data;
      sharedJobDirty = false;
      await loadWorkspaceJobs(activeSharedJobWorkspaceId, activeSharedJobId);
      updateEditorPermissions();
      showStatus(`Saved shared job ${result.job.data?.jobNo || result.job.id}.`);
      notifyProductionUpdated();
    } catch (error) {
      console.error("Could not save the shared production job:", error);
      showStatus(`Could not save shared job: ${error.message || error}`, true);
    }
  };
  const uploadArtwork = async () => {
    const file = artworkFileInput.files?.[0];
    if (!activeSharedJobId || activeProductionRole !== "DESIGNER" || !file) {
      artworkStatus.textContent = "Choose an artwork file before uploading.";
      artworkStatus.dataset.error = "true";
      return;
    }
    if (file.size > MAX_JOB_SHEET_ARTWORK_BYTES) {
      artworkStatus.textContent = "Artwork files must be 5 MB or smaller.";
      artworkStatus.dataset.error = "true";
      return;
    }
    artworkUploadButton.disabled = true;
    artworkStatus.textContent = "Preparing private artwork upload…";
    artworkStatus.dataset.error = "false";
    try {
      const jobPath = `/api/production/jobs/${encodeURIComponent(activeSharedJobId)}/artwork`;
      const upload = await requestJson(`${jobPath}/upload-url`, {
        method: "POST",
        body: JSON.stringify({ fileName: file.name, fileSize: file.size }),
      });
      const response = await fetch(upload.presignedUrl, {
        method: "PUT",
        headers: { "Content-Type": upload.contentType },
        body: file,
      });
      if (!response.ok) {
        throw new Error(`Blob upload failed (${response.status}).`);
      }
      await requestJson(jobPath, {
        method: "POST",
        body: JSON.stringify({ pathname: upload.pathname, fileName: file.name }),
      });
      await loadJobAttachments(activeSharedJobId);
      artworkFileInput.value = "";
      artworkStatus.textContent = "Artwork attached to the shared job.";
    } catch (error) {
      console.error("Could not attach artwork to the production job:", error);
      artworkStatus.textContent = `Could not attach artwork: ${error.message || error}`;
      artworkStatus.dataset.error = "true";
    } finally {
      updateEditorPermissions();
    }
  };
  if (!hasSavedDraft) fillFromStudio(true);
  saveDraft();

  const updateCalculatedDimensions = () => {
    const values = collectData();
    const unit = values.unit === "in" ? "in" : "mm";
    if (values.boxType === "RSC 0201" || values.boxType === "RSC") {
      const length = jobSheetNumber(values.length);
      const width = jobSheetNumber(values.width);
      const height = jobSheetNumber(values.height);
      const glue = jobSheetNumber(values.glue);
      const crease = jobSheetNumber(values.crease) || 0;
      const widthAllowance = jobSheetNumber(values.bwadd) || 0;
      if (length > 0 && width > 0 && height > 0 && glue >= 0) {
        const flap = width / 2 + crease;
        const boardLength = glue + 2 * length + 2 * width;
        const boardWidth = height + width + widthAllowance;
        const data = collectData();
        data.boardLength = jobSheetFormat(boardLength);
        data.boardWidth = jobSheetFormat(boardWidth);
        data.creasing = `${jobSheetFormat(flap)} - ${jobSheetFormat(height)} - ${jobSheetFormat(flap)}`;
        data.slotWidth = data.slot;
        writeData(data);
      }
    }
    refreshOutputs();
    saveDraft();
  };
  const changed = () => {
    refreshOutputs();
    saveDraft();
  };
  fields.forEach((field) => {
    field.addEventListener("input", () => {
      if (["length", "width", "height", "glue", "crease", "bwadd"].includes(field.dataset.jobField)) {
        updateCalculatedDimensions();
      } else if (field.dataset.jobField !== "unit") {
        changed();
      }
    });
    field.addEventListener("change", changed);
  });
  const unitField = fields.find((field) => field.dataset.jobField === "unit");
  if (unitField) {
    unitField.addEventListener("change", () => {
      const nextUnit = unitField.value === "in" ? "in" : "mm";
      if (nextUnit !== lastSheetUnit) {
        const factor = nextUnit === "in" ? 1 / 25.4 : 25.4;
        const precision = nextUnit === "in" ? 3 : 1;
        ["length", "width", "height", "glue", "slot", "slotWidth", "crease", "bwadd", "boardLength", "boardWidth", "reelWidth"]
          .forEach((key) => {
            const field = fields.find((candidate) => candidate.dataset.jobField === key);
            const number = field && jobSheetNumber(field.value);
            if (field && number !== null) field.value = (number * factor).toFixed(precision);
          });
        lastSheetUnit = nextUnit;
        updateCalculatedDimensions();
      }
    });
  }
  trackingRows.forEach((row) => row.querySelectorAll("[data-track-field]").forEach((field) => {
    field.addEventListener("input", saveDraft);
    field.addEventListener("change", saveDraft);
  }));
  const getPrintableContext = () => {
    context = getContext();
    return context;
  };
  const validate = () => {
    const invalid = fields.find((field) => !field.checkValidity());
    if (invalid) {
      invalid.reportValidity();
      invalid.focus();
      return false;
    }
    return true;
  };
  document.getElementById("jobSheetUseStudio").addEventListener("click", () => {
    fillFromStudio(true);
    saveDraft();
    showStatus("Current keyline values copied into the job sheet.");
  });
  document.getElementById("jobSheetNew").addEventListener("click", () => {
    if (sharedJobDirty && !window.confirm("Discard unsaved changes to this shared job?")) return;
    activeSharedJobId = null;
    activeSharedJobWorkspaceId = null;
    savedSharedJobData = null;
    sharedJobDirty = false;
    artworkStatus.textContent = "";
    artworkStatus.dataset.error = "false";
    renderAttachments([]);
    const fresh = defaultJobSheetData(getPrintableContext());
    fresh.jobNo = newJobNumber();
    writeData(fresh);
    fillFromStudio(true);
    updateEditorPermissions();
    saveDraft();
    showStatus("New job sheet created.");
  });
  document.getElementById("jobSheetDownload").addEventListener("click", () => {
    if (!validate()) return;
    try {
      const printableContext = getPrintableContext();
      const pdf = createJobSheetPdf(collectData(), printableContext.model);
      const job = pdfAscii(collectData().jobNo || collectData().jobName || "production-job")
        .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
        .replace(/\s+/g, "-");
      const url = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${job || "production-job"}-job-sheet.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      showStatus("Production job sheet PDF downloaded.");
    } catch (error) {
      console.error("Could not generate the production job sheet PDF:", error);
      showStatus(`Could not generate the PDF: ${error.message || error}`, true);
    }
  });
  document.getElementById("jobSheetPrint").addEventListener("click", () => {
    if (!validate()) return;
    try {
      const printableContext = getPrintableContext();
      const preview = window.open("", "_blank");
      if (!preview) {
        showStatus("Allow pop-ups to open the print-ready job sheet.", true);
        return;
      }
      preview.addEventListener("load", () => preview.print(), { once: true });
      preview.document.open();
      preview.document.write(buildJobSheetPrintHtml(collectData(), printableContext.model));
      preview.document.close();
      showStatus("Print-ready job sheet opened.");
    } catch (error) {
      console.error("Could not prepare the production job sheet for printing:", error);
      showStatus(`Could not prepare the print view: ${error.message || error}`, true);
    }
  });
  jobSelect.addEventListener("change", updateEditorPermissions);
  loadSharedJobButton.addEventListener("click", loadSelectedSharedJob);
  createSharedJobButton.addEventListener("click", createSharedJob);
  saveSharedJobButton.addEventListener("click", saveSharedJob);
  artworkUploadButton.addEventListener("click", uploadArtwork);
  updateEditorPermissions();
  void loadProductionWorkspaces();
}

function buildJobSheetPrintHtml(data, model) {
  const esc = (value) => String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;")
    .replace(/\r?\n/g, "<br>");
  const printField = (label, value) => `<div class="field"><small>${esc(label)}</small><span>${esc(value || "")}</span></div>`;
  const group = (title, entries) => `<section><h2>${esc(title)}</h2><div class="grid">${entries.map(([label, value]) => printField(label, value)).join("")}</div></section>`;
  const keylineSvg = model && typeof toSVG === "function" ? toSVG(model, "export") : "";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(data.jobNo || "Job sheet")}</title>
    <style>
      *{box-sizing:border-box}body{margin:0;color:#17212b;font:10px Arial,Helvetica,sans-serif}
      @page{size:A4;margin:12mm}.page{min-height:273mm;position:relative}
      header{height:19mm;margin:-12mm -12mm 5mm;padding:7mm 12mm;background:#0f6cbd;color:#fff;display:flex;justify-content:space-between}
      header h1{margin:0 0 2mm;font-size:18px}header p{margin:0;color:#eaf5ff}
      section{margin:0 0 4mm;break-inside:avoid}h2{margin:0 0 2mm;padding:1.5mm 2mm;background:#eaf3fb;color:#0f6cbd;font-size:9px;text-transform:uppercase}
      .grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));column-gap:4mm;row-gap:2mm;padding:0 1mm}
      .field{min-height:8mm;border-bottom:.2mm solid #cbd5e1;overflow:hidden}.field small{display:block;color:#64748b;font-size:7px;font-weight:bold}.field span{display:block;margin-top:1mm;max-height:8mm;overflow:hidden}
      .instructions{padding:1mm 2mm;min-height:8mm;white-space:normal}
      .drawing{height:150mm;border:.2mm solid #cbd5e1;padding:3mm;display:flex;align-items:center;justify-content:center;overflow:hidden}
      .drawing svg{display:block;width:100%;height:100%}
      @media screen{body{background:#e2e8f0}.page{width:210mm;min-height:297mm;margin:10mm auto;padding:12mm;background:#fff;box-shadow:0 2mm 8mm #0002}header{margin:-12mm -12mm 5mm}}
    </style></head><body>
    <article class="page"><header><div><h1>PRINTING INSTRUCTIONS</h1><p>Print setup and artwork reference</p></div><div><strong>No. ${esc(data.jobNo)}</strong><p>${esc(data.jobName)}</p></div></header>
      ${group("Print setup", [["Printing", data.printing], ["Method", data.printMethod], ["Colour", data.printColor], ["Ink type", data.inkType], ["Artwork", data.artwork], ["Artwork ref / revision", data.artworkRef], ["Plate / cylinder ref", data.plateRef], ["Print area", data.printArea], ["Registration tolerance", data.registration], ["Print position", data.printPosition]])}
      <section><h2>Print instructions</h2><div class="instructions">${esc(data.printInstructions)}</div></section>
      <section><h2>Artwork artboard</h2><div class="drawing">${keylineSvg}</div></section>
    </article></body></html>`;
}

if (typeof window !== "undefined") {
  window.PackStudioJobSheet = { initializeJobSheet };
}
if (typeof module !== "undefined") {
  module.exports = {
    buildJobSheetPrintHtml,
    calculateJobSheetQuantities,
    createJobSheetPdf,
    defaultJobSheetData,
    pdfEscape,
  };
}
