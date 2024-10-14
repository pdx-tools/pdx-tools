import { useEu4Actions } from "../../store";
import { SideBarButton, SideBarButtonProps } from "../SideBarButton";

export const ZoomInSideBarButton = ({
  children,
  ...props
}: SideBarButtonProps) => {
  const { zoomIn } = useEu4Actions();

  return (
    <SideBarButton {...props} onClick={zoomIn}>
      {children}
    </SideBarButton>
  );
};
