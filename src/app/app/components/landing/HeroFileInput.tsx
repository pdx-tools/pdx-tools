import React, { useEffect, useRef, useState } from "react";
import { DocumentIcon } from "@heroicons/react/24/solid";
import { useFilePublisher } from "@/features/engine";
import { useFileDrop } from "@/hooks/useFileDrop";
import compassSymbol from "./compass-symbol.webp";
import queenSymbol from "./queen.webp";
import militaryRank from "./military-rank.webp";
import { cx } from "class-variance-authority";

function Eu4FileIcon() {
  return (
    <div className="absolute w-max translate-y-24 drop-shadow-lg">
      <div className="relative">
        <DocumentIcon className="h-32 w-32" />
        <img
          src={compassSymbol}
          alt=""
          height="256"
          width="256"
          className="absolute left-1/4 top-1/4 w-1/2"
        />
      </div>
      <div className="absolute left-16 top-[104px] rounded bg-slate-900 px-2 py-0.5 font-semibold tracking-tight text-white">
        .EU4
      </div>
      <div className="ml-3 mt-5 w-max rounded-full bg-blue-500 px-3 py-0.5 text-sm text-white opacity-80">
        Mehmet.eu4
      </div>
    </div>
  );
}

function V3FileIcon() {
  return (
    <div className="absolute hidden w-max -translate-y-4 translate-x-44 rotate-12 drop-shadow-lg sm:block xl:translate-x-52">
      <div className="relative">
        <DocumentIcon className="h-32 w-32" />
        <img
          src={queenSymbol}
          alt=""
          height="256"
          width="256"
          className="absolute left-9 top-10 h-14 w-14"
        />
      </div>
      <div className="absolute left-20 top-[104px] rounded bg-slate-900 px-2 py-0.5 font-semibold tracking-tight text-white">
        .V3
      </div>
      <div className="ml-3 mt-5 w-max rounded-full bg-blue-500 px-3 py-0.5 text-sm text-white opacity-80">
        egalitarian.v3
      </div>
    </div>
  );
}

function Hoi4FileIcon() {
  return (
    <div className="absolute hidden w-max -translate-x-44 -translate-y-10 -rotate-12 drop-shadow-lg sm:block">
      <div className="relative">
        <DocumentIcon className="h-32 w-32" />
        <img
          src={militaryRank}
          alt=""
          height="256"
          width="256"
          className="absolute left-1/4 top-10 h-14 w-14"
        />
      </div>
      <div className="absolute left-16 top-[104px] rounded bg-slate-900 px-2 py-0.5 font-semibold tracking-tight text-white">
        .HOI4
      </div>
      <div className="mt-5 w-max rounded-full bg-blue-500 px-3 py-0.5 text-sm text-white opacity-80">
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

  const className = cx(
    "m-8 flex w-full cursor-pointer flex-col items-center rounded-2xl border-0 p-4 text-center outline-dashed outline-4 transition-all duration-150 hover:bg-black/10 hover:text-blue-200 hover:outline-blue-500 peer-focus:text-blue-200 peer-focus:outline-blue-500 lg:p-8 xl:p-16",
    !isHovering
      ? "bg-black/20 text-white outline-white/50"
      : "bg-black/10 text-blue-200 outline-blue-500",
  );

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
      <p className="max-w-72 text-balance text-2xl leading-relaxed opacity-75">
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

  return <div className="flex h-[264px] leading-relaxed xl:h-80">{input}</div>;
};
