import { handlers } from "@/auth";
import { isAuthConfigured } from "@/auth-config";
import { NextRequest, NextResponse } from "next/server";

function notConfigured() {
  return NextResponse.json(
    { error: "Authentication is not configured." },
    { status: 503 },
  );
}

export async function GET(request: NextRequest) {
  if (!isAuthConfigured()) {
    return notConfigured();
  }
  return handlers.GET(request);
}

export async function POST(request: NextRequest) {
  if (!isAuthConfigured()) {
    return notConfigured();
  }
  return handlers.POST(request);
}
