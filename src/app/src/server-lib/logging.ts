import { toErrorWithMessage } from "@/lib/getErrorMessage";
import { NextApiHandler, NextApiRequest, NextApiResponse } from "next";
import { ValidationError } from "./errors";
import { ZodError } from "zod";
import { captureEvent } from "./posthog";

export type LogMessage = {
  [x: string]: any;
};

class Log {
  private dateFmt(): string {
    return new Date().toJSON();
  }

  public event({
    userId,
    event,
    ...rest
  }: { userId: string; event: string } & LogMessage) {
    captureEvent({ userId, event });
    this.info({ msg: event, user: userId, ...rest });
  }

  public info(data: LogMessage) {
    const line = JSON.stringify({
      date: this.dateFmt(),
      level: "INFO",
      ...data,
    });
    console.info(line);
  }

  public warn(data: LogMessage) {
    const line = JSON.stringify({
      date: this.dateFmt(),
      level: "WARN",
      ...data,
    });
    console.warn(line);
  }

  public error(data: LogMessage) {
    const line = JSON.stringify({
      date: this.dateFmt(),
      level: "ERROR",
      ...data,
    });
    console.error(line);
  }

  public exception(err: unknown, data: LogMessage) {
    let { message, stack } = toErrorWithMessage(err);
    stack = stack ?? new Error().stack ?? "no stack available";
    this.error({ ...data, error: message, stack });
  }
}

export const log = new Log();

type ErrObj = { name: string; msg: string };

export const withLogger = (handler: NextApiHandler): NextApiHandler => {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const start = process.hrtime();
    let exception: ErrObj | undefined = undefined;
    try {
      await handler(req, res);
    } catch (err) {
      if (!(err instanceof Error)) {
        log.exception(err, { msg: "unknown exception" });
        res.status(500).json({
          msg: `unknown exception`,
        });
        return;
      }

      const obj = {
        name: err.name,
        msg: err.message,
      };

      exception = obj;

      if (err.name === ValidationError.name) {
        res.status(400).json(obj);
      } else if (err instanceof ZodError) {
        res.status(400).json({
          name: "ValidationError",
          msg: JSON.stringify(err.flatten().fieldErrors),
        });
      } else {
        log.exception(err, { msg: "unexpected exception" });
        res.status(500).json(obj);
      }
    }

    const elapsed = process.hrtime(start);
    const elapsedMs = (elapsed[0] * 1000 + elapsed[1] / 1000000).toFixed(2);

    if (!req.url) {
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    const obj = {
      method: req.method,
      path: url.pathname,
      code: res.statusCode,
      elapsedMs,
    };

    if (res.statusCode >= 500) {
      log.error(obj);
    } else if (res.statusCode >= 400) {
      log.warn({ ...obj, err: exception });
    } else {
      log.info(obj);
    }
  };
};
