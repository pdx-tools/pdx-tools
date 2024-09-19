import { withAdmin } from "@/server-lib/auth/middleware";
import { withCore } from "@/server-lib/middleware";
import { generateOgIntoS3 } from "@/server-lib/og";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const saveSchema = z.object({ saveId: z.string() });

const handler = async (req: NextRequest) => {
  const body = await req.json();
  const save = saveSchema.parse(body);
  generateOgIntoS3(save.saveId);
  return NextResponse.json({ msg: "done" });
};

export const POST = withCore(withAdmin(handler));
