import { withSessionDeleted } from "@/server-lib/auth/session";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  // Redirect POST logout request into GET request
  const resp = NextResponse.redirect(new URL("/", req.url), { status: 303 });
  return withSessionDeleted(resp);
}
