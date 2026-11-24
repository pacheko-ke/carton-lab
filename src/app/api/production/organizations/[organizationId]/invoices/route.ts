import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { canEditProductionJobs, isRecord } from "@/lib/production-data";
import {
  getProductionOrganizationMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import { validateProductionInvoice } from "@/lib/production-invoice-data";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ organizationId: string }> };

function createInvoiceNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  return `INV-${date}-${suffix}`;
}

function textValue(data: Prisma.JsonValue, key: string): string {
  return isRecord(data) && typeof data[key] === "string" ? data[key] : "";
}

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }
  const { organizationId } = await params;
  const isAdmin = isProductionAdmin(user);
  const membership = await getProductionOrganizationMembership(user.id, organizationId, isAdmin);
  if (!membership) {
    return NextResponse.json({ error: "Organization access denied" }, { status: 403 });
  }
  if (!isAdmin && !canEditProductionJobs(membership.role)) {
    return NextResponse.json({ error: "Production access required" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!validateProductionInvoice(body)) {
    return NextResponse.json({ error: "Invalid invoice details" }, { status: 400 });
  }

  try {
    const invoice = await prisma.$transaction(async (transaction) => {
      const dispatch = await transaction.productionDispatch.findFirst({
        where: { id: body.dispatchId, organizationId, status: "DELIVERED" },
        select: {
          id: true,
          jobId: true,
          job: {
            select: {
              quoteId: true,
              data: true,
              quote: {
                select: {
                  customerId: true,
                  currency: true,
                  lines: { select: { itemCode: true, unitPrice: true } },
                },
              },
            },
          },
          lines: { select: { quantity: true } },
        },
      });
      if (!dispatch) {
        return { error: "Only delivered dispatches can be invoiced", status: 409 as const };
      }

      const quantity = dispatch.lines.reduce((total, line) => total + line.quantity, 0);
      if (!Number.isSafeInteger(quantity) || quantity < 1) {
        return { error: "The delivered dispatch has no billable quantity", status: 409 as const };
      }
      const itemCode = textValue(dispatch.job.data, "itemCode");
      const quoteLine = dispatch.job.quote?.lines.find((line) => line.itemCode === itemCode);
      if (dispatch.job.quoteId && !quoteLine) {
        return { error: "The approved quote price for this job could not be found", status: 409 as const };
      }
      const currency = dispatch.job.quote?.currency ?? body.currency;
      const unitPrice = quoteLine
        ? quoteLine.unitPrice
        : new Prisma.Decimal(body.unitPrice);
      const totalAmount = unitPrice.mul(quantity).toDecimalPlaces(2);
      if (totalAmount.gt("999999999999.99")) {
        return { error: "Invoice total exceeds the supported amount", status: 400 as const };
      }

      const now = new Date();
      const data = isRecord(dispatch.job.data) ? dispatch.job.data : {};
      const created = await transaction.productionInvoice.create({
        data: {
          organizationId,
          jobId: dispatch.jobId,
          dispatchId: dispatch.id,
          customerId: dispatch.job.quote?.customerId ?? null,
          createdByUserId: user.id,
          invoiceNo: createInvoiceNumber(),
          customerName: textValue(dispatch.job.data, "customer") || "Customer",
          jobNo: textValue(dispatch.job.data, "jobNo"),
          customerPO: typeof data.customerPO === "string" ? data.customerPO : "",
          currency,
          quantity,
          unitPrice,
          totalAmount,
          issuedAt: now,
          dueAt: new Date(`${body.dueDate}T00:00:00.000Z`),
        },
        select: {
          id: true,
          invoiceNo: true,
          status: true,
          currency: true,
          quantity: true,
          unitPrice: true,
          totalAmount: true,
          dueAt: true,
        },
      });
      return { invoice: created };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if ("error" in invoice) {
      return NextResponse.json({ error: invoice.error }, { status: invoice.status });
    }
    return NextResponse.json(
      { invoice: invoice.invoice },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034")
    ) {
      return NextResponse.json(
        { error: "This dispatch already has an invoice or another invoice was created concurrently." },
        { status: 409 },
      );
    }
    throw error;
  }
}
