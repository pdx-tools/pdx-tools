import { createPortal } from "react-dom";
import classes from "./PageDropOverlay.module.css";
import { useIsClient } from "@/hooks/useIsClient";
import { useFilePublisher } from "../hooks/useFilePublisher";
import { useFileDrop } from "@/hooks/useFileDrop";

export const DropHighlight = () => {
  const filePublisher = useFilePublisher();
  const { isHovering } = useFileDrop({
    onFile: (file) => filePublisher(file),
  });

  return (
    <div
      className={`absolute top-0 left-0 z-20 outline-blue-500/50 transition-all duration-200 ${
        isHovering
          ? `h-full w-full bg-blue-500/25 outline-solid ${classes["overlay-outline"]}`
          : "bg-transparent"
      }`}
    ></div>
  );
};

export const PageDropOverlay = () => {
  const isClient = useIsClient();
  if (isClient) {
    return createPortal(<DropHighlight />, document.body);
  } else {
    return null;
  }
};
