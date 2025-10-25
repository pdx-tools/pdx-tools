import { wrap, transfer } from "comlink";
import type { Remote } from "comlink";
import type { createMapEngine } from "./workers/map/map-module";
import type * as PdxMapWorkerModuleDefinition from "./workers/map/map-module";
import "./styles.css";

export type PdxMapWorkerModule = typeof PdxMapWorkerModuleDefinition;
export type PdxMapWorker = Remote<PdxMapWorkerModule>;
export type MapEngine = Remote<Awaited<ReturnType<typeof createMapEngine>>>;

interface MapState {
  isLoading: boolean;
  error?: string;
  ownerBordersEnabled: boolean;
  locationBordersEnabled: boolean;
  highlightedLocationId: number | null;
  isGeneratingScreenshot: boolean;
}

export class MapPlayground {
  // Root element
  private root: HTMLElement;

  // State
  private state: MapState = {
    isLoading: false,
    ownerBordersEnabled: true,
    locationBordersEnabled: true,
    highlightedLocationId: null,
    isGeneratingScreenshot: false,
  };

  // Map engine
  private mapEngine: MapEngine | null = null;
  private worker: Worker | null = null;
  private isEngineReady: boolean = false;

  // UI elements
  private container: HTMLDivElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private uploadModal: HTMLDivElement | null = null;
  private loadingOverlay: HTMLDivElement | null = null;
  private controlsPanel: HTMLDivElement | null = null;

  // Form state
  private isDragging: boolean = false;
  private dragStartWorldPos: { x: number; y: number } | null = null;
  private highlightInput: string = "";
  private mapImageFile: File | null = null;
  private locationDataFile: File | null = null;

