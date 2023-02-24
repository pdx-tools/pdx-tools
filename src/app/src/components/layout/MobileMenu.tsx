import React, { useState } from "react";
import { Button, Drawer } from "antd";
import { MenuOutlined } from "@ant-design/icons";
import { CoreMenu } from "./CoreMenu";

export const MobileMenu = () => {
  const [menuVisible, setMenuVisible] = useState(false);
  return (
    <div className="flex grow justify-end md:hidden">
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
          backgroundColor: "#001529",
          padding: 0,
        }}
      >
        <CoreMenu mode="inline" />
      </Drawer>
    </div>
  );
};
