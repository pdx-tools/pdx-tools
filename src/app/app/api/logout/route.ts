import { deleteSessionResponse } from "@/server-lib/auth/session";

export const runtime = "edge";

export async function POST() {
  return deleteSessionResponse();
}
