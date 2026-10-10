import React, { useRef, useSyncExternalStore } from "react";
import { DocumentIcon } from "@heroicons/react/24/solid";
import { useFilePublisher } from "@/features/engine";
import { useFileDrop } from "@/hooks/useFileDrop";
import compassSymbol from "./compass-symbol.webp";
import queenSymbol from "./queen.webp";
import militaryRank from "./military-rank.webp";
import { cx } from "class-variance-authority";
import { Badge } from "@/components/Badge";
import { toast } from "sonner";
import { ImportProgress } from "@/features/eu5/history/ImportProgress";
import { useHistory } from "@/features/eu5/history/store";

const emptySubscribe = () => () => {};
const hasFileSystemAccessApi = () => "showOpenFilePicker" in window;
const noFileSystemAccessApi = () => false;

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
  const progress = useHistory((state) => state.batchImportProgress);
  const importing = useRef<AbortController | null>(null);
  const publishFiles = async (files: File[], folder = false) => {
    if (!files.length || importing.current || useHistory.getState().batchImportProgress) return;
    if (files.length === 1 && !folder) {
      await publishFile({ kind: "file", file: files[0] });
      return;
    }
    if (!folder && files.some((file) => !/\.eu5$/i.test(file.name))) {
      toast.error("Select multiple EU5 saves, or one save from another game.");
      return;
    }
    const controller = new AbortController();
    importing.current = controller;
    try {
      const { importEu5Batch } = await import("@/features/eu5/history/importEu5Batch");
      const result = await importEu5Batch(files, controller, (file) =>
        publishFile({ kind: "file", file }),
      );
      if (result.issues.length)
        toast.warning(`${result.issues.length} import notices`, {
          description: result.issues.join("\n"),
        });
    } catch (error) {
      if (!controller.signal.aborted) toast.error(String(error));
    } finally {
      importing.current = null;
    }
  };
  const { isHovering } = useFileDrop({
    onFile: (file) => publishFile(file),
    enabled: !progress,
  });
  const fileSystemAccessApiEnabled = useSyncExternalStore(
    emptySubscribe,
    hasFileSystemAccessApi,
    noFileSystemAccessApi,
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.currentTarget.files) {
      void publishFiles(Array.from(e.currentTarget.files));
      e.currentTarget.value = "";
    }
  };

  const className = cx(
    "relative m-8 flex w-full cursor-pointer flex-col items-center rounded-2xl border-0 p-4 text-center outline-4 transition-all duration-150 outline-dashed peer-focus:text-blue-200 peer-focus:outline-blue-500 hover:bg-black/10 hover:text-blue-200 hover:outline-blue-500 lg:p-8 xl:p-16",
    !isHovering
      ? "bg-black/20 text-white outline-white/50"
      : "bg-black/10 text-blue-200 outline-blue-500",
  );

  const acceptedFiles: `.${string}`[] = [".eu4", ".eu5", ".ck3", ".hoi4", ".rome", ".v3"];

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
        Choose saves or drag and drop
      </p>
    </>
  );

  const input = !fileSystemAccessApiEnabled ? (
    <>
      <input
        id="analyze-box-file-input"
        ref={fileInputRef}
        type="file"
        multiple
        disabled={!!progress}
        className="peer absolute opacity-0"
        onChange={handleChange}
        accept={acceptedFiles.join(",")}
      />

      <label htmlFor="analyze-box-file-input" className={className}>
        {children}
      </label>
    </>
  ) : (
    <button
      className={className}
      onClick={async () => {
        if (importing.current) return;
        let handles: FileSystemFileHandle[];
        try {
          const result = await window.showOpenFilePicker({
            multiple: true,
            types: [
              {
                description: "PDX Files",
                accept: {
                  "application/pdx": acceptedFiles,
                },
              },
            ],
          });
          handles = result;
        } catch (e) {
          console.debug("File selection error, user may have cancelled", e);
          return;
        }

        try {
          if (handles.length === 1) {
            await publishFile({ kind: "handle", file: handles[0] });
          } else {
            await publishFiles(await Promise.all(handles.map((handle) => handle.getFile())));
          }
        } catch (error) {
          toast.error(String(error));
        }
      }}
    >
      {children}
    </button>
  );

  return (
    <div className="flex flex-col items-center leading-relaxed">
      <div className="flex h-[264px] xl:h-80">{input}</div>
      <label className="relative cursor-pointer rounded px-3 py-2 text-sm text-white underline focus-within:outline">
        Choose EU5 save folder
        <input
          aria-label="Choose EU5 save folder"
          type="file"
          multiple
          {...{ webkitdirectory: "" }}
          disabled={!!progress}
          className="absolute inset-0 w-full cursor-pointer opacity-0"
          onChange={(e) => {
            void publishFiles(Array.from(e.currentTarget.files ?? []), true);
            e.currentTarget.value = "";
          }}
        />
      </label>
      {progress && (
        <ImportProgress
          progress={progress}
          onCancel={() => useHistory.getState().cancelBatchImport?.()}
          light
        />
      )}
    </div>
  );
};
