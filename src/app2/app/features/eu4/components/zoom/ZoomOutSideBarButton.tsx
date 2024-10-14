import { useEu4Actions, useEu4Map } from "../../store";
import { SideBarButton, SideBarButtonProps } from "../SideBarButton";

export const ZoomOutSideBarButton = ({
  children,
  ...props
}: SideBarButtonProps) => {
  const { zoomOut } = useEu4Actions();

  return (
    <SideBarButton {...props} onClick={zoomOut}>
      {children}
    </SideBarButton>
  );
};
