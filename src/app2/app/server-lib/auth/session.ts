import { z } from "zod";
import { useSession } from "vinxi/http";

export function useAppSession() {
  return useSession<SessionPayload | {}>({
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
    },
    name: "sid",
    password: import.meta.env["VITE_SESSION_SECRET"],
  });
}

export type PdxSession = Awaited<ReturnType<typeof usePdxSession>>;
export type PdxUserSession = Extract<PdxSession, { kind: "user" }>;
export async function usePdxSession() {
  const session = await useAppSession();
  if ("userId" in session.data) {
    return {
      kind: "user",
      ...session.data,
    } as const;
  } else {
    return { kind: "guest" } as const;
  }
}

// const secret = new TextEncoder().encode(getEnv("SESSION_SECRET"));
// const sessionCookie = "sid";
const SessionPayloadSchema = z.object({
  userId: z.string(),
  steamId: z.string(),
  account: z.enum(["free", "admin"]),
});

export type SessionPayload = z.infer<typeof SessionPayloadSchema>;

