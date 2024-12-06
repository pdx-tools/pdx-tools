import { DurableObject } from "cloudflare:workers";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { pdxCookieSession } from "@/server-lib/auth/cookie";
import { log } from "@/server-lib/logging";
import { AppLoadContext } from "@remix-run/cloudflare";
import { type UserId } from "@/lib/auth";
import { S3Key } from "./s3";

type SessionState = {
  isHost: boolean;
};

export default {
  fetch(request, env, ctx) {
    const doId = env.WEBSOCKET_LIVE_SERVER.idFromName(
      `live:${"100"}`,
    );
    const stub = env.WEBSOCKET_LIVE_SERVER.get(doId);
    const doUrl = new URL(`/100`, request.url);
    return stub.fetch!(new Request(doUrl, request));
  }
}

export const liveRoom = (id: UserId, context: AppLoadContext) => {
  const doId = context.cloudflare.env.WEBSOCKET_LIVE_SERVER.idFromName(
    `live:${id}`,
  );
  return context.cloudflare.env.WEBSOCKET_LIVE_SERVER.get(doId);
};

export class LiveSessionWebsocketServer extends DurableObject<Env> {
  private sessions: Map<WebSocket, SessionState>;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    this.sessions = new Map();
    ctx.getWebSockets().forEach((webSocket) => {
      const session = webSocket.deserializeAttachment();
      this.sessions.set(webSocket, { ...session });
    });
  }

  // https://developers.cloudflare.com/durable-objects/best-practices/websockets/#websocket-hibernation-api
  override async fetch(request: Request) {
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);
    this.ctx.acceptWebSocket(server);

    const liveId = new URL(request.url).pathname.slice(1);
    const session = await pdxCookieSession({
      request,
      secret: this.env.SESSION_SECRET,
    }).get();
    const isHost = session.kind === "user" && session.userId === liveId;
    log.info({ msg: "new live connection", isHost });

    server.serializeAttachment({ isHost });
    this.sessions.set(server, { isHost });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  override webSocketMessage: DurableObject["webSocketMessage"] = async (
    ws,
    message,
  ) => {
    ws.send(`unsupported: ${message}`);
  };

  override webSocketClose: DurableObject["webSocketClose"] = (
    ws,
    code,
    _reason,
    _wasClean,
  ) => {
    // If the client closes the connection, the runtime will invoke the webSocketClose() handler.
    ws.close(code, "Durable Object is closing WebSocket");
    this.sessions.delete(ws);
  };

  override webSocketError(ws: WebSocket, error: unknown) {
    log.info({ msg: "websocket error", error: getErrorMessage(error) });
    this.sessions.delete(ws);
  }

  notifyListeners(s3Key: S3Key) {
    for (const ws of this.sessions.keys()) {
      try {
        ws.send(msg({ kind: "new-save", s3Key }));
      } catch (_) {
        // connection is dead
        this.sessions.delete(ws);
      }
    }
  }
}

function msg(x: { kind: "new-save"; s3Key: S3Key }) {
  return JSON.stringify(x);
}
