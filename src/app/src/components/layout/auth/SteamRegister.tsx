import React, { useState } from "react";
import { Drawer, Button, Typography, Divider } from "antd";
import { SteamButton } from "./SteamButton";
const { Title, Paragraph, Text } = Typography;

export const SteamRegister: React.FC<{}> = () => {
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  return (
    <>
      <Button type="primary" onClick={() => setDrawerOpen(true)}>
        Register
      </Button>
      <Drawer
        title="Register an account with Rakaly"
        onClose={() => setDrawerOpen(false)}
        visible={isDrawerOpen}
        width={400}
        footer={<Button onClick={() => setDrawerOpen(false)}>Close</Button>}
      >
        <Paragraph>
          To sign up for a Rakaly account, simply login through Steam. You don't
          need to have bought EU4 through Steam -- only a Steam account is
          needed.
        </Paragraph>
        <SteamButton />
        <Divider />
        <Title level={4}>What does signing up get me?</Title>
        <Paragraph>
          Signing up automatically grants one a free basic account. Basic
          account features:
          <ul>
            <li>Ability to submit to the leaderboard</li>
            <li>
              <a href="https://skanderbeg.pm">Skanderbeg</a> saves linked to
              your profile
            </li>
          </ul>
        </Paragraph>
        <Title level={4}>Why Steam?</Title>
        EU4 is mainly distributed through Steam, so the majority of Rakaly users
        should already have a Steam account. This allows Rakaly to offload the
        bureaucracy of managing accounts to Steam.
        <Paragraph></Paragraph>
        <Title level={4}>What Steam information does Rakaly use?</Title>
        <Paragraph>
          Rakaly only records the user id returned by Steam and the associated
          persona name.{" "}
          <Text strong>Rakaly will not get access to Steam passwords</Text>
        </Paragraph>
      </Drawer>
    </>
  );
};
