import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useFilePublisher } from "@/features/engine";
import filetypes from "./file-types.png";
import { useFileDrop } from "@/hooks/useFileDrop";

export const HeroFileInput = () => {
  const publishFile = useFilePublisher();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isHovering } = useFileDrop({
    onFile: (file) => publishFile(file),
  });
  const [fileSystemAccessApiEnabled, setFileSystemAccessApi] = useState(false);

  useEffect(() => {
    setFileSystemAccessApi("showOpenFilePicker" in window);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.currentTarget.files && e.currentTarget.files[0]) {
      publishFile({ kind: "file", file: e.currentTarget.files[0] });
      e.currentTarget.value = "";
    }
  };

  const className = `w-full m-8 flex cursor-pointer flex-col items-center rounded-2xl border-0 p-4 text-center outline-dashed outline-8 transition-all duration-150 hover:bg-black/10 hover:text-blue-200 hover:outline-blue-500 peer-focus:text-blue-200 peer-focus:outline-blue-500 lg:p-8 ${
    !isHovering
      ? "bg-black/20 text-white outline-white"
      : "bg-black/10 text-blue-200 outline-blue-500"
  }`;

  const acceptedFiles: `.${string}`[] = [
    ".eu4",
    ".ck3",
    ".hoi4",
    ".rome",
    ".v3",
  ];

  const children = (
    <>
      <Image
        src={filetypes}
        className="mb-6"
        height={269}
        width={300}
        alt={`Supported files: ${acceptedFiles.join(", ")}`}
        priority
      />
      <p className="mb-2 text-2xl leading-loose">
        Select or drag and drop a save file
      </p>
    </>
  );

  if (!fileSystemAccessApiEnabled) {
    return (
      <div className="flex leading-relaxed">
        <input
          id="analyze-box-file-input"
          ref={fileInputRef}
          type="file"
          className="peer absolute opacity-0"
          onChange={handleChange}
          accept=".eu4, .ck3, .hoi4, .rome, .v3"
        />

        <label htmlFor="analyze-box-file-input" className={className}>
          {children}
        </label>
      </div>
    );
  } else {
    return (
      <div className="flex leading-relaxed">
        <button
          className={className}
          onClick={async () => {
            try {
              var [fileHandle] = await window.showOpenFilePicker({
                multiple: false,
                types: [
                  {
                    description: "PDX Files",
                    accept: {
                      "application/pdx": acceptedFiles,
                    },
                  },
                ],
              });
            } catch (ex) {
              // User closing without selecting a file throws an exception
              // so we swallow it.
              return;
            }

            publishFile({ kind: "handle", file: fileHandle });
          }}
        >
          {children}
        </button>
      </div>
    );
  }
};
