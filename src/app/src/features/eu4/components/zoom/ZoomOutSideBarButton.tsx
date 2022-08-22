import { getEu4Map, useEu4CanvasRef } from "@/features/engine";
import { useCallback } from "react";
import { SideBarButton, SideBarButtonProps } from "../SideBarButton";

export const ZoomOutSideBarButton = ({
  children,
  ...props
}: SideBarButtonProps) => {
  const eu4CanvasRef = useEu4CanvasRef();

  const zoomOut = useCallback(() => {
    const eu4Map = getEu4Map(eu4CanvasRef);
    eu4Map.zoomOut();
    eu4Map.redrawViewport();
  }, [eu4CanvasRef]);

  return (
    <SideBarButton
      {...props}
      className="h-[30px] w-[30px] p-0 text-lg text-white"
      onClick={zoomOut}
    >
      {children}
    </SideBarButton>
  );
};
