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
import { useAppSelector } from "@/lib/store";
import { DownloadButton } from "./DownloadButton";

const InfoSideBarTitle = () => {
  const meta = useEu4Meta();
  const remoteFile = useAppSelector((state) => state.eu4.serverSaveFile);
  return (
    <div className="flex items-center gap-2">
      <SaveMode mode={meta.mode} />
      <span>{meta.save_game || "EU4 Save Game"}</span>
      <div className="drawer-extras mr-4 flex grow items-center justify-end gap-2">
        {remoteFile && <DownloadButton />}
        {meta.encoding == "binzip" && <MeltButton />}
      </div>
    </div>
  );
};

export const InfoSideBarButton = ({
  children,
  ...props
}: SideBarButtonProps) => {
  const [drawerVisible, setDrawerVisible] = useState(false);
  return (
    <>
      <Drawer
        title={<InfoSideBarTitle />}
        placement="right"
        closable={true}
        mask={false}
        maskClosable={false}
        destroyOnClose={true} /* to reset initial map payload */
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
