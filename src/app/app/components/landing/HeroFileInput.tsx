import React, { useEffect, useRef, useState } from "react";
import { DocumentIcon } from "@heroicons/react/24/solid";
import { useFilePublisher } from "@/features/engine";
import { useFileDrop } from "@/hooks/useFileDrop";
import compassSymbol from "./compass-symbol.webp";
import queenSymbol from "./queen.webp";
import militaryRank from "./military-rank.webp";
import { cx } from "class-variance-authority";
import { Badge } from "@/components/Badge";

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
          className="absolute top-1/4 left-1/4 w-1/2"
        />
      </div>
      <div className="absolute top-[104px] left-16 rounded bg-slate-900 px-2 py-0.5 font-semibold tracking-tight text-white">
        .EU4
      </div>
      <div className="mt-5 ml-3 w-max rounded-full bg-blue-500 px-3 py-0.5 text-sm text-white opacity-80">
        Mehmet.eu4
      </div>
    </div>
  );
}

function V3FileIcon() {
  return (
    <div className="absolute hidden w-max translate-x-44 -translate-y-4 rotate-12 drop-shadow-lg sm:block xl:translate-x-52">
      <div className="relative">
        <DocumentIcon className="h-32 w-32" />
        <img
          src={queenSymbol}
          alt=""
          height="256"
          width="256"
          className="absolute top-10 left-9 h-14 w-14"
        />
      </div>
      <div className="absolute top-[104px] left-20 rounded bg-slate-900 px-2 py-0.5 font-semibold tracking-tight text-white">
        .V3
      </div>
      <div className="mt-5 ml-3 w-max rounded-full bg-blue-500 px-3 py-0.5 text-sm text-white opacity-80">
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
          className="absolute top-10 left-1/4 h-14 w-14"
        />
      </div>
      <div className="absolute top-[104px] left-16 rounded bg-slate-900 px-2 py-0.5 font-semibold tracking-tight text-white">
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
    "relative m-8 flex w-full cursor-pointer flex-col items-center rounded-2xl border-0 p-4 text-center outline-4 transition-all duration-150 outline-dashed peer-focus:text-blue-200 peer-focus:outline-blue-500 hover:bg-black/10 hover:text-blue-200 hover:outline-blue-500 lg:p-8 xl:p-16",
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
      <div className="absolute -top-5 left-1/2 -translate-x-1/2 sm:-top-6">
        <Badge
          variant="ghost"
          className="flex items-center gap-2 border-0 bg-emerald-200/90 px-4 py-1 text-xs font-semibold text-emerald-900 shadow-lg ring-1 shadow-emerald-900/10 ring-emerald-100/80 sm:text-sm"
        >
          <Badge
            variant="ghost"
            className="border-0 bg-emerald-500 px-2 py-0.5 text-[10px] tracking-wide text-white uppercase shadow shadow-emerald-950/20 sm:text-xs"
          >
            New
          </Badge>
          EU5
        </Badge>
      </div>
      <Eu4FileIcon />
      <V3FileIcon />
      <Hoi4FileIcon />
      <p className="max-w-72 text-2xl leading-relaxed text-balance opacity-75">
        Choose file or drag and drop
      </p>
    </>
  );

  const input = !fileSystemAccessApiEnabled ? (
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
        let fileHandle: FileSystemFileHandle;
        try {
          const result = await window.showOpenFilePicker({
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
          fileHandle = result[0];
        } catch (e) {
          console.debug("File selection error, user may have cancelled", e);
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
