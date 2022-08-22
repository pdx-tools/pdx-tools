import { useSelector } from "react-redux";
import { ZIndex } from "@/lib/zIndices";
import { selectIsFileHover } from "../engineSlice";
import classes from "./AnalyzeDropZone.module.css";

export const AnalyzeDropZone = () => {
  const isFileHover = useSelector(selectIsFileHover);

  return (
    <div
      style={{ zIndex: ZIndex.AnalyzeShadeOverlay }}
      className={`absolute top-0 left-0 bg-transparent transition ${
        isFileHover &&
        `h-screen w-screen bg-gray-500/25 outline outline-blue-500/50 ${classes["overlay-outline"]}`
      }`}
    ></div>
  );
};
