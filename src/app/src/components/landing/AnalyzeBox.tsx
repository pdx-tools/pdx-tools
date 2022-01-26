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
        className={`flex-col text-center ${isFileHover ? "hover" : ""}`}
      >
        <div>Analyze a EU4 save for maps, graphs, and data.</div>
        <div>
          Drag and drop or <span className="font-bold">browse</span>
        </div>
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
          padding-block: clamp(1rem, 10%, 6rem);
          padding-inline: clamp(1rem, 10%, 6rem);
          border-radius: 1rem;
          background-color: transparent;
          cursor: pointer;
          font-size: clamp(1.25rem, 3vw, 2rem);
          gap: clamp(1.25rem, 3vw, 2rem);
        }

        .hover,
        label:hover,
        label:focus {
          outline: 0.5rem dashed rgb(var(--secondary-light));
        }

        span {
          margin-inline-start: 0.5rem;

          /* From antd: */
          border-radius: 4px;
          padding: 4px 15px;
          border: 4px solid #d9d9d9;
          transition: all 0.3s cubic-bezier(0.645, 0.045, 0.355, 1);
        }

        span:hover,
        span:focus {
          border-color: rgb(var(--secondary-light));
          color: rgb(var(--secondary-light));
        }
      `}</style>
    </div>
  );
};
