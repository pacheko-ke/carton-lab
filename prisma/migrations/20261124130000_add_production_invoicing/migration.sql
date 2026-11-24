CREATE TABLE "ProductionInvoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "customerId" TEXT,
    "createdByUserId" TEXT,
    "invoiceNo" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "jobNo" TEXT NOT NULL,
    "customerPO" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(14,4) NOT NULL,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "amountPaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amountCredited" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionInvoice_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductionInvoice_status_check" CHECK ("status" IN ('OPEN', 'PARTIALLY_PAID', 'PAID', 'CREDITED')),
    CONSTRAINT "ProductionInvoice_currency_check" CHECK ("currency" IN ('KES', 'USD', 'EUR')),
    CONSTRAINT "ProductionInvoice_amount_check" CHECK (
        "quantity" > 0 AND
        "unitPrice" > 0 AND
        "totalAmount" > 0 AND
        "amountPaid" >= 0 AND
        "amountCredited" >= 0 AND
        "amountPaid" + "amountCredited" <= "totalAmount"
    ),
    CONSTRAINT "ProductionInvoice_balance_status_check" CHECK (
        ("status" = 'OPEN' AND "amountPaid" = 0 AND "amountCredited" < "totalAmount") OR
        ("status" = 'PARTIALLY_PAID' AND "amountPaid" > 0 AND "amountPaid" + "amountCredited" < "totalAmount") OR
        ("status" = 'PAID' AND "amountPaid" > 0 AND "amountPaid" + "amountCredited" = "totalAmount") OR
        ("status" = 'CREDITED' AND "amountPaid" = 0 AND "amountCredited" = "totalAmount")
    )
);

CREATE TABLE "ProductionInvoicePayment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "paymentNo" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionInvoicePayment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductionInvoicePayment_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "ProductionInvoicePayment_method_check" CHECK (
        "method" IN ('CASH', 'BANK_TRANSFER', 'MPESA', 'CARD', 'CHEQUE', 'OTHER')
    )
);

CREATE TABLE "ProductionCreditNote" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "creditNoteNo" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionCreditNote_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductionCreditNote_amount_check" CHECK ("amount" > 0 AND length(trim("reason")) > 0)
);

CREATE UNIQUE INDEX "ProductionInvoice_dispatchId_key"
ON "ProductionInvoice"("dispatchId");

CREATE UNIQUE INDEX "ProductionInvoice_organizationId_invoiceNo_key"
ON "ProductionInvoice"("organizationId", "invoiceNo");

CREATE INDEX "ProductionInvoice_organizationId_status_dueAt_idx"
ON "ProductionInvoice"("organizationId", "status", "dueAt");

CREATE INDEX "ProductionInvoice_customerId_issuedAt_idx"
ON "ProductionInvoice"("customerId", "issuedAt");

CREATE INDEX "ProductionInvoice_jobId_issuedAt_idx"
ON "ProductionInvoice"("jobId", "issuedAt");

CREATE UNIQUE INDEX "ProductionInvoicePayment_paymentNo_key"
ON "ProductionInvoicePayment"("paymentNo");

CREATE INDEX "ProductionInvoicePayment_invoiceId_paidAt_idx"
ON "ProductionInvoicePayment"("invoiceId", "paidAt");

CREATE UNIQUE INDEX "ProductionCreditNote_creditNoteNo_key"
ON "ProductionCreditNote"("creditNoteNo");

CREATE INDEX "ProductionCreditNote_invoiceId_issuedAt_idx"
ON "ProductionCreditNote"("invoiceId", "issuedAt");

ALTER TABLE "ProductionInvoice"
ADD CONSTRAINT "ProductionInvoice_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "ProductionOrganization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionInvoice"
ADD CONSTRAINT "ProductionInvoice_jobId_fkey"
FOREIGN KEY ("jobId") REFERENCES "ProductionJob"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductionInvoice"
ADD CONSTRAINT "ProductionInvoice_dispatchId_fkey"
FOREIGN KEY ("dispatchId") REFERENCES "ProductionDispatch"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductionInvoice"
ADD CONSTRAINT "ProductionInvoice_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "ProductionCustomer"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionInvoice"
ADD CONSTRAINT "ProductionInvoice_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionInvoicePayment"
ADD CONSTRAINT "ProductionInvoicePayment_invoiceId_fkey"
FOREIGN KEY ("invoiceId") REFERENCES "ProductionInvoice"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionInvoicePayment"
ADD CONSTRAINT "ProductionInvoicePayment_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionCreditNote"
ADD CONSTRAINT "ProductionCreditNote_invoiceId_fkey"
FOREIGN KEY ("invoiceId") REFERENCES "ProductionInvoice"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionCreditNote"
ADD CONSTRAINT "ProductionCreditNote_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
