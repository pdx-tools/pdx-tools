import { withSessionDeleted } from "@/server-lib/auth/session";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  return withSessionDeleted(NextResponse.redirect(new URL("/", req.url)));
}
