import { useCallback } from "react";
import { useSideBarContainer } from "../components/SideBarContainer";
import { useEu4Actions } from "../store";

export function useSideBarPanTag() {
  const { panToTag, setSelectedTag } = useEu4Actions();
  const sidebarContainer = useSideBarContainer();

  return useCallback(
    (tag: string) => {
      setSelectedTag(tag);
      panToTag(
        tag,
        sidebarContainer.containerRef.current?.getBoundingClientRect().width,
      );
    },
    [panToTag, sidebarContainer, setSelectedTag],
  );
}
