import React, { useState } from "react";
import { Drawer, Tooltip } from "antd";
import { AppHeader } from "../../../components/layout/AppHeader";
import { SideBarButton, SideBarButtonProps } from "./SideBarButton";

export const HeaderSideBarButton = ({
  children,
  ...props
}: SideBarButtonProps) => {
  const [headerVisible, setheaderVisible] = useState(false);
  return (
    <>
      <Drawer
        title={null}
        push={false}
        placement="top"
        closable={false}
        onClose={() => setheaderVisible(false)}
        visible={headerVisible}
        contentWrapperStyle={{
          height: "auto",
        }}
        bodyStyle={{
          padding: 0,
          overflowY: "clip" /* antd upgrade needed this */,
        }}
      >
        <AppHeader />
      </Drawer>
      <Tooltip title="Main menu" placement="bottomLeft">
        <SideBarButton {...props} onClick={() => setheaderVisible(true)}>
          {children}
        </SideBarButton>
      </Tooltip>
    </>
  );
};
