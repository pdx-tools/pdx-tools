import { useIsomorphicLayoutEffect } from "@/hooks/useIsomorphicLayoutEffect";
import { useEffect, useRef, useState } from "react";

function containsFiles(e: DragEvent): boolean {
  const arr = e.dataTransfer?.items;
  return arr !== undefined && arr.length > 0 && [...arr].every((x) => x.kind === "file");
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

export interface FileDropProps {
  /** The dropped files, in drop order. */
  onFile: (inputs: FileKind[]) => void | Promise<void>;
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
    onFileRef.current = (files: FileKind[]) => {
      try {
        onFile(files);
      } finally {
        dragCount.current = 0;
      }
    };
  });

  useEffect(() => {
    async function dragDrop(e: DragEvent) {
      if (!enabledRef.current || !containsFiles(e)) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      setHovering(false);

      if (e.dataTransfer && e.dataTransfer.items) {
        // The items are only readable during the event, so every request
        // for a handle or a file starts before the first await.
        const items = [...e.dataTransfer.items];
        const requests = items.map((item) => ({
          handle: "getAsFileSystemHandle" in item ? item.getAsFileSystemHandle() : null,
          file: item.getAsFile(),
        }));

        const files: FileKind[] = [];
        for (const request of requests) {
          const handle = await request.handle;
          if (handle?.kind === "file") {
            files.push({ kind: "handle", file: handle as FileSystemFileHandle });
          } else if (request.file !== null) {
            files.push({ kind: "file", file: request.file });
          }
        }

        if (files.length === 0) {
          throw Error("bad dropped file");
        }

        onFileRef.current(files);
      } else if (e.dataTransfer && e.dataTransfer.files) {
        const files = [...e.dataTransfer.files];
        if (files.length === 0) {
          throw Error("bad dropped file");
        }

        onFileRef.current(files.map((file) => ({ kind: "file", file })));
      } else {
        throw Error("unexpected data transfer");
      }
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
