import React from "react";
import {
  SideBarButtonProps,
  SideBarButton,
} from "../../components/SideBarButton";
import {
  SideBarContainerProvider,
  useSideBarContainerRef,
} from "../../components/SideBarContainer";
import { Sheet } from "@/components/Sheet";
import { useSaveFilename } from "../../store";
import { WatchContent } from "./WatchContent";

export const WatchSideBarButton = ({
  children,
  ...props
}: SideBarButtonProps) => {
  return (
    <Sheet modal={false}>
      <Sheet.Trigger asChild>
        <SideBarButton {...props}>{children}</SideBarButton>
      </Sheet.Trigger>

      <SideBarContainerProvider>
        <WatchSheetContent />
      </SideBarContainerProvider>
    </Sheet>
  );
};

const WatchSheetContent = () => {
  const sideBarContainerRef = useSideBarContainerRef();
  const filename = useSaveFilename();
  return (
    <Sheet.Content
      ref={sideBarContainerRef}
      side="right"
      onInteractOutside={(e) => e.preventDefault()}
      className="flex w-[800px] max-w-full flex-col bg-white pt-4 dark:bg-slate-900"
    >
      <Sheet.Header className="z-10 items-center px-4 pb-4 shadow-md">
        <Sheet.Close />
        <Sheet.Title>Watch {filename} for changes</Sheet.Title>
      </Sheet.Header>
      <Sheet.Body className="flex flex-col gap-2 px-4 py-6">
        <WatchContent />
      </Sheet.Body>
    </Sheet.Content>
  );
};
