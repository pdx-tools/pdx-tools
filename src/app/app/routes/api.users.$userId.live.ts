import { pdxSession } from "@/server-lib/auth/session";
import { withCore } from "@/server-lib/middleware";
import { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { DurableObject } from "cloudflare:workers";
import { z } from "zod";

const UserParams = z.object({ userId: z.string() });
export const loader = withCore(
  async ({ params, request, context }: LoaderFunctionArgs) => {
    const user = UserParams.parse(params);

    const upgradeHeader = request.headers.get("Upgrade");
    if (!upgradeHeader || upgradeHeader !== "websocket") {
      return new Response("Expected Upgrade: websocket", { status: 426 });
    }

    const session = await pdxSession({ request, context }).get();
    const isHost = session.kind === "user" && session.userId === user.userId;

    const id = context.cloudflare.env.WEBSOCKET_LIVE_SERVER.idFromName(
      `live:${user.userId}`
    );
    const stub = context.cloudflare.env.WEBSOCKET_LIVE_SERVER.get(id);

    return stub.handleWebSocket({ isHost });
  }
);

type SessionState = {
    isHost: boolean;
}

export class LiveSessionWebsocketServer extends DurableObject {
  private sessions: Map<WebSocket, SessionState>;
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);

    this.sessions = new Map();
    ctx.getWebSockets().forEach((webSocket) => {
      const session = webSocket.deserializeAttachment();
      this.sessions.set(webSocket, { ...session });
    });
  }

  handleWebSocket = (session: SessionState) => {
    // Creates two ends of a WebSocket connection.
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);
    
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(session);
    this.sessions.set(server, session);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  };

  override webSocketMessage: DurableObject["webSocketMessage"] = async (
    ws,
    message
  ) => {
    // Upon receiving a message from the client, reply with the same message,
    // but will prefix the message with "[Durable Object]: " and return the
    // total number of connections.
    ws.send(
      `[Durable Object] message: ${message}, connections: ${this.ctx.getWebSockets().length}`
    );
  };

  override webSocketClose: DurableObject["webSocketClose"] = (
    ws,
    code,
    reason,
    wasClean
  ) => {
    // If the client closes the connection, the runtime will invoke the webSocketClose() handler.
    ws.close(code, "Durable Object is closing WebSocket");
  };
}
