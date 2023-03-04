import React, { useState } from "react";
import { Drawer, Tooltip } from "antd";
import { InfoDrawer } from "./InfoDrawer";
import { SaveMode } from "../../components/save-mode";
import {
  SideBarButtonProps,
  SideBarButton,
} from "../../components/SideBarButton";
import {
  closeDrawerPropagation,
  SideBarContainerProvider,
} from "../../components/SideBarContainer";
import { DownloadButton } from "./DownloadButton";
import { MeltButton } from "@/components/MeltButton";
import { getEu4Worker } from "../../worker";
import { useEu4Meta, useSaveFilename, useServerSaveFile } from "../../store";

const InfoSideBarTitle = () => {
  const meta = useEu4Meta();
  const remoteFile = useServerSaveFile();
  const filename = useSaveFilename();
  return (
    <div className="flex items-center gap-2">
      <SaveMode mode={meta.mode} />
      <span className="overflow-hidden text-ellipsis">
        {meta.save_game || "EU4 Save Game"}
      </span>
      <div className="drawer-extras mr-4 flex grow items-center justify-end gap-2">
        {remoteFile && <DownloadButton />}
        {!meta.encoding.includes("text") && (
          <MeltButton game="eu4" worker={getEu4Worker()} filename={filename} />
        )}
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
        onClose={closeDrawerPropagation(
          () => setDrawerVisible(false),
          drawerVisible
        )}
        visible={drawerVisible}
        width="min(800px, 100%)"
      >
        <SideBarContainerProvider>
          <InfoDrawer />
        </SideBarContainerProvider>
      </Drawer>
      <Tooltip title="Save info" placement="left">
        <SideBarButton {...props} onClick={() => setDrawerVisible(true)}>
          {children}
        </SideBarButton>
      </Tooltip>
    </>
  );
};
