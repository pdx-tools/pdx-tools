import React, { useState } from "react";
import { Drawer, Button } from "antd";
import { SteamButton } from "./SteamButton";

export const SteamRegister = () => {
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  return (
    <>
      <Button type="primary" onClick={() => setDrawerOpen(true)}>
        Register
      </Button>
      <Drawer
        title="Register an account with PDX Tools"
        onClose={() => setDrawerOpen(false)}
        visible={isDrawerOpen}
        width={400}
        footer={<Button onClick={() => setDrawerOpen(false)}>Close</Button>}
      >
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
          <ul>
            <li>Ability to submit to the leaderboard</li>
            <li>
              <a href="https://skanderbeg.pm">Skanderbeg</a> saves linked to
              your profile
            </li>
          </ul>
        </p>
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
      </Drawer>
    </>
  );
};
