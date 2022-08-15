import React, { useRef, KeyboardEvent } from "react";
import { useSelector } from "react-redux";
import { useFilePublisher, selectIsFileHover } from "@/features/engine";
import filetypes from "./file-types.png";
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
        className={`flex flex-col items-center text-white text-center m-2 rounded-2xl cursor-pointer bg-transparent border-0 outline-white outline-8 outline-dashed p-4 lg:p-8 ${
          classes.label
        } ${isFileHover ? classes.hover : ""}`}
      >
        <img
          src={filetypes}
          className="drop-shadow-xl mb-6"
          height={269}
          width={300}
          alt="Country budgetary breakdown"
        />
        <p className="text-2xl leading-loose mb-2">
          Select or drag and drop a save file
        </p>
        <input
          id="analyze-box-file-input"
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
