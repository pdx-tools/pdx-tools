import React, { useRef, KeyboardEvent } from "react";
import { useSelector } from "react-redux";
import { useFilePublisher, selectIsFileHover } from "@/features/engine";

export function keyboardTrigger(fn: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.isPropagationStopped()) {
      e.stopPropagation();
      fn();
    }
  };
}

export const AnalyzeBox: React.FC<{}> = () => {
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
    <div>
      <label
        tabIndex={0}
        onKeyDown={keyboardTrigger(labelFocus)}
        className={isFileHover ? "hover" : ""}
      >
        Maps, graphs, and data await your EU4 save. Drag and drop a save onto
        this page or select this box and analyze your save. PDX Tools is a
        modern EU4 savefile analyzer for the browser. Upload and share.
        <input
          ref={fileInputRef}
          hidden
          type="file"
          onChange={handleChange}
          accept=".eu4, .ck3, .hoi4, .rome"
        />
      </label>
      <style jsx>{`
        label {
          color: white;
        }

        label {
          border: 0;
          outline: 0.5rem dashed white;
          margin: 0.5rem;
          padding: 1rem 2rem;
          border-radius: 1rem;
          background-color: transparent;
          cursor: pointer;
          display: inline-block;
          font-size: 1.5rem;
        }

        @media screen and (min-width: 768px) {
          label {
            font-size: 2rem;
          }
        }

        .hover,
        label:hover,
        label:focus {
          outline: 0.5rem dashed rgb(var(--secondary-light));
        }
      `}</style>
    </div>
  );
};
