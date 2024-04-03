import React from "react";
import { Button } from "@/components/Button";
import { SteamButton } from "./SteamButton";
import { Sheet } from "@/components/Sheet";

export const SteamLogin = () => {
  return (
    <Sheet modal={true}>
      <Sheet.Trigger asChild>
        <Button>Login</Button>
      </Sheet.Trigger>
      <Sheet.Content
        side="right"
        className="w-80 dark:bg-slate-800 bg-white p-4"
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
