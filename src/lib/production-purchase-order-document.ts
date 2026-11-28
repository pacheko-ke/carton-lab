import { prisma } from "@/lib/prisma";
import { generateProductionPurchaseOrderPdf } from "@/lib/production-purchase-order-pdf";

const purchaseOrderDocumentSelection = {
  id: true,
  orderNo: true,
  status: true,
  expectedAt: true,
  deliveryTerms: true,
  notes: true,
  createdAt: true,
  createdBy: { select: { name: true, email: true } },
  supplier: {
    select: {
      code: true,
      name: true,
      contactPerson: true,
      email: true,
      address: true,
    },
  },
  lines: {
    orderBy: { material: { name: "asc" } },
    select: {
      orderedQty: true,
      material: { select: { code: true, name: true, unit: true } },
    },
  },
} as const;

export async function getProductionPurchaseOrderDocument(
  workspaceId: string,
  orderId: string,
) {
  const [purchaseOrder, company] = await Promise.all([
    prisma.productionPurchaseOrder.findFirst({
      where: { id: orderId, workspaceId },
      select: purchaseOrderDocumentSelection,
    }),
    prisma.company.findUnique({
      where: { id: workspaceId },
      select: {
        name: true,
        country: true,
        contactEmail: true,
        contactPhone: true,
        address: true,
      },
    }),
  ]);
  if (!purchaseOrder || !company) return null;

  const pdf = await generateProductionPurchaseOrderPdf({
    orderNo: purchaseOrder.orderNo,
    status: purchaseOrder.status,
    createdAt: purchaseOrder.createdAt,
    expectedAt: purchaseOrder.expectedAt,
    deliveryTerms: purchaseOrder.deliveryTerms,
    createdByName: purchaseOrder.createdBy?.name?.trim() ||
      purchaseOrder.createdBy?.email ||
      "Production user",
    notes: purchaseOrder.notes,
    company,
    supplier: purchaseOrder.supplier,
    lines: purchaseOrder.lines.map((line) => ({
      orderedQty: line.orderedQty.toString(),
      material: line.material,
    })),
  });

  return { purchaseOrder, company, pdf };
}
