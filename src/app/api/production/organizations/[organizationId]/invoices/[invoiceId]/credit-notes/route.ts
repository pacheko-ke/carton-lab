import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { canEditProductionJobs } from "@/lib/production-data";
import {
  getProductionOrganizationMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import {
  getProductionInvoiceStatus,
  validateProductionCreditNote,
} from "@/lib/production-invoice-data";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ organizationId: string; invoiceId: string }>;
};

function createCreditNoteNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  return `CN-${date}-${suffix}`;
}

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }
  const { organizationId, invoiceId } = await params;
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
  if (!validateProductionCreditNote(body)) {
    return NextResponse.json({ error: "Invalid credit note details" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const invoice = await transaction.productionInvoice.findFirst({
        where: { id: invoiceId, organizationId },
        select: {
          id: true,
          totalAmount: true,
          amountPaid: true,
          amountCredited: true,
        },
      });
      if (!invoice) return { error: "Invoice not found", status: 404 as const };

      const amount = new Prisma.Decimal(body.amount);
      const balance = invoice.totalAmount.minus(invoice.amountPaid).minus(invoice.amountCredited);
      if (balance.lte(0) || amount.gt(balance)) {
        return { error: "Credit note exceeds the invoice's outstanding balance", status: 409 as const };
      }

      const amountCredited = invoice.amountCredited.plus(amount);
      const status = getProductionInvoiceStatus(
        invoice.totalAmount.toString(),
        invoice.amountPaid.toString(),
        amountCredited.toString(),
      );
      const creditNote = await transaction.productionCreditNote.create({
        data: {
          invoiceId: invoice.id,
          createdByUserId: user.id,
          creditNoteNo: createCreditNoteNumber(),
          amount,
          reason: body.reason.trim(),
          notes: body.notes.trim(),
        },
        select: { id: true, creditNoteNo: true, amount: true, reason: true, issuedAt: true },
      });
      await transaction.productionInvoice.update({
        where: { id: invoice.id },
        data: { amountCredited, status },
      });
      return { creditNote };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(
      { creditNote: result.creditNote },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json(
        { error: "Another invoice adjustment was recorded concurrently. Refresh and retry." },
        { status: 409 },
      );
    }
    throw error;
  }
}
