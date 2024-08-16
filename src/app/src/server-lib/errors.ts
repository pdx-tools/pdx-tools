import { NextApiHandler } from "next";
import { log } from "./logging";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class AuthorizationError extends Error {
  constructor() {
    super("forbidden from performing action");
    this.name = "AuthorizationError";
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export const withErrorHandling = (handler: NextApiHandler): NextApiHandler => {
  return async (req, res) => {
    await handler(req, res);
  };
};
