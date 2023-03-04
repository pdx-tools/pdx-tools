import { useEu4Actions, useEu4Map } from "../../store";
import { SideBarButton, SideBarButtonProps } from "../SideBarButton";

export const ZoomOutSideBarButton = ({
  children,
  ...props
}: SideBarButtonProps) => {
  const { zoomOut } = useEu4Actions();

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
