import { proxy, transfer } from "comlink";
import type { wrap } from "comlink";
import type { MapWorker } from "./map-worker-types";
import type { MapToken, ScreenshotOptions, UpdateOptions } from "./map-worker";
import type {
  UserRect,
  WheelEvent as WorkerWheelEvent,
  MoveEvent,
  DrawEvent,
} from "./map";

export class MapController {
  private lastScrollTime = 0;
  private mousePos = [0, 0];
  private initialMousePos = [0, 0];
  public dispose: (() => void) | undefined;

  constructor(
    private readonly worker: ReturnType<typeof wrap<MapWorker>>,
    private readonly mapToken: MapToken,
    public readonly canvas: HTMLCanvasElement,
    private readonly canvasContainer: HTMLElement,
  ) {}

  public register(options?: {
    onProvinceHover?: (provinceId: number) => void;
    onProvinceSelect?: (arg: {
      provinceId: number;
      colorIndex: number;
    }) => void;
    onDraw?: (event: DrawEvent) => void;
  }) {
    if (options?.onProvinceHover) {
      let hoverTimeout = 0;
      let currentHoverProvince: number | undefined;
      const hover = options.onProvinceHover;
      this.canvas.addEventListener("pointermove", ({ clientX, clientY }) => {
        window.clearTimeout(hoverTimeout);
        hoverTimeout = window.setTimeout(async () => {
          const province = await this.worker.findProvince(
            { clientX, clientY },
            this.mapToken,
          );
          if (province && province.provinceId !== currentHoverProvince) {
            currentHoverProvince = province.provinceId;
            hover(province.provinceId);
          }
        }, 100);
      });
    }

    if (options?.onProvinceSelect) {
      const select = options?.onProvinceSelect;
      this.canvas.addEventListener(
        "pointerup",
        async ({ clientX, clientY }) => {
          const diffX = Math.abs(clientX - this.initialMousePos[0]);
          const diffY = Math.abs(clientY - this.initialMousePos[1]);

          if (diffX + diffY > 15) {
            return;
          }

          const province = await this.worker.findProvince(
            { clientX, clientY },
            this.mapToken,
          );
          if (province) {
            select(province);
          }
        },
      );
    }

    if (options?.onDraw) {
      const draw = options.onDraw;
      this.worker.onDraw(this.mapToken, proxy(draw));
    }
  }

  public attachDOMHandlers() {
    // wire up resize observer
    const container = this.canvasContainer;
    let resiveObserverAF = 0;
    const ro = new ResizeObserver((_entries) => {
      // Why resive observer has RAF: https://stackoverflow.com/a/58701523
      cancelAnimationFrame(resiveObserverAF);
      resiveObserverAF = requestAnimationFrame(() => {
        const bounds = container.getBoundingClientRect();
        this.canvas.style.width = `${container.clientWidth}px`;
        this.canvas.style.height = `${container.clientHeight}px`;
        this.resize(bounds.width, bounds.height);
      });
    });
    ro.observe(container);

    // wire up DOM events
    let primaryPointer: PointerEvent | null = null;
    let secondaryPointer: PointerEvent | null = null;
    let pointerDiff = 0;
    const canvas = this.canvas;
    const controller = this; // oxlint-disable-line no-this-alias

    function moveCamera(e: MouseEvent) {
      const newPos = [e.clientX, e.clientY];
      controller.moveCamera({
        deltaX: newPos[0] - controller.mousePos[0],
        deltaY: newPos[1] - controller.mousePos[1],
      });
      controller.mousePos = newPos;
    }

    function handleMouseUp(_e: MouseEvent) {
      canvas.removeEventListener("pointermove", moveCamera);
      canvas.removeEventListener("pointerup", handleMouseUp);
    }

    function pinchUp(e: PointerEvent) {
      if (e.pointerId == primaryPointer?.pointerId) {
        primaryPointer = null;
      } else if (e.pointerId == secondaryPointer?.pointerId) {
        secondaryPointer = null;
      }

      controller.redrawViewport();
      canvas.removeEventListener("pointermove", pinchMove);
      canvas.removeEventListener("pointerup", pinchUp);
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
        (b.clientX - a.clientX) ** 2 + (b.clientY - a.clientY) ** 2,
      );

      if (pointerDiff != 0) {
        const midpoint = {
          clientX: (a.clientX + b.clientX) / 2,
          clientY: (a.clientY + b.clientY) / 2,
        };

        controller.wheel({
          ...midpoint,
          deltaY: pointerDiff - dist,
        });
      }

      pointerDiff = dist;
    }

