export const MAX_ARTWORK_FILE_BYTES = 5 * 1024 * 1024;

const JOB_SHEET_FIELD_LIMITS: Record<string, number> = {
  jobNo: 40,
  issueDate: 10,
  documentType: 10,
  priority: 10,
  customer: 120,
  jobName: 100,
  customerPO: 60,
  orderDate: 10,
  deliveryDate: 10,
  boxType: 80,
  length: 40,
  width: 40,
  height: 40,
  unit: 2,
  plies: 12,
  flute: 30,
  glue: 40,
  slot: 40,
  joint: 60,
  artwork: 80,
  crease: 40,
  bwadd: 40,
  topLiner: 60,
  medium: 60,
  bottomLiner: 60,
  boardWeight: 40,
  moisture: 40,
  boardSupplier: 100,
  boardLength: 40,
  boardWidth: 40,
  creasing: 100,
  reelWidth: 40,
  ups: 20,
  grain: 80,
  orderQty: 20,
  productionQty: 20,
  spoilage: 20,
  slotting: 80,
  slotWidth: 40,
  jointType: 80,
  stitches: 40,
  stitchPosition: 60,
  squareness: 50,
  sizeTolerance: 40,
  creaseCheck: 80,
  sampling: 60,
  printCheck: 80,
  jointCheck: 80,
  bct: 40,
  printing: 10,
  printMethod: 80,
  printColor: 80,
  inkType: 60,
  artworkRef: 80,
  plateRef: 80,
  printArea: 60,
  registration: 30,
  printPosition: 80,
  printInstructions: 300,
  packAs: 60,
  pcsPerBundle: 20,
  strapping: 60,
  palletSize: 60,
  pcsPerPallet: 20,
  deliverTo: 120,
  deliveryAddress: 160,
  deliveryContact: 100,
  deliveryWindow: 80,
  vehicleDriver: 80,
  deliveryNote: 60,
  dispatchInstructions: 400,
  specialInstructions: 500,
  preparedBy: 80,
  approvedBy: 80,
  receivedBy: 80,
  supervisor: 80,
  qcApproved: 80,
  dispatchBy: 80,
};

const TRACKING_FIELD_LIMITS: Record<string, number> = {
  date: 10,
  operator: 100,
  qtyIn: 20,
  qtyOut: 20,
  rejects: 20,
  sign: 100,
};

const ARTWORK_CONTENT_TYPES: Record<string, string> = {
  ai: "application/postscript",
  cdr: "application/octet-stream",
  eps: "application/postscript",
  indd: "application/octet-stream",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  pdf: "application/pdf",
  png: "image/png",
  ps: "application/postscript",
  psd: "image/vnd.adobe.photoshop",
  svg: "image/svg+xml",
  tif: "image/tiff",
  tiff: "image/tiff",
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateProductionJobData(
  value: unknown,
): value is Record<string, unknown> {
  if (!isRecord(value) || JSON.stringify(value).length > 32_768) return false;

  for (const [key, fieldValue] of Object.entries(value)) {
    if (key === "tracking") {
      if (
        !Array.isArray(fieldValue) ||
        fieldValue.length > 8 ||
        fieldValue.some(
          (entry) =>
            !isRecord(entry) ||
            Object.entries(entry).some(
              ([field, item]) =>
                TRACKING_FIELD_LIMITS[field] === undefined ||
                typeof item !== "string" ||
                item.length > TRACKING_FIELD_LIMITS[field],
            ),
        )
      ) {
        return false;
      }
      continue;
    }

    const maxLength = JOB_SHEET_FIELD_LIMITS[key];
    if (
      maxLength === undefined ||
      typeof fieldValue !== "string" ||
      fieldValue.length > maxLength
    ) {
      return false;
    }
  }

  return true;
}

export function canEditProductionJobs(role: string): boolean {
  return role === "PRODUCTION";
}

export function canAttachProductionArtwork(role: string): boolean {
  return role === "DESIGNER";
}

export function sanitizeArtworkFileName(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 255) return null;
  const name = value
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();

  return name && name.length <= 180 && name !== "." && name !== ".."
    ? name
    : null;
}

export function getArtworkContentType(fileName: string): string | null {
  const extension = fileName.toLowerCase().split(".").pop();
  return extension ? ARTWORK_CONTENT_TYPES[extension] ?? null : null;
}
