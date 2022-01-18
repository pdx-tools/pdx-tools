import { NextApiHandler } from "next";
import { log } from "./logging";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export const withErrorHandling = (handler: NextApiHandler): NextApiHandler => {
  return async (req, res) => {
    await handler(req, res);
  };
};