    function handleMouseDown(
      e: PointerEvent & { preventDefault: () => void; button: number },
    ) {
      e.preventDefault();
      if (e.button === 0) {
        if (e.isPrimary) {
          primaryPointer = e;
          controller.mousePos = controller.initialMousePos = [
            e.clientX,
            e.clientY,
          ];
          canvas.addEventListener("pointermove", moveCamera);
          canvas.addEventListener("pointerup", handleMouseUp);
        } else {
          secondaryPointer = e;
          canvas.removeEventListener("pointermove", moveCamera);
          canvas.removeEventListener("pointerup", handleMouseUp);
          canvas.addEventListener("pointermove", pinchMove);
          canvas.addEventListener("pointerup", pinchUp);
        }
      }
    }

    function handleMouseWheel(e: WheelEvent) {
      e.preventDefault();
      controller.wheel({
        clientX: e.clientX,
        clientY: e.clientY,
        deltaY: e.deltaY,
      });
    }

    canvas.addEventListener("wheel", handleMouseWheel);
    canvas.addEventListener("pointerdown", handleMouseDown);
    canvas.addEventListener("pointerup", handleMouseUp);
    canvas.addEventListener("pointerleave", handleMouseUp);

    this.dispose = () => {
      canvas.removeEventListener("wheel", handleMouseWheel);
      canvas.removeEventListener("pointerdown", handleMouseDown);
      canvas.removeEventListener("pointerup", handleMouseUp);
      canvas.removeEventListener("pointerleave", handleMouseUp);

      ro.disconnect();
    };
  }

  public updateProvinceColors(
    primary: Uint8Array,
    secondary: Uint8Array,
    options?: { country?: Uint8Array; draw?: boolean },
  ) {
    this.worker.withCommands(
      transfer(
        [
          {
            kind: "province-colors",
            primary: primary,
            secondary: secondary,
          },
          ...(options?.country
            ? [
                {
                  kind: "country-province-colors",
                  primaryPoliticalColors: options.country,
                } as const,
              ]
            : []),
          ...(options?.draw ? [{ kind: "draw-map" } as const] : []),
        ],
        [primary.buffer],
      ),
      this.mapToken,
    );
  }

  public redrawMap() {
    return this.worker.withCommands([{ kind: "draw-map" }], this.mapToken);
  }

  public redrawViewport() {
    return this.worker.withCommands([{ kind: "draw-viewport" }], this.mapToken);
  }

  private moveCamera(event: MoveEvent) {
    this.worker.withCommands(
      [{ kind: "move-camera", event }, { kind: "draw-viewport" }],
      this.mapToken,
    );
  }

  private wheel(
    { clientX, clientY, deltaY }: Omit<WorkerWheelEvent, "eventDiff">,
    rect?: UserRect,
  ) {
    const time = performance.now();
    const eventDiff = time - this.lastScrollTime;
    this.lastScrollTime = time;
    if (eventDiff > 300) {
      return;
    }

    this.worker.withCommands(
      [
        { kind: "wheel", event: { clientX, clientY, deltaY, eventDiff }, rect },
        { kind: "draw-viewport" },
      ],
      this.mapToken,
    );
  }

  public zoomIn() {
    this.worker.withCommands(
      [{ kind: "zoom-in" }, { kind: "draw-viewport" }],
      this.mapToken,
    );
  }

  public zoomOut() {
    this.worker.withCommands(
      [{ kind: "zoom-out" }, { kind: "draw-viewport" }],
      this.mapToken,
    );
  }

  private resize(width: number, height: number) {
    this.worker.withCommands(
      [
        {
          kind: "resize",
          width,
          height,
        },
        { kind: "draw-viewport" },
      ],
      this.mapToken,
    );
  }

  public screenshot(
    screenshot: ScreenshotOptions,
    options?: ImageEncodeOptions,
  ) {
    return this.worker.screenshot(this.mapToken, screenshot, options);
  }

  public update(settings: UpdateOptions, options?: { draw?: boolean }) {
    const redrawMap =
      settings.showProvinceBorders ??
      settings.showCountryBorders ??
      settings.showMapModeBorders;
    const redrawEl = options?.draw
      ? [
          {
            kind: redrawMap !== undefined ? "draw-map" : "draw-viewport",
          } as const,
        ]
      : [];

    return this.worker.withCommands(
      [{ kind: "update", ...settings }, ...redrawEl],
      this.mapToken,
    );
  }

  public moveCameraTo(arg: { x: number; y: number; offsetX?: number }) {
    return this.worker.withCommands(
      [{ kind: "move-camera-to", event: arg }],
      this.mapToken,
    );
  }

  public highlightProvince({ colorIndex }: { colorIndex: number }) {
    return this.worker.highlightProvince(this.mapToken, colorIndex);
  }

  public unhighlightProvince() {
    return this.worker.unhighlightProvince(this.mapToken);
  }

  public setScaleOfMax(proportion: number) {
    return this.worker.proportionScale(this.mapToken, proportion);
  }

  public stash({ zoom }: { zoom: number }) {
    return this.worker.stash(this.mapToken, { zoom });
  }

  public popStash() {
    return this.worker.popStash(this.mapToken);
  }
}
