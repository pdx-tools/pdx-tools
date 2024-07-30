import React, { RefObject, useRef } from "react";

interface SideBarContainerContext {
  containerRef: RefObject<HTMLDivElement>;
}

const SideBarContainerContext = React.createContext<
  SideBarContainerContext | undefined
>(undefined);

interface SideBarContainerProviderProps {
  children: React.ReactNode;
}

export const SideBarContainerProvider = ({
  children,
}: SideBarContainerProviderProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  return (
    <SideBarContainerContext.Provider value={{ containerRef }}>
      {children}
    </SideBarContainerContext.Provider>
  );
};

export function useSideBarContainer() {
  const data = React.useContext(SideBarContainerContext);
  if (data === undefined) {
    throw new Error("side bar container is undefined");
  }

  return data;
}

export function useSideBarContainerRef() {
  return useSideBarContainer().containerRef;
}

export function closeDrawerPropagation(fn: () => void, visible: boolean) {
  return (ev: { stopPropagation: () => void }) => {
    fn();
    if (visible) {
      ev.stopPropagation();
    }
  };
}

export function getSideBarContainerWidth(
  x: ReturnType<typeof useSideBarContainer>,
) {
  if (!x.containerRef.current) {
    throw new Error("side bar container element is undefined");
  }

  return x.containerRef.current.getBoundingClientRect().width;
}
