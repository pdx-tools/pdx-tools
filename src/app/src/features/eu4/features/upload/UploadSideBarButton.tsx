import React from "react";
import {
  SideBarButtonProps,
  SideBarButton,
} from "@/features/eu4/components/SideBarButton";
import {
  UploadProvider,
  useUploadProgress,
  useUploadResponse,
} from "./uploadContext";
import { SideBarContainerProvider } from "../../components/SideBarContainer";
import { Alert } from "@/components/Alert";
import { HelpTooltip } from "@/components/HelpTooltip";
import { ProgressBar } from "@/components/ProgressBar";
import { SaveMode } from "../../components/save-mode";
import { useEu4Meta, useSaveFilename } from "../../store";
import { UploadDrawerContent } from "./UploadDrawerContent";
import { Sheet } from "@/components/Sheet";
import { Link } from "@/components/Link";

export const UploadSideBarButton = ({
  children,
  ...props
}: SideBarButtonProps) => {
  return (
    <UploadProvider>
      <Sheet modal={false}>
        <Sheet.Trigger asChild>
          <SideBarButton {...props}>{children}</SideBarButton>
        </Sheet.Trigger>
        <Sheet.Content
          side="right"
          className="flex w-[800px] max-w-full flex-col bg-white pt-4"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <SideBarContainerProvider>
            <Sheet.Header className="z-10 px-4 pb-4 shadow-md items-center">
              <Sheet.Close />
              <UploadDrawerTitle />
            </Sheet.Header>
            <Sheet.Body className="px-4 py-6">
              <UploadDrawerContent />
            </Sheet.Body>
          </SideBarContainerProvider>
        </Sheet.Content>
      </Sheet>
    </UploadProvider>
  );
};

export const UploadDrawerTitle = () => {
  const meta = useEu4Meta();
  const filename = useSaveFilename();
  const progress = useUploadProgress();
  const uploadResponse = useUploadResponse();
  return (
    <div className="flex w-full items-center gap-2">
      <SaveMode mode={meta.mode} />
      <Sheet.Title>Upload {filename}</Sheet.Title>
      <HelpTooltip help="Upload the save to PDX Tools servers so you can share a link with the world" />
      <span className="grow">
        {progress !== undefined && <ProgressBar height={30} value={progress} />}
        {uploadResponse ? (
          <Alert
            key={uploadResponse.save_id}
            className="px-2 py-1"
            variant="success"
          >
            <Alert.Description>
              {`Save successfully uploaded! `}
              <Link
                className="font-bold"
                href={`/eu4/saves/${uploadResponse.save_id}`}
              >
                Permalink
              </Link>
            </Alert.Description>
          </Alert>
        ) : null}
      </span>
    </div>
  );
};
