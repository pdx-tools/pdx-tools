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
      style={{
        height: "30px",
        width: "30px",
        color: "white",
        fontSize: "large",
      }}
      onClick={zoomIn}
    >
      {children}
    </SideBarButton>
  );
};
