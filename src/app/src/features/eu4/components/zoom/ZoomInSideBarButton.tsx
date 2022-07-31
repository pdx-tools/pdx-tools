import { getEu4Map, useEu4CanvasRef } from "@/features/engine";
import { useCallback } from "react";
import { SideBarButton, SideBarButtonProps } from "../SideBarButton";

export const ZoomInSideBarButton = ({
  children,
  ...props
}: SideBarButtonProps) => {
  const eu4CanvasRef = useEu4CanvasRef();

  const zoomIn = useCallback(() => {
    const eu4Map = getEu4Map(eu4CanvasRef);
    eu4Map.zoomIn();
    eu4Map.redrawViewport();
  }, [eu4CanvasRef]);

  return (
    <SideBarButton
      {...props}
      className="p-0 w-[30px] h-[30px] text-white text-lg border-b-0"
      onClick={zoomIn}
    >
      {children}
    </SideBarButton>
  );
};
