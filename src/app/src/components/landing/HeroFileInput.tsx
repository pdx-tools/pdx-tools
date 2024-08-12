import React, { useEffect, useRef, useState } from "react";
import { DocumentIcon } from "@heroicons/react/24/solid";
import { useFilePublisher } from "@/features/engine";
import { useFileDrop } from "@/hooks/useFileDrop";
import compassSymbol from "./compass-symbol.webp";
import queenSymbol from "./queen.webp";
import militaryRank from "./military-rank.webp";
import Image from "next/image";

function Eu4FileIcon() {
  return (
    <div className="absolute w-max translate-y-24 drop-shadow-lg">
      <div className="relative">
        <DocumentIcon className="h-32 w-32" />
        <Image
          src={compassSymbol}
          alt=""
          height="256"
          width="256"
          className="absolute top-1/4 w-1/2 left-1/4"
        />
      </div>
      <div className="absolute top-[104px] left-16 bg-slate-900 text-white font-semibold tracking-tight rounded px-2 py-0.5">
        .EU4
      </div>
      <div className="mt-5 ml-3 w-max bg-blue-500 text-white text-sm rounded-full px-3 py-0.5 opacity-80">
        Mehmet.eu4
      </div>
    </div>
  );
}

function V3FileIcon() {
  return (
    <div className="hidden sm:block absolute w-max rotate-12 translate-x-52 -translate-y-4 drop-shadow-lg">
      <div className="relative">
        <DocumentIcon className="h-32 w-32" />
        <Image
          src={queenSymbol}
          alt=""
          height="256"
          width="256"
          className="absolute top-10 w-14 h-14 left-9"
        />
      </div>
      <div className="absolute top-[104px] left-20 bg-slate-900 text-white font-semibold tracking-tight rounded px-2 py-0.5">
        .V3
      </div>
      <div className="mt-5 ml-3 w-max bg-blue-500 text-white text-sm rounded-full px-3 py-0.5 opacity-80">
        egalitarian.v3
      </div>
    </div>
  );
}

function Hoi4FileIcon() {
  return (
    <div className="hidden sm:block absolute w-max -rotate-12 -translate-x-44 -translate-y-10 drop-shadow-lg">
      <div className="relative">
        <DocumentIcon className="h-32 w-32" />
        <Image
          src={militaryRank}
          alt=""
          height="256"
          width="256"
          className="absolute top-10 left-1/4 w-14 h-14"
        />
      </div>
      <div className="absolute top-[104px] left-16 bg-slate-900 text-white font-semibold tracking-tight rounded px-2 py-0.5">
        .HOI4
      </div>
      <div className="mt-5 w-max bg-blue-500 text-white text-sm rounded-full px-3 py-0.5 opacity-80">
        blitzkrieg-bop.hoi4
      </div>
    </div>
  );
}

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

  const className = `w-full m-8 flex cursor-pointer flex-col items-center rounded-2xl border-0 p-4 text-center outline-dashed outline-4 transition-all duration-150 hover:bg-black/10 hover:text-blue-200 hover:outline-blue-500 peer-focus:text-blue-200 peer-focus:outline-blue-500 lg:p-8 ${
    !isHovering
      ? "bg-black/20 text-white outline-white/50"
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
      <Eu4FileIcon />
      <V3FileIcon />
      <Hoi4FileIcon />
      <p className="text-2xl leading-relaxed text-balance max-w-72 opacity-75">
        Choose file or drag and drop
      </p>
    </>
  );

  let input = !fileSystemAccessApiEnabled ? (
    <>
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
    </>
  ) : (
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
  );

  return (
    <div className="flex leading-relaxed max-w-[480px] h-[264px]">{input}</div>
  );
};
