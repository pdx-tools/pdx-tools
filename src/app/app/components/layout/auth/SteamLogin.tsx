import React from "react";
import { Button } from "@/components/Button";
import { SteamButton } from "./SteamButton";
import { Sheet } from "@/components/Sheet";
import { emitEvent } from "@/lib/events";

export const SteamLogin = () => {
  return (
    <Sheet modal={true}>
      <Sheet.Trigger asChild>
        <Button
          onClick={() => {
            emitEvent({ kind: "Login click" });
          }}
        >
          Login
        </Button>
      </Sheet.Trigger>
      <Sheet.Content
        side="right"
        className="w-80 bg-white p-4 dark:bg-slate-900"
      >
        <Sheet.Header>
          <Sheet.Close />
          <Sheet.Title>Welcome back!</Sheet.Title>
        </Sheet.Header>
        <SteamButton />
      </Sheet.Content>
    </Sheet>
  );
};
