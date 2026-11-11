import { handlers } from "@/auth";
import { isGoogleAuthConfigured } from "@/auth-config";
import { NextRequest, NextResponse } from "next/server";

function notConfigured() {
  return NextResponse.json(
    { error: "Google authentication is not configured." },
    { status: 503 },
  );
}

export async function GET(request: NextRequest) {
  if (!isGoogleAuthConfigured()) {
    return notConfigured();
  }
  return handlers.GET(request);
}

export async function POST(request: NextRequest) {
  if (!isGoogleAuthConfigured()) {
    return notConfigured();
  }
  return handlers.POST(request);
}
