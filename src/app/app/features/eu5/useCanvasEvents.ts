import { useCallback, useEffect } from "react";
import type { RefObject } from "react";
import type { AppEngine } from "./ui-engine";

export function useCanvasEvents(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  engine: AppEngine | null,
) {
  // Event handlers
  const handlePointerEvent = useCallback(
    (e: PointerEvent) => {
      if (!engine) return;
      e.preventDefault();

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const pos = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };

      switch (e.type) {
        case "pointerdown":
          // Manually focus canvas since preventDefault blocks default focus behavior
          canvasRef.current?.focus();
          engine.trigger.pointerStart(pos, e.pointerId);
          canvasRef.current?.setPointerCapture(e.pointerId);
          break;
        case "pointermove":
          engine.trigger.pointerMove(pos, e.pointerId);
          break;
        case "pointerup":
          engine.trigger.pointerEnd(e.pointerId);
          canvasRef.current?.releasePointerCapture(e.pointerId);
          break;
        case "pointercancel":
          engine.trigger.pointerCancel(e.pointerId);
          canvasRef.current?.releasePointerCapture(e.pointerId);
          break;
      }
    },
    [engine, canvasRef],
  );

  const handleMouseEvent = useCallback(
    (e: MouseEvent) => {
      if (!engine) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const pos = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };

      switch (e.type) {
        case "mousedown":
          engine.trigger.mouseDown(pos);
          break;
        case "mousemove":
          engine.trigger.mouseMove(pos);
          break;
        case "mouseup":
          engine.trigger.mouseUp();
          break;
        case "mouseleave":
          engine.trigger.mouseLeave();
          break;
        case "click":
          engine.trigger.click(pos);
          break;
      }
    },
    [engine, canvasRef],
  );

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (!engine) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const center = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      const delta = e.deltaY > 0 ? 0.9 : 1.1;

      engine.trigger.zoom({ center, delta });
    },
    [engine, canvasRef],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!engine) return;
      if (e.repeat) return;
      engine.trigger.keyDown(e.code);
    },
    [engine],
  );

  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      if (!engine) return;
      engine.trigger.keyUp(e.code);
    },
    [engine],
  );

  // Set up event listeners on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !engine) return;

    const controller = new AbortController();
    const options = { signal: controller.signal };
    canvas.addEventListener("pointerdown", handlePointerEvent, options);
    canvas.addEventListener("pointermove", handlePointerEvent, options);
    canvas.addEventListener("pointerup", handlePointerEvent, options);
    canvas.addEventListener("pointercancel", handlePointerEvent, options);
    canvas.addEventListener("mousedown", handleMouseEvent, options);
    canvas.addEventListener("mousemove", handleMouseEvent, options);
    canvas.addEventListener("mouseup", handleMouseEvent, options);
    canvas.addEventListener("mouseleave", handleMouseEvent, options);
    canvas.addEventListener("click", handleMouseEvent, options);
    canvas.addEventListener("wheel", handleWheel, options);
    canvas.addEventListener("keydown", handleKeyDown, options);
    canvas.addEventListener("keyup", handleKeyUp, options);

    return () => {
      controller.abort();
    };
  }, [
    handlePointerEvent,
    handleMouseEvent,
    handleWheel,
    handleKeyDown,
    handleKeyUp,
    engine,
    canvasRef,
  ]);

  // Set canvas cursor style
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !engine) return;

    canvas.style.cursor = "grab";
  }, [canvasRef, engine]);

  // Handle container resize
  useEffect(() => {
    if (!engine) return;

    const container = canvasRef.current?.parentElement;
    if (!container) return;

    const handleResize = (width: number, height: number) => {
      engine.trigger.resize(width, height);
    };

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        handleResize(width, height);
      }
    });

    resizeObserver.observe(container);
    return () => {
      resizeObserver.disconnect();
    };
  }, [engine, canvasRef]);
}
