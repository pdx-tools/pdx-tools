import React, { useRef, KeyboardEvent } from "react";
import { useSelector } from "react-redux";
import { useFilePublisher } from "@/features/engine";
import filetypes from "./file-types.png";
import classes from "./HeroFileInput.module.css";
import { useFileDrop } from "@/hooks/useFileDrop";

export function keyboardTrigger(fn: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.isPropagationStopped()) {
      e.stopPropagation();
      fn();
    }
  };
}

export const HeroFileInput = () => {
  const publishFile = useFilePublisher();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isHovering } = useFileDrop({
    onFile: (file) => publishFile({ kind: "local", file }),
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.currentTarget.files && e.currentTarget.files[0]) {
      publishFile({ kind: "local", file: e.currentTarget.files[0] });
    }
  };

  return (
    <div className="leading-relaxed">
      <label
        tabIndex={0}
        onKeyDown={keyboardTrigger(() => fileInputRef.current?.click())}
        className={`m-2 flex cursor-pointer flex-col items-center rounded-2xl border-0 bg-black/20 p-4 text-center text-white outline-dashed outline-8 outline-white transition-all duration-150 lg:p-8 ${
          classes.label
        } ${isHovering ? classes.hover : ""}`}
      >
        <img
          src={filetypes}
          className="mb-6 drop-shadow-xl"
          height={269}
          width={300}
          alt="Country budgetary breakdown"
        />
        <p className="mb-2 text-2xl leading-loose">
          Select or drag and drop a save file
        </p>
        <input
          id="analyze-box-file-input"
          ref={fileInputRef}
          hidden
          type="file"
          onChange={handleChange}
          accept=".eu4, .ck3, .hoi4, .rome, .v3"
        />
      </label>
    </div>
  );
};
