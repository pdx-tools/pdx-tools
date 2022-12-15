import { createPortal } from "react-dom";
import { ZIndex } from "@/lib/zIndices";
import classes from "./PageDropOverlay.module.css";
import { useIsClient } from "@/hooks/useIsClient";
import { useFilePublisher } from "../hooks/useFilePublisher";
import { useFileDrop } from "@/hooks/useFileDrop";

export const DropHighlight = () => {
  const filePublisher = useFilePublisher();
  const { isHovering } = useFileDrop({
    onFile: (file) => filePublisher({ kind: "local", file }),
  });

  return (
    <div
      style={{ zIndex: ZIndex.AnalyzeShadeOverlay }}
      className={`absolute top-0 left-0 bg-transparent transition duration-200 ${
        isHovering &&
        `h-full w-full bg-gray-500/25 outline outline-blue-500/50 ${classes["overlay-outline"]}`
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
