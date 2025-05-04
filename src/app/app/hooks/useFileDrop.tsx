import { useIsomorphicLayoutEffect } from "@/hooks/useIsomorphicLayoutEffect";
import { useEffect, useRef, useState } from "react";

function containsFiles(e: DragEvent): boolean {
  return (
    e.dataTransfer?.items?.[0].kind === "file" ||
    e.dataTransfer?.files?.[0] !== undefined
  );
}

export type FileKind =
  | {
      kind: "file";
      file: File;
    }
  | {
      kind: "handle";
      file: FileSystemFileHandle;
    };

export type FilesCallback = (files: FileKind[]) => void | Promise<void>;

export interface FileDropProps {
  onFile: FilesCallback;
  enabled?: boolean;
}

export function useFileDrop({ onFile, enabled = true }: FileDropProps) {
  const [isHovering, setHovering] = useState(false);

  // keep count of drags: https://stackoverflow.com/a/21002544/433785
  const dragCount = useRef(0);

  // Latest ref pattern for props. This way we don't need to add and remove
  // event listeners every time one of them changes.
  const enabledRef = useRef(enabled);
  const onFileRef = useRef(onFile);
  useIsomorphicLayoutEffect(() => {
    enabledRef.current = enabled;
    onFileRef.current = (...args) => {
      try {
        onFile(...args);
      } finally {
        dragCount.current = 0;
      }
    };
  });

  useEffect(() => {
    async function dragDrop(e: DragEvent) {
      if (!enabledRef.current) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      setHovering(false);

      const fileList: FileKind[] = [];

      if (e.dataTransfer && e.dataTransfer.items) {
        const items = e.dataTransfer.items;
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if ("getAsFileSystemHandle" in item) {
            const handle = await item.getAsFileSystemHandle();
            if (handle !== null && handle.kind === "file") {
              const file = handle as FileSystemFileHandle;
              fileList.push({ kind: "handle", file });
              continue;
            }
          }

          const file = item.getAsFile();
          if (file === null) {
            continue;
          }

          fileList.push({ kind: "file", file });
        }
      } else if (e.dataTransfer && e.dataTransfer.files) {
        const files = e.dataTransfer.files;
        for (let i = 0; i < files.length; i++) {
          fileList.push({ kind: "file", file: files[i] });
        }
      } else {
        throw Error("unexpected data transfer");
      }

      if (fileList.length === 0) {
        throw new Error("no files found in data transfer");
      }

      onFileRef.current(fileList);
    }

    function highlight(e: DragEvent) {
      if (enabledRef.current && containsFiles(e)) {
        dragCount.current += 1;
        e.preventDefault();
        e.stopPropagation();
        setHovering(true);
      }
    }

    function unhighlight(e: DragEvent) {
      if (enabledRef.current && containsFiles(e)) {
        dragCount.current -= 1;
        e.preventDefault();
        e.stopPropagation();
        setHovering(dragCount.current !== 0);
      }
    }

    // If you want to allow a drop, you must prevent the default handling by
    // cancelling both the dragenter and dragover events
    // ref: https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/Drag_operations#specifying_drop_targets
    function dragover(e: DragEvent) {
      e.preventDefault();
    }

    document.addEventListener("drop", dragDrop, { capture: true });
    document.addEventListener("dragenter", highlight, false);
    document.addEventListener("dragleave", unhighlight, false);
    document.addEventListener("dragover", dragover, false);

    return () => {
      document.removeEventListener("drop", dragDrop, { capture: true });
      document.removeEventListener("dragenter", highlight, false);
      document.removeEventListener("dragleave", unhighlight, false);
      document.removeEventListener("dragover", dragover, false);
    };
  }, []);

  return { isHovering };
}
