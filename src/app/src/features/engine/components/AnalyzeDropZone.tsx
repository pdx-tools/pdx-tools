import { useSelector } from "react-redux";
import { ZIndex } from "@/lib/zIndices";
import { selectIsFileHover } from "../engineSlice";

export const AnalyzeDropZone = () => {
  const isFileHover = useSelector(selectIsFileHover);

  return (
    <div className={isFileHover ? "hover" : undefined}>
      <style jsx>{`
        div {
          position: absolute;
          top: 0;
          left: 0;
          background-color: transparent;
          z-index: ${ZIndex.AnalyzeShadeOverlay};
        }

        .hover {
          background-color: rgba(var(--secondary-light), 0.5);
          outline: rgb(var(--secondary-light)) solid 2em;
          outline-offset: -2em;
          width: 100vw;
          height: 100vh;
        }
      `}</style>
    </div>
  );
};
