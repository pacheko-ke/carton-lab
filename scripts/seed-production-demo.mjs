import { createHash } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { ProductionRole, PrismaClient } from "@prisma/client";

loadEnvConfig(process.cwd());

if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
  throw new Error("Demo production jobs can only be seeded in a local development environment.");
}
if (process.env.PACKSTUDIO_ALLOW_LOCAL_DEMO_SEED !== "true") {
  throw new Error("Set PACKSTUDIO_ALLOW_LOCAL_DEMO_SEED=true to confirm local demo seeding.");
}

const designerEmail = process.env.DEMO_USER_EMAIL;
if (!designerEmail) {
  throw new Error("Set DEMO_USER_EMAIL to a verified local account.");
}

const prisma = new PrismaClient();

try {
  const user = await prisma.user.findFirst({
    where: {
      email: { equals: designerEmail, mode: "insensitive" },
      emailVerified: { not: null },
    },
    select: { id: true },
  });
  if (!user) throw new Error("The demo designer must be a registered, verified account.");

  const suffix = createHash("sha256").update(user.id).digest("hex").slice(0, 12);
  const organizationId = `demo-org-${suffix}`;
  const organization = await prisma.productionOrganization.upsert({
    where: { id: organizationId },
    create: { id: organizationId, name: "PackStudio Local Demo" },
    update: {},
    select: { id: true, name: true },
  });
  const membership = await prisma.productionOrganizationMembership.findUnique({
    where: { organizationId_userId: { organizationId, userId: user.id } },
    select: { role: true },
  });
  if (membership && membership.role !== ProductionRole.DESIGNER) {
    throw new Error("The local demo organization already has a non-Designer membership for this account.");
  }
  if (!membership) {
    await prisma.productionOrganizationMembership.create({
      data: { organizationId, userId: user.id, role: ProductionRole.DESIGNER },
    });
  }

  const jobSuffix = createHash("sha256").update(organizationId).digest("hex").slice(0, 12);
  const samples = [
    {
      id: `demo-orig-${jobSuffix}-01`,
      data: {
        jobNo: "DEMO-ORIG-001",
        jobName: "Mailer carton",
        customer: "Sample Foods Ltd",
        workflowStage: "Origination",
        priority: "Normal",
        deliveryDate: "2027-01-15",
        boxType: "RSC 0201",
        topLiner: "150k",
        medium: "150b",
        bottomLiner: "150c",
        length: "300",
        width: "220",
        height: "160",
        unit: "mm",
        orderQty: "1200",
        artworkRef: "ART-DEMO-001",
      },
    },
    {
      id: `demo-orig-${jobSuffix}-02`,
      data: {
        jobNo: "DEMO-ORIG-002",
        jobName: "Tea gift box",
        customer: "Sample Tea Co",
        workflowStage: "Origination",
        priority: "High",
        deliveryDate: "2027-01-22",
        boxType: "Straight tuck carton",
        topLiner: "150k",
        medium: "150b",
        bottomLiner: "150c",
        length: "180",
        width: "120",
        height: "65",
        unit: "mm",
        orderQty: "800",
        artworkRef: "ART-DEMO-002",
      },
    },
  ];

  for (const sample of samples) {
    await prisma.productionJob.upsert({
      where: { id: sample.id },
      create: {
        id: sample.id,
        organizationId,
        data: sample.data,
      },
      update: {},
    });
  }

  console.log(`Seeded ${samples.length} demo job sheets in "${organization.name}".`);
} finally {
  await prisma.$disconnect();
}
