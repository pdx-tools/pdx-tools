import { useEu4Actions } from "../../store";
import { SideBarButton, type SideBarButtonProps } from "../SideBarButton";

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
