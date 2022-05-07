import React from "react";
import { Drawer } from "antd";
import { useUploadProgress, useUploadResponse } from "./uploadContext";
import { UploadDrawerContent } from "./UploadDrawerContent";
import { HelpTooltip } from "@/components/HelpTooltip";
import { ProgressBar } from "@/components/ProgressBar";
import { useEu4Meta } from "@/features/eu4/eu4Slice";
import { SaveMode } from "../../components/save-mode";
import { SuccessAlert } from "../../components/SuccessAlert";

interface UploadDrawerProps {
  visible: boolean;
  closeDrawer: () => void;
}

export const UploadDrawerTitle = () => {
  const meta = useEu4Meta();
  const progress = useUploadProgress();
  const uploadResponse = useUploadResponse();
  return (
    <div className="flex-row gap">
      <SaveMode mode={meta.mode} />
      <span>{`Upload ${meta.save_game}`}</span>
      <HelpTooltip help="Upload the save to PDX Tools servers so you can share a link with the world" />
      <span className="grow">
        {progress !== undefined && <ProgressBar height={30} value={progress} />}
        {uploadResponse && <SuccessAlert newSaveId={uploadResponse.save_id} />}
      </span>
      <style jsx>{`
        div {
          margin-right: 30px;
        }
      `}</style>
    </div>
  );
};

export const UploadDrawer = ({ visible, closeDrawer }: UploadDrawerProps) => {
  return (
    <Drawer
      title={<UploadDrawerTitle />}
      placement="right"
      closable={true}
      mask={false}
      maskClosable={false}
      onClose={closeDrawer}
      visible={visible}
      width="min(800px, 100%)"
    >
      <UploadDrawerContent />
    </Drawer>
  );
};
