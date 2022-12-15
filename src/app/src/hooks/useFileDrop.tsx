import { useIsomorphicLayoutEffect } from "@/hooks/useIsomorphicLayoutEffect";
import { useEffect, useRef, useState } from "react";

// ref: https://css-tricks.com/snippets/javascript/test-if-dragenterdragover-event-contains-files/
function containsFiles(e: DragEvent): boolean {
  return e.dataTransfer?.types?.includes("Files") ?? false;
}

export interface FileDropProps {
  onFile: (file: File) => void | Promise<void>;
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
    onFileRef.current = (file: File) => {
      try {
        onFile(file);
      } finally {
        dragCount.current = 0;
      }
    };
  });

  useEffect(() => {
    function dragDrop(e: DragEvent) {
      if (!enabledRef.current || !containsFiles(e)) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      setHovering(false);

      if (e.dataTransfer && e.dataTransfer.items) {
        const items = e.dataTransfer.items;
        if (items.length !== 1) {
          throw Error("unexpected one file drop");
        }
        const file = items[0].getAsFile();
        if (file === null) {
          throw Error("bad dropped file");
        }

        onFileRef.current(file);
      } else if (e.dataTransfer && e.dataTransfer.files) {
        const files = e.dataTransfer.files;
        if (files.length !== 1) {
          throw Error("unexpected one file drop");
        }

        onFileRef.current(files[0]);
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
