import { useEu4Actions } from "../../Eu4SaveProvider";
import { SideBarButton, SideBarButtonProps } from "../SideBarButton";

export const ZoomInSideBarButton = ({
  children,
  ...props
}: SideBarButtonProps) => {
  const { zoomIn } = useEu4Actions();

  return (
    <SideBarButton
      {...props}
      className="h-[30px] w-[30px] border-b-0 p-0 text-lg text-white"
      onClick={zoomIn}
    >
      {children}
    </SideBarButton>
  );
};
