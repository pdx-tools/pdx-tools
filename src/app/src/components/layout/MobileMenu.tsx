import React, { useState } from "react";
import { Button, Drawer } from "antd";
import { MenuOutlined } from "@ant-design/icons";
import { CoreMenu } from "./CoreMenu";

export const MobileMenu = () => {
  const [menuVisible, setMenuVisible] = useState(false);
  return (
    <div>
      <Button
        icon={<MenuOutlined />}
        size="large"
        onClick={() => setMenuVisible(true)}
      />
      <Drawer
        placement="right"
        closable={false}
        onClose={() => setMenuVisible(false)}
        visible={menuVisible}
        bodyStyle={{
          backgroundColor: "var(--header-bg)",
          padding: 0,
        }}
      >
        <CoreMenu mode="inline" />
      </Drawer>
      <style jsx>{`
        div {
          display: flex;
          flex-grow: 1;
          justify-content: flex-end;
        }
      `}</style>
    </div>
  );
};
