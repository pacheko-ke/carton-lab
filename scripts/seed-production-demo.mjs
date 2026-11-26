import { createHash } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";

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

  const workspaceId = "global-production";
  await prisma.userAccessRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: "access-role-designer" } },
    create: { userId: user.id, roleId: "access-role-designer" },
    update: {},
  });

  const jobSuffix = createHash("sha256")
    .update(`${workspaceId}:${user.id}`)
    .digest("hex")
    .slice(0, 12);
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
        workspaceId,
        data: sample.data,
      },
      update: {},
    });
  }

  console.log(`Seeded ${samples.length} demo job sheets in the global production workspace.`);
} finally {
  await prisma.$disconnect();
}
