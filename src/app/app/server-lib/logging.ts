import { toErrorWithMessage } from "@/lib/getErrorMessage";
import { captureEvent } from "./posthog";

export type LogMessage = {
  [x: string]: unknown;
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
    this.info({ event, user: userId, ...rest });
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
    const error = toErrorWithMessage(err);
    const stack = error.stack ?? new Error().stack ?? "no stack available";
    this.error({ ...data, error: error.message, stack });
  }
}

export const log = new Log();
