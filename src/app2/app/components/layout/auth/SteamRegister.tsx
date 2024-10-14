import React from "react";
import { SteamButton } from "./SteamButton";
import { Button } from "@/components/Button";
import { Sheet } from "@/components/Sheet";
import { Link } from "@/components/Link";
import { emitEvent } from "@/lib/events";

export const SteamRegister = () => {
  return (
    <Sheet modal={true}>
      <Sheet.Trigger asChild>
        <Button
          variant="primary"
          onClick={() => {
            emitEvent({ kind: "Register click" });
          }}
        >
          Register
        </Button>
      </Sheet.Trigger>
      <Sheet.Content
        side="right"
        className="w-80 bg-white p-4 dark:bg-slate-900"
      >
        <Sheet.Header>
          <Sheet.Close />
          <Sheet.Title>Register an account with PDX Tools</Sheet.Title>
        </Sheet.Header>
        <p>
          To sign up for a PDX Tools account, simply login through Steam. You
          don't need to have bought EU4 through Steam -- only a Steam account is
          needed.
        </p>
        <SteamButton />
        <h3 className="mt-12 text-xl">What does signing up get me?</h3>
        <p>
          Signing up automatically grants one a free basic account. Basic
          account features:
        </p>
        <ul>
          <li>Ability to submit to the leaderboard</li>
          <li>
            <Link href="https://skanderbeg.pm">Skanderbeg</Link> saves linked to
            your profile
          </li>
        </ul>
        <h3 className="text-xl">Why Steam?</h3>
        EU4 is mainly distributed through Steam, so the majority of PDX Tools
        users should already have a Steam account. This allows us to offload the
        bureaucracy of managing accounts to Steam.
        <p></p>
        <h3 className="text-xl">What Steam information does PDX Tools use?</h3>
        <p>
          PDX Tools only records the user id returned by Steam and the
          associated persona name.{" "}
          <span className="font-bold">
            PDX Tools will not get access to Steam passwords
          </span>
        </p>
      </Sheet.Content>
    </Sheet>
  );
};
