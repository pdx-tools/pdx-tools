import { WebPage } from "@/components/layout/WebPage";
import { log } from "@/lib/log";
import { useParams } from "@remix-run/react";
import { useEffect } from "react";

export default function UserRoute() {
    const { userId } = useParams();

    useEffect(() => {
      if (!userId) {
        return;
      }

      const wsUrl = new URL(`/api/users/${userId}/live`, window.location.href);
      wsUrl.protocol = "ws";
      const socket = new WebSocket(wsUrl);
      log(`connecting websocket to: ${wsUrl}`)

      socket.addEventListener("open", () => {
        console.log("OPENED");
        socket.send("GOOD MORNING");
      })

      socket.addEventListener("close", (event) => {
        console.log("CLOSED", event.code, event.reason)

      })

      socket.addEventListener("message", (event) => {
        console.log("MESSAGE", event.data);
      })

      socket.addEventListener("error", (event) => {
        console.log("ERROR", event)
      })

      return () => {
        socket.close();
      }
    }, [userId])
  
    return (
      <WebPage>
        <p>Hello {userId}</p>
      </WebPage>
    );
  }