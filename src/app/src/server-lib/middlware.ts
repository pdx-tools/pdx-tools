import { NextApiHandler } from "next";
import { withErrorHandling } from "./errors";
import { withLogger } from "./logging";

export const withCoreMiddleware = (fn: NextApiHandler): NextApiHandler => {
  return withLogger(withErrorHandling(fn));
};
