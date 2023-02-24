import React, { useRef } from "react";
import Image from "next/image";
import { useFilePublisher } from "@/features/engine";
import filetypes from "./file-types.png";
import { useFileDrop } from "@/hooks/useFileDrop";

export const HeroFileInput = () => {
  const publishFile = useFilePublisher();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isHovering } = useFileDrop({
    onFile: (file) => publishFile({ kind: "local", file }),
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.currentTarget.files && e.currentTarget.files[0]) {
      publishFile({ kind: "local", file: e.currentTarget.files[0] });
      e.currentTarget.value = "";
    }
  };

  return (
    <div className="leading-relaxed">
      <input
        id="analyze-box-file-input"
        ref={fileInputRef}
        type="file"
        className="peer absolute opacity-0"
        onChange={handleChange}
        accept=".eu4, .ck3, .hoi4, .rome, .v3"
      />

      <label
        htmlFor="analyze-box-file-input"
        className={`m-2 flex cursor-pointer flex-col items-center rounded-2xl border-0 p-4 text-center outline-dashed outline-8 transition-all duration-150 hover:bg-black/10 hover:text-blue-200 hover:outline-blue-500 peer-focus:text-blue-200 peer-focus:outline-blue-500 lg:p-8 ${
          !isHovering
            ? "bg-black/20 text-white outline-white"
            : "bg-black/10 text-blue-200 outline-blue-500"
        }`}
      >
        <Image
          src={filetypes}
          className="mb-6 drop-shadow-xl"
          height={269}
          width={300}
          alt="Country budgetary breakdown"
          priority
        />
        <p className="mb-2 text-2xl leading-loose">
          Select or drag and drop a save file
        </p>
      </label>
    </div>
  );
};
