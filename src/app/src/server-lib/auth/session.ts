import { z } from "zod";
import { getEnv } from "../env";
import { SignJWT, jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { ProfileResponse } from "@/services/appApi";
import { genId } from "../id";

const secret = new TextEncoder().encode(getEnv("SESSION_SECRET"));
const sessionCookie = "sid";
const SessionPayloadSchema = z.object({
  userId: z.string(),
  steamId: z.string(),
  account: z.enum(["free", "admin"]),
});

export type SessionPayload = z.infer<typeof SessionPayloadSchema>;

export async function newSessionCookie(payload: SessionPayload) {
  const jwt = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setJti(genId())
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(secret);

  return {
    name: sessionCookie,
    value: jwt,
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 14,
  };
}

export async function getSessionPayload(req: NextRequest) {
  const token = req.cookies.get(sessionCookie)?.value;
  if (!token) {
    return undefined;
  }

  const results = await jwtVerify(token, secret);
  return SessionPayloadSchema.parse(results.payload);
}

export function deleteSessionResponse(): NextResponse<ProfileResponse> {
  const resp = NextResponse.json({ kind: "guest" } as const);
  resp.cookies.delete(sessionCookie);
  return resp;
}
