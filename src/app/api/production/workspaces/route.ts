import { getProductionRoleTag } from "@/lib/access-control";
import {
  getVerifiedProductionUser,
  GLOBAL_PRODUCTION_WORKSPACE_ID,
} from "@/lib/production-access";
import { NextResponse } from "next/server";

export async function GET() {
  const user = await getVerifiedProductionUser();
  if (!user) {
    return NextResponse.json(
      { error: "Verified account required" },
      { status: 401 },
    );
  }

  const role = await getProductionRoleTag(user.id);
  const workspaces = role
    ? [{ id: GLOBAL_PRODUCTION_WORKSPACE_ID, name: "Production workspace", role }]
    : [];

  return NextResponse.json(
    { workspaces },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
