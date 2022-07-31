import React, { useRef, KeyboardEvent } from "react";
import { useSelector } from "react-redux";
import { useFilePublisher, selectIsFileHover } from "@/features/engine";
import classes from "./AnalyzeBox.module.css";

export function keyboardTrigger(fn: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.isPropagationStopped()) {
      e.stopPropagation();
      fn();
    }
  };
}

export const AnalyzeBox = () => {
  const publishFile = useFilePublisher();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isFileHover = useSelector(selectIsFileHover);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.currentTarget.files && e.currentTarget.files[0]) {
      publishFile({ kind: "local", file: e.currentTarget.files[0] });
    }
  };

  const labelFocus = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className="leading-relaxed">
      <label
        tabIndex={0}
        onKeyDown={keyboardTrigger(labelFocus)}
        className={`flex flex-col text-white text-center m-2 rounded-2xl cursor-pointer bg-transparent border-0 ${
          classes.label
        } ${isFileHover ? classes.hover : ""}`}
      >
        <div>Analyze a EU4 save for maps, graphs, and data.</div>
        <div>
          Drag and drop or{" "}
          <span className="ml-1 px-2 py-2 font-bold border-4 border-solid border-white rounded-xl hover:border-blue-500">
            browse
          </span>
        </div>
        <input
          ref={fileInputRef}
          hidden
          type="file"
          onChange={handleChange}
          accept=".eu4, .ck3, .hoi4, .rome"
        />
      </label>
    </div>
  );
};
