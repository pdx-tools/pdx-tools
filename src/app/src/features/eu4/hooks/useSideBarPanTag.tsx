import { useCallback } from "react";
import { useSideBarContainer } from "../components/SideBarContainer";
import { useEu4Actions } from "../store";

export function useSideBarPanTag() {
  const { panToTag } = useEu4Actions();
  const sidebarContainer = useSideBarContainer();

  return useCallback(
    (tag: string) => {
      panToTag(
        tag,
        sidebarContainer.containerRef.current?.getBoundingClientRect().width
      );
    },
    [panToTag, sidebarContainer]
  );
}
