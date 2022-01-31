import {
  useEu4CanvasRef,
  useCanvasRef,
  getEu4Canvas,
  getCanvas,
} from "@/features/engine";
import { useEffect } from "react";

export function useCanvasPointerEvents() {
  const mapRef = useEu4CanvasRef();
  const canvasRef = useCanvasRef();

  useEffect(() => {
    let primaryPointer: PointerEvent | null = null;
    let secondaryPointer: PointerEvent | null = null;
    let pointerDiff = 0;

    const canvas = getCanvas(canvasRef);
    const map = getEu4Canvas(mapRef);

    function moveCamera(e: MouseEvent) {
      map.moveCamera(e);
      map.redrawViewport();
    }

    function handleMouseUp(e: MouseEvent) {
      map.onMouseUp(e);
      window.removeEventListener("pointermove", moveCamera);
      window.removeEventListener("pointerup", handleMouseUp);
    }

    function pinchUp(e: PointerEvent) {
      if (e.pointerId == primaryPointer?.pointerId) {
        primaryPointer = null;
      } else if (e.pointerId == secondaryPointer?.pointerId) {
        secondaryPointer = null;
      }

      map.redrawViewport();
      window.removeEventListener("pointermove", pinchMove);
      window.removeEventListener("pointerup", pinchUp);
    }

    function pinchMove(e: PointerEvent) {
      if (e.pointerId == primaryPointer?.pointerId) {
        primaryPointer = e;
      } else if (e.pointerId == secondaryPointer?.pointerId) {
        secondaryPointer = e;
      }

      if (!primaryPointer || !secondaryPointer) {
        return;
      }

      const a = primaryPointer;
      const b = secondaryPointer;

      const dist = Math.sqrt(
        (b.clientX - a.clientX) ** 2 + (b.clientY - a.clientY) ** 2
      );

      if (pointerDiff != 0) {
        const midpoint = {
          clientX: (a.clientX + b.clientX) / 2,
          clientY: (a.clientY + b.clientY) / 2,
        };

        map.onWheel({
          ...midpoint,
          deltaY: pointerDiff - dist,
        });
        map.redrawViewport();
      }

      pointerDiff = dist;
    }

    function handleMouseDown(
      e: PointerEvent & { preventDefault: () => void; button: number }
    ) {
      e.preventDefault();
      if (e.button === 0) {
        if (e.isPrimary) {
          primaryPointer = e;
          map.onMouseDown(e);
          window.addEventListener("pointermove", moveCamera);
          window.addEventListener("pointerup", handleMouseUp);
        } else {
          secondaryPointer = e;
          window.removeEventListener("pointermove", moveCamera);
          window.removeEventListener("pointerup", handleMouseUp);
          window.addEventListener("pointermove", pinchMove);
          window.addEventListener("pointerup", pinchUp);
        }
      }
    }

    function handleMouseWheel(e: WheelEvent) {
      e.preventDefault();
      map.onWheel(e);
      map.redrawViewport();
    }

    canvas.addEventListener("wheel", handleMouseWheel);
    canvas.addEventListener("pointerdown", handleMouseDown);
    canvas.addEventListener("pointerup", handleMouseUp);
  }, [canvasRef, mapRef]);
}
