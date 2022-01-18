import React, { useState } from "react";
import { Drawer } from "antd";
import { InfoDrawer } from "./InfoDrawer";
import { MeltButton } from "./MeltButton";
import { SaveMode } from "../../components/save-mode";
import {
  SideBarButtonProps,
  SideBarButton,
} from "../../components/SideBarButton";
import { SideBarContainerProvider } from "../../components/SideBarContainer";
import { useEu4Meta } from "../../eu4Slice";

const InfoSideBarTitle: React.FC<{}> = () => {
  const meta = useEu4Meta();
  return (
    <div className="flex-row gap">
      <SaveMode mode={meta.mode} />
      <span>{meta.save_game || "EU4 Save Game"}</span>
      <div className="drawer-extras">
        {meta.encoding == "binzip" && <MeltButton />}

        <style jsx>{`
          .drawer-extras {
            flex-grow: 1;
            display: flex;
            justify-content: flex-end;
            margin-right: 2rem;
          }
        `}</style>
      </div>
    </div>
  );
};

export const InfoSideBarButton: React.FC<SideBarButtonProps> = ({
  children,
  ...props
}) => {
  const [drawerVisible, setDrawerVisible] = useState(false);
  return (
    <>
      <Drawer
        title={<InfoSideBarTitle />}
        placement="right"
        closable={true}
        mask={false}
        maskClosable={false}
        onClose={() => setDrawerVisible(false)}
        visible={drawerVisible}
        width="min(800px, 100%)"
      >
        <SideBarContainerProvider>
          <InfoDrawer />
        </SideBarContainerProvider>
      </Drawer>
      <SideBarButton {...props} onClick={() => setDrawerVisible(true)}>
        {children}
      </SideBarButton>
    </>
  );
};
