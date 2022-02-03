import React, { RefObject, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { glContext } from "../eu4/features/map/resources";
import { Eu4Canvas } from "../eu4/features/map/Eu4Canvas";
import { canvasResize, selectShowCanvas } from "./engineSlice";

interface CanvasContextProps {
  canvasRef: RefObject<HTMLCanvasElement>;
  glRef: RefObject<WebGL2RenderingContext | undefined>;
  containerRef: RefObject<HTMLDivElement>;
  eu4CanvasRef: RefObject<Eu4Canvas | undefined>;
}

const CanvasContext = React.createContext<CanvasContextProps | undefined>(
  undefined
);

export const CanvasContextProvider: React.FC<{}> = ({ children }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<WebGL2RenderingContext>();
  const eu4CanvasRef = useRef<Eu4Canvas>();
  const dispatch = useDispatch();
  const showCanvas = useSelector(selectShowCanvas);
  const [positioning, setPositioning] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;

    if (container && canvas) {
      let resiveObserverAF = 0;
      const ro = new ResizeObserver((_entries) => {
        // Why resive observer has RAF: https://stackoverflow.com/a/58701523
        cancelAnimationFrame(resiveObserverAF);
        resiveObserverAF = requestAnimationFrame(() => {
          const bounds = container.getBoundingClientRect();
          dispatch(canvasResize([bounds.width, bounds.height]));
        });
      });
      ro.observe(container);
    }
  }, [dispatch]);

  useEffect(() => {
    const gl = glContext(getCanvas(canvasRef));
    if (gl === null) {
      throw new Error("webgl 2 context is undefined");
    } else {
      eu4CanvasRef.current = new Eu4Canvas(gl);
      glRef.current = gl;
    }
  }, []);

  useEffect(() => {
    setPositioning(containerRef.current?.getBoundingClientRect().y ?? 0);
  }, [containerRef]);

  return (
    <>
      <div
        ref={containerRef}
        style={{ display: showCanvas ? "flex" : "none", top: -positioning }}
      >
        <canvas ref={canvasRef} hidden={true} />
        <style jsx>{`
          canvas {
            max-width: 100%;
          }

          div {
            width: 100%;
            height: 100%;
            touch-action: none;
            position: absolute;
          }
        `}</style>
      </div>
      <CanvasContext.Provider
        value={{ canvasRef, containerRef, glRef, eu4CanvasRef }}
      >
        {children}
      </CanvasContext.Provider>
    </>
  );
};

export function getCanvas(x: CanvasContextProps["canvasRef"]) {
  if (!x.current) {
    throw new Error("canvas is undefined");
  } else {
    return x.current;
  }
}

export function getGl(x: CanvasContextProps["glRef"]) {
  if (!x.current) {
    throw new Error("webgl context is undefined");
  } else {
    return x.current;
  }
}

export function getEu4Canvas(x: CanvasContextProps["eu4CanvasRef"]) {
  if (!x.current) {
    throw new Error("eu4 canvas is undefined");
  } else {
    return x.current;
  }
}

export function getEu4Map(x: CanvasContextProps["eu4CanvasRef"]) {
  const canvas = getEu4Canvas(x);
  if (!canvas.map) {
    throw new Error("eu4 map is undefined");
  } else {
    return canvas.map;
  }
}

function useCanvasContext() {
  const data = React.useContext(CanvasContext);
  if (data === undefined) {
    throw new Error("canvas context is undefined");
  }

  return data;
}

export function useCanvasRef() {
  return useCanvasContext().canvasRef;
}

export function useCanvasGl2Ref() {
  return useCanvasContext().glRef;
}

export function useEu4CanvasRef() {
  return useCanvasContext().eu4CanvasRef;
}
