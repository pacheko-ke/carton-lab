import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { canEditProductionJobs } from "@/lib/production-data";
import {
  getProductionWorkspaceMembership,
  getVerifiedProductionUser,
  isProductionAdmin,
} from "@/lib/production-access";
import {
  getProductionInvoiceStatus,
  validateProductionInvoicePayment,
} from "@/lib/production-invoice-data";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ workspaceId: string; invoiceId: string }>;
};

function createPaymentNumber(): string {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  return `PMT-${suffix}`;
}

export async function POST(request: Request, { params }: RouteContext) {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json({ error: "Verified account required" }, { status: 401 });
  }
  const { workspaceId, invoiceId } = await params;
  const isAdmin = isProductionAdmin(user);
  const membership = await getProductionWorkspaceMembership(user.id, workspaceId, isAdmin);
  if (!membership) {
    return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
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
  if (!validateProductionInvoicePayment(body)) {
    return NextResponse.json({ error: "Invalid payment details" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const invoice = await transaction.productionInvoice.findFirst({
        where: { id: invoiceId, workspaceId },
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
        return { error: "Payment exceeds the invoice's outstanding balance", status: 409 as const };
      }

      const amountPaid = invoice.amountPaid.plus(amount);
      const status = getProductionInvoiceStatus(
        invoice.totalAmount.toString(),
        amountPaid.toString(),
        invoice.amountCredited.toString(),
      );
      const payment = await transaction.productionInvoicePayment.create({
        data: {
          invoiceId: invoice.id,
          createdByUserId: user.id,
          paymentNo: createPaymentNumber(),
          amount,
          method: body.method,
          reference: body.reference.trim(),
          notes: body.notes.trim(),
          paidAt: new Date(`${body.paidAt}T00:00:00.000Z`),
        },
        select: { id: true, paymentNo: true, amount: true, method: true, paidAt: true },
      });
      await transaction.productionInvoice.update({
        where: { id: invoice.id },
        data: { amountPaid, status },
      });
      return { payment };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(
      { payment: result.payment },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json(
        { error: "Another payment was recorded concurrently. Refresh the invoice and retry." },
        { status: 409 },
      );
    }
    throw error;
  }
}
