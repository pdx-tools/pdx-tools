import React, { useState } from "react";
import { Drawer } from "antd";
import { AppHeader } from "../../../components/layout/AppHeader";
import { SideBarButton, SideBarButtonProps } from "./SideBarButton";

export const HeaderSideBarButton: React.FC<SideBarButtonProps> = ({
  children,
  ...props
}) => {
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
        }}
      >
        <AppHeader />
      </Drawer>
      <SideBarButton {...props} onClick={() => setheaderVisible(true)}>
        {children}
      </SideBarButton>
    </>
  );
};
