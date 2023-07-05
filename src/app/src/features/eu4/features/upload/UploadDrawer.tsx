import React from "react";
import { Drawer, Typography } from "antd";
import { useUploadProgress, useUploadResponse } from "./uploadContext";
import { UploadDrawerContent } from "./UploadDrawerContent";
import { HelpTooltip } from "@/components/HelpTooltip";
import { ProgressBar } from "@/components/ProgressBar";
import { SaveMode } from "../../components/save-mode";
import { closeDrawerPropagation } from "../../components/SideBarContainer";
import { useEu4Meta, useSaveFilename } from "../../store";
import { Alert, AlertDescription } from "@/components/Alert";
import Link from "next/link";
const { Text } = Typography;

interface UploadDrawerProps {
  visible: boolean;
  closeDrawer: () => void;
}

export const UploadDrawerTitle = () => {
  const meta = useEu4Meta();
  const filename = useSaveFilename();
  const progress = useUploadProgress();
  const uploadResponse = useUploadResponse();
  return (
    <div className="flex items-center gap-2">
      <SaveMode mode={meta.mode} />
      <span>{`Upload ${filename}`}</span>
      <HelpTooltip help="Upload the save to PDX Tools servers so you can share a link with the world" />
      <span className="grow">
        {progress !== undefined && <ProgressBar height={30} value={progress} />}
        {uploadResponse ? (
          <Alert
            key={uploadResponse.save_id}
            className="px-2 py-1"
            variant="success"
          >
            <AlertDescription>
              <Text
                copyable={{
                  text: `${location.origin}/eu4/saves/${uploadResponse.save_id}`,
                }}
              >
                {`Save successfully uploaded! `}
                <Link href={`/eu4/saves/${uploadResponse.save_id}`}>
                  Permalink
                </Link>
              </Text>
            </AlertDescription>
          </Alert>
        ) : null}
      </span>
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
      onClose={closeDrawerPropagation(closeDrawer, visible)}
      visible={visible}
      width="min(800px, 100%)"
    >
      <UploadDrawerContent />
    </Drawer>
  );
};