  // Resize observer
  private resizeObserver: ResizeObserver | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.initialize();
  }

  private initialize(): void {
    this.render();
    this.setupEventListeners();
  }

  private render(): void {
    // Create the main container
    this.container = document.createElement("div");
    this.container.className = "map-container";

    // Create upload modal
    this.uploadModal = this.createUploadModal();
    this.container.appendChild(this.uploadModal);

    // Create canvas
    this.canvas = document.createElement("canvas");
    this.canvas.className = "map-canvas";
    this.container.appendChild(this.canvas);

    // Create loading overlay
    this.loadingOverlay = this.createLoadingOverlay();
    this.container.appendChild(this.loadingOverlay);

    // Create controls panel
    this.controlsPanel = this.createControlsPanel();
    this.container.appendChild(this.controlsPanel);

    // Append to root
    this.root.appendChild(this.container);

    // Update initial visibility
    this.updateUI();
  }

  private createUploadModal(): HTMLDivElement {
    const modal = document.createElement("div");
    modal.className = "upload-modal";
    modal.innerHTML = `
      <h2>PDX Map Viewer</h2>
      <p>Upload a map image to visualize any Paradox game map</p>

      <div class="upload-section">
        <label>Map Image:</label>
        <input type="file" accept="image/*" id="mapImageInput" />
        <div id="mapImageSelected" class="file-selected hidden"></div>
      </div>

      <div class="upload-info">
        <strong>Supported games:</strong> EU4, CK3, Vic3, and other Paradox games.
      </div>
    `;
    return modal;
  }

  private createLoadingOverlay(): HTMLDivElement {
    const overlay = document.createElement("div");
    overlay.className = "loading-overlay hidden";
    overlay.innerHTML = `
      <div>Loading map...</div>
      <div class="loading-overlay-subtitle">Check browser console for detailed logs</div>
    `;
    return overlay;
  }

  private createControlsPanel(): HTMLDivElement {
    const panel = document.createElement("div");
    panel.className = "controls-panel";
    panel.innerHTML = `
      <h3>Map Controls</h3>

      <!-- Border Controls -->
      <div class="control-section">
        <label class="checkbox-label">
          <input type="checkbox" id="ownerBordersCheckbox" checked />
          Owner Borders
        </label>
      </div>

      <!-- Screenshot -->
      <div class="control-section">
        <button id="screenshotBtn" class="btn btn-primary btn-full" disabled>
          Take Screenshot
        </button>
      </div>

      <!-- Location Data File -->
      <div class="control-section">
        <label class="form-label">Location Data:</label>
        <input type="file" accept=".bin" id="locationDataInput" class="form-file-input" />
        <div id="locationDataLoaded" class="file-info hidden"></div>
      </div>

      <!-- Location Highlight -->
      <div class="control-section">
        <form id="highlightForm">
          <label class="form-label">Highlight Location ID:</label>
          <div class="input-group">
            <input type="number" id="highlightInput" placeholder="Enter location ID" class="form-input" />
            <button type="submit" class="btn btn-secondary btn-small" disabled>✓</button>
          </div>
        </form>
      </div>
    `;
    return panel;
  }

  private setupEventListeners(): void {
    if (!this.canvas || !this.controlsPanel || !this.uploadModal) return;

    // Canvas events
    this.canvas.addEventListener(
      "pointerdown",
      this.handlePointerDown.bind(this),
    );
    this.canvas.addEventListener(
      "pointermove",
      this.handlePointerMove.bind(this),
    );
    this.canvas.addEventListener("pointerup", this.handlePointerUp.bind(this));
    this.canvas.addEventListener("wheel", this.handleWheel.bind(this));

    // Upload modal events
    const mapImageInput = this.uploadModal.querySelector(
      "#mapImageInput",
    ) as HTMLInputElement;
    mapImageInput?.addEventListener(
      "change",
      this.handleMapImageChange.bind(this),
    );

    // Controls panel events
    const ownerBordersCheckbox = this.controlsPanel.querySelector(
      "#ownerBordersCheckbox",
    ) as HTMLInputElement;
    ownerBordersCheckbox?.addEventListener(
      "change",
      this.toggleOwnerBorders.bind(this),
    );

    const screenshotBtn = this.controlsPanel.querySelector(
      "#screenshotBtn",
    ) as HTMLButtonElement;
    screenshotBtn?.addEventListener("click", this.takeScreenshot.bind(this));

    const locationDataInput = this.controlsPanel.querySelector(
      "#locationDataInput",
    ) as HTMLInputElement;
    locationDataInput?.addEventListener(
      "change",
      this.handleLocationDataChange.bind(this),
    );

    const highlightForm = this.controlsPanel.querySelector(
      "#highlightForm",
    ) as HTMLFormElement;
    highlightForm?.addEventListener(
      "submit",
      this.handleHighlightSubmit.bind(this),
    );

    const highlightInput = this.controlsPanel.querySelector(
      "#highlightInput",
    ) as HTMLInputElement;
    highlightInput?.addEventListener("input", (e) => {
      this.highlightInput = (e.target as HTMLInputElement).value;
      this.updateUI();
    });
  }

  private handleMapImageChange(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.mapImageFile = file;
      this.updateUI();
      this.handleLoadMap();
    }
  }

  private async handleLoadMap(): Promise<void> {
    if (
      !this.canvas ||
      !this.container ||
      !this.mapImageFile ||
      this.isEngineReady ||
      this.state.isLoading
    ) {
      return;
    }

    // Check if canvas is already transferred
    if (this.canvas.dataset.transferred === "true") {
      console.warn("Canvas already transferred, cannot load new map");
      return;
    }

    this.setState({ isLoading: true, error: undefined });

    try {
      // Destroy existing engine if present
      if (this.mapEngine) {
        this.worker?.terminate();
        this.mapEngine = null;
        this.isEngineReady = false;
      }

      console.log("Starting map initialization...");

      // Create worker
      const worker = new Worker(
        new URL("./workers/map/worker.ts", import.meta.url),
        { type: "module" },
      );
      this.worker = worker;
      console.log("Worker created");

      const { createMapEngine: createEngine } = wrap<PdxMapWorker>(worker);

      // Get canvas dimensions before transferring control
      const rect = this.container.getBoundingClientRect();
      const width = Math.floor(rect.width);
      const height = Math.floor(rect.height);
      console.log("Canvas dimensions:", width, "x", height);

      if (width === 0 || height === 0) {
        throw new Error(`Invalid canvas dimensions: ${width}x${height}`);
      }

      // Mark canvas as transferred and transfer control
      this.canvas.dataset.transferred = "true";
      const offscreenCanvas = this.canvas.transferControlToOffscreen();
      console.log("Canvas control transferred to offscreen");

      console.log("Calling createEngine...");
      const engine = await createEngine(
        transfer(
          {
            canvas: offscreenCanvas,
            display: {
              width,
              height,
              scaleFactor: window.devicePixelRatio,
            },
            mapImageFile: this.mapImageFile,
          },
          [offscreenCanvas],
        ),
      );

      this.mapEngine = engine;
      this.isEngineReady = true;
      this.setState({ isLoading: false });

      // Setup resize observer
      this.setupResizeObserver();
    } catch (error) {
      console.error("Failed to load map:", error);
      this.setState({
        isLoading: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  private setupResizeObserver(): void {
    if (!this.mapEngine || !this.canvas) return;

    this.resizeObserver = new ResizeObserver(async () => {
      if (!this.canvas || !this.mapEngine) return;
      const rect = this.canvas.getBoundingClientRect();

      try {
        await this.mapEngine.resize(
          Math.floor(rect.width),
          Math.floor(rect.height),
        );
      } catch (error) {
        console.error("Resize failed:", error);
      }
    });

    this.resizeObserver.observe(this.canvas);
  }

  private async handlePointerDown(e: PointerEvent): Promise<void> {
    if (!this.mapEngine || !this.canvas) return;

    const rect = this.canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;

    const worldPos = await this.mapEngine.canvasToWorld(canvasX, canvasY);
    const worldX = worldPos[0];
    const worldY = worldPos[1];
    this.dragStartWorldPos = { x: worldX, y: worldY };
    this.isDragging = true;

    this.canvas.classList.add("dragging");
    this.canvas.setPointerCapture(e.pointerId);
  }

  private async handlePointerMove(e: PointerEvent): Promise<void> {
    if (!this.mapEngine || !this.canvas) return;

    const rect = this.canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;

    if (this.isDragging && this.dragStartWorldPos) {
      await this.mapEngine.setWorldPointUnderCursor(
        this.dragStartWorldPos.x,
        this.dragStartWorldPos.y,
        canvasX,
        canvasY,
      );
    }
  }

  private handlePointerUp(e: PointerEvent): void {
    if (!this.canvas) return;

    this.isDragging = false;
    this.dragStartWorldPos = null;
    this.canvas.classList.remove("dragging");
    this.canvas.releasePointerCapture(e.pointerId);
  }

  private async handleWheel(e: WheelEvent): Promise<void> {
    if (!this.mapEngine || !this.canvas) return;

    e.preventDefault();

    const rect = this.canvas.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;

    await this.mapEngine.zoomAtPoint(cursorX, cursorY, delta);
  }

  private async toggleOwnerBorders(): Promise<void> {
    if (!this.mapEngine) return;
    const newEnabled = !this.state.ownerBordersEnabled;
    await this.mapEngine.setOwnerBorders(newEnabled);
    this.setState({ ownerBordersEnabled: newEnabled });
  }

  private async handleLocationDataChange(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.locationDataFile = file;
      await this.loadLocationData(file);
    }
  }

  private async loadLocationData(file: File): Promise<void> {
    if (!this.mapEngine) return;

    try {
      await this.mapEngine.loadLocationData(file);
      this.updateUI();
    } catch (error) {
      console.error("Error loading location data:", error);
      this.setState({
        error:
          error instanceof Error
            ? error.message
            : "Failed to load location data",
      });
    }
  }

  private async handleHighlightSubmit(e: Event): Promise<void> {
    e.preventDefault();
    const locationId = parseInt(this.highlightInput);
    if (!isNaN(locationId)) {
      await this.highlightLocation(locationId);
    }
  }

  private async highlightLocation(locationId: number): Promise<void> {
    if (!this.mapEngine) return;
    await this.mapEngine.highlightAppLocation(locationId);
    this.setState({ highlightedLocationId: locationId });
  }

  private async takeScreenshot(): Promise<void> {
    if (!this.mapEngine) return;

    this.setState({ isGeneratingScreenshot: true });

    try {
      // Generate screenshot blob
      const blob = await this.mapEngine.generateWorldScreenshot();

      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      // Generate filename with timestamp
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
      link.download = `map-screenshot-${timestamp}.png`;

      link.href = url;
      link.click();

      // Clean up
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error taking screenshot:", error);
      this.setState({
        error:
          error instanceof Error ? error.message : "Failed to take screenshot",
      });
    } finally {
      this.setState({ isGeneratingScreenshot: false });
    }
  }

  private setState(updates: Partial<MapState>): void {
    this.state = { ...this.state, ...updates };
    this.updateUI();
  }

  private updateUI(): void {
    if (!this.container) return;

    // Handle error state
    if (this.state.error) {
      this.container.innerHTML = `
        <div class="error-display">
          Error: ${this.state.error}
        </div>
      `;
      return;
    }

    // Update upload modal visibility
    if (this.uploadModal) {
      if (!this.isEngineReady && !this.state.isLoading) {
        this.uploadModal.classList.remove("hidden");
      } else {
        this.uploadModal.classList.add("hidden");
      }

      // Update selected file display
      const selectedDiv = this.uploadModal.querySelector("#mapImageSelected");
      if (selectedDiv && this.mapImageFile) {
        selectedDiv.textContent = `Selected: ${this.mapImageFile.name}`;
        selectedDiv.classList.remove("hidden");
      } else if (selectedDiv) {
        selectedDiv.classList.add("hidden");
      }
    }

    // Update loading overlay
    if (this.loadingOverlay) {
      if (this.state.isLoading) {
        this.loadingOverlay.classList.remove("hidden");
      } else {
        this.loadingOverlay.classList.add("hidden");
      }
    }

    // Update controls panel
    if (this.controlsPanel) {
      // Owner borders checkbox
      const ownerBordersCheckbox = this.controlsPanel.querySelector(
        "#ownerBordersCheckbox",
      ) as HTMLInputElement;
      if (ownerBordersCheckbox) {
        ownerBordersCheckbox.checked = this.state.ownerBordersEnabled;
      }

      // Screenshot button
      const screenshotBtn = this.controlsPanel.querySelector(
        "#screenshotBtn",
      ) as HTMLButtonElement;
      if (screenshotBtn) {
        screenshotBtn.disabled =
          !this.isEngineReady || this.state.isGeneratingScreenshot;
        screenshotBtn.textContent = this.state.isGeneratingScreenshot
          ? "Generating Screenshot..."
          : "Take Screenshot";
      }

      // Location data loaded display
      const locationDataLoaded = this.controlsPanel.querySelector(
        "#locationDataLoaded",
      );
      if (locationDataLoaded && this.locationDataFile) {
        locationDataLoaded.textContent = `Loaded: ${this.locationDataFile.name}`;
        locationDataLoaded.classList.remove("hidden");
      } else if (locationDataLoaded) {
        locationDataLoaded.classList.add("hidden");
      }

      // Highlight submit button
      const highlightSubmitBtn = this.controlsPanel.querySelector(
        '#highlightForm button[type="submit"]',
      ) as HTMLButtonElement;
      if (highlightSubmitBtn) {
        highlightSubmitBtn.disabled = !this.highlightInput;
      }
    }
  }
}
