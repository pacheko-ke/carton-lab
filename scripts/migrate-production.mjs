import { spawnSync } from "node:child_process";

if (process.env.VERCEL_ENV === "production") {
  if (!process.env.POSTGRES_PRISMA_URL) {
    throw new Error("POSTGRES_PRISMA_URL is required for production migrations.");
  }

  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(command, ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
