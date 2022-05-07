import React, { useState } from "react";
import { Drawer, Button, Typography } from "antd";
import { SteamButton } from "./SteamButton";

export const SteamLogin = () => {
  const [visible, setVisible] = useState(false);
  const closeDrawer = () => setVisible(false);
  const showDrawer = () => setVisible(true);
  return (
    <>
      <Button onClick={showDrawer}>Login</Button>
      <Drawer
        title="Welcome back!"
        width={400}
        onClose={closeDrawer}
        visible={visible}
        footer={<Button onClick={closeDrawer}>Close</Button>}
      >
        <SteamButton />
      </Drawer>
    </>
  );
};
