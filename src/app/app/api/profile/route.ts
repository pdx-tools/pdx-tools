import { ProfileResponse } from "@/services/appApi";
import { NextRequest, NextResponse } from "next/server";
import {
  deleteSessionResponse,
  getSessionPayload,
} from "@/server-lib/auth/session";

export const runtime = "edge";

export async function GET(
  req: NextRequest,
): Promise<NextResponse<ProfileResponse>> {
  try {
    const payload = await getSessionPayload(req);
    if (!payload) {
      return NextResponse.json({ kind: "guest" });
    } else {
      return NextResponse.json({
        kind: "user",
        user: {
          user_id: payload.userId,
          account: payload.account,
          steam_id: payload.steamId,
        },
      });
    }
  } catch {
    return deleteSessionResponse();
  }
}
