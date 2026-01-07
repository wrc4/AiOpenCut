/**
 * Optimized Preview Renderer
 * Double-buffered canvas rendering with Web Worker support
 * Designed to eliminate flickering and improve performance
 */

export interface PreviewRendererConfig {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  useDoubleBuffering?: boolean;
  useWebWorker?: boolean;
  frameRate?: number;
}

export interface RenderFrame {
  id: string;
  timestamp: number;
  elements: RenderElement[];
  background?: string;
}

export interface RenderElement {
  id: string;
  type: "video" | "image" | "text" | "shape";
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  rotation: number;
  source?: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;
  text?: string;
  font?: string;
  color?: string;
}

export interface RenderOptions {
  clearBackground?: boolean;
  smoothRendering?: boolean;
  quality?: "low" | "medium" | "high";
}

/**
 * Double-buffered canvas renderer for smooth video preview
 */
export class OptimizedPreviewRenderer {
  private config: PreviewRendererConfig;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private offscreenCanvas: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D;
  private isRendering = false;
  private frameQueue: RenderFrame[] = [];
  private lastFrameTime = 0;
  private animationId?: number;
  private worker?: Worker;

  constructor(config: PreviewRendererConfig) {
    this.config = {
      useDoubleBuffering: true,
      useWebWorker: false,
      frameRate: 60,
      ...config,
    };

    this.canvas = config.canvas;
    this.ctx = this.canvas.getContext("2d", {
      alpha: false,
      desynchronized: true,
      willReadFrequently: false,
    })!;

    // Create offscreen canvas for double buffering
    if (this.config.useDoubleBuffering) {
      this.offscreenCanvas = document.createElement("canvas");
      this.offscreenCanvas.width = config.width;
      this.offscreenCanvas.height = config.height;
      this.offscreenCtx = this.offscreenCanvas.getContext("2d", {
        alpha: false,
        desynchronized: true,
        willReadFrequently: false,
      })!;
    }

    this.initializeWorker();
  }

  private initializeWorker(): void {
    if (!this.config.useWebWorker) return;

    // Create inline worker for offscreen rendering
    const workerCode = `
      self.onmessage = function(e) {
        const { frame, width, height, quality } = e.data;

        // Create offscreen canvas
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Render frame
        renderFrame(ctx, frame, width, height, quality);

        // Convert to ImageBitmap for transfer
        canvas.convertToBlob().then(blob => {
          self.postMessage({ blob, frameId: frame.id });
        });
      };

      function renderFrame(ctx, frame, width, height, quality) {
        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        // Render background
        if (frame.background) {
          ctx.fillStyle = frame.background;
          ctx.fillRect(0, 0, width, height);
        }

        // Render elements in order
        for (const element of frame.elements) {
          renderElement(ctx, element, quality);
        }
      }

      function renderElement(ctx, element, quality) {
        ctx.save();

        // Apply transforms
        ctx.translate(element.x + element.width / 2, element.y + element.height / 2);
        ctx.rotate(element.rotation);
        ctx.globalAlpha = element.opacity;

        // Render based on type
        if (element.type === 'video' || element.type === 'image') {
          if (element.source) {
            ctx.drawImage(
              element.source,
              -element.width / 2,
              -element.height / 2,
              element.width,
              element.height
            );
          }
        } else if (element.type === 'text') {
          if (element.text && element.font && element.color) {
            ctx.font = element.font;
            ctx.fillStyle = element.color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(element.text, 0, 0);
          }
        }

        ctx.restore();
      }
    `;

    try {
      const blob = new Blob([workerCode], { type: "application/javascript" });
      this.worker = new Worker(URL.createObjectURL(blob));
    } catch (error) {
      console.warn("Failed to create worker:", error);
      this.config.useWebWorker = false;
    }
  }

  /**
   * Render a frame with optimized performance
   */
  async renderFrame(
    frame: RenderFrame,
    options: RenderOptions = {}
  ): Promise<void> {
    if (this.isRendering) {
      // Queue frame if already rendering
      this.frameQueue.push(frame);
      return;
    }

    this.isRendering = true;

    try {
      if (this.config.useWebWorker && this.worker) {
        await this.renderFrameWithWorker(frame, options);
      } else {
        await this.renderFrameDirectly(frame, options);
      }
    } finally {
      this.isRendering = false;

      // Process next frame in queue
      if (this.frameQueue.length > 0) {
        const nextFrame = this.frameQueue.shift()!;
        this.renderFrame(nextFrame, options);
      }
    }
  }

  /**
   * Render frame directly on main thread with double buffering
   */
  private async renderFrameDirectly(
    frame: RenderFrame,
    options: RenderOptions
  ): Promise<void> {
    const renderCtx = this.config.useDoubleBuffering
      ? this.offscreenCtx
      : this.ctx;
    const targetCtx = this.ctx;

    // Clear background if requested
    if (options.clearBackground !== false) {
      renderCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // Render background
    if (frame.background) {
      renderCtx.fillStyle = frame.background;
      renderCtx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // Render elements with optimized settings
    renderCtx.imageSmoothingEnabled = options.smoothRendering !== false;
    renderCtx.imageSmoothingQuality = options.quality || "medium";

    // Render elements in order (back to front)
    for (const element of frame.elements) {
      this.renderElement(renderCtx, element);
    }

    // Double buffer swap
    if (this.config.useDoubleBuffering) {
      targetCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      targetCtx.drawImage(this.offscreenCanvas, 0, 0);
    }
  }

  /**
   * Render frame using Web Worker for better performance
   */
  private async renderFrameWithWorker(
    frame: RenderFrame,
    options: RenderOptions
  ): Promise<void> {
    if (!this.worker) {
      return this.renderFrameDirectly(frame, options);
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Worker rendering timeout"));
      }, 1000);

      this.worker!.onmessage = (e) => {
        clearTimeout(timeout);
        const { blob, frameId } = e.data;

        if (frameId === frame.id) {
          this.applyWorkerResult(blob).then(resolve).catch(reject);
        }
      };

      this.worker!.onerror = (error) => {
        clearTimeout(timeout);
        console.warn(
          "Worker rendering failed, falling back to main thread:",
          error
        );
        this.renderFrameDirectly(frame, options).then(resolve).catch(reject);
      };

      this.worker!.postMessage({
        frame,
        width: this.canvas.width,
        height: this.canvas.height,
        quality: options.quality,
      });
    });
  }

  /**
   * Apply worker rendering result to canvas
   */
  private async applyWorkerResult(blob: Blob): Promise<void> {
    const bitmap = await createImageBitmap(blob);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
  }

  /**
   * Render individual element with optimizations
   */
  private renderElement(
    ctx: CanvasRenderingContext2D,
    element: RenderElement
  ): void {
    ctx.save();

    try {
      // Apply transforms
      ctx.translate(
        element.x + element.width / 2,
        element.y + element.height / 2
      );
      ctx.rotate(element.rotation);
      ctx.globalAlpha = element.opacity;

      // Render based on element type
      switch (element.type) {
        case "video":
        case "image":
          this.renderMediaElement(ctx, element);
          break;
        case "text":
          this.renderTextElement(ctx, element);
          break;
        case "shape":
          this.renderShapeElement(ctx, element);
          break;
      }
    } finally {
      ctx.restore();
    }
  }

  /**
   * Render media element (video/image) with optimizations
   */
  private renderMediaElement(
    ctx: CanvasRenderingContext2D,
    element: RenderElement
  ): void {
    if (!element.source) return;

    // Check if source is ready
    if (element.source instanceof HTMLVideoElement) {
      if (element.source.readyState < 2) return; // HAVE_CURRENT_DATA
    } else if (element.source instanceof HTMLImageElement) {
      if (!element.source.complete || element.source.naturalWidth === 0) return;
    }

    // Use optimized drawing
    ctx.drawImage(
      element.source,
      -element.width / 2,
      -element.height / 2,
      element.width,
      element.height
    );
  }

  /**
   * Render text element
   */
  private renderTextElement(
    ctx: CanvasRenderingContext2D,
    element: RenderElement
  ): void {
    if (!element.text || !element.font || !element.color) return;

    ctx.font = element.font;
    ctx.fillStyle = element.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(element.text, 0, 0);
  }

  /**
   * Render shape element
   */
  private renderShapeElement(
    ctx: CanvasRenderingContext2D,
    element: RenderElement
  ): void {
    if (!element.color) return;

    ctx.fillStyle = element.color;
    ctx.fillRect(
      -element.width / 2,
      -element.height / 2,
      element.width,
      element.height
    );
  }

  /**
   * Update canvas dimensions
   */
  updateDimensions(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;

    if (this.config.useDoubleBuffering) {
      this.offscreenCanvas.width = width;
      this.offscreenCanvas.height = height;
    }
  }

  /**
   * Start continuous rendering loop
   */
  startRenderLoop(renderCallback: () => RenderFrame): void {
    const frameInterval = 1000 / (this.config.frameRate || 60);

    const renderLoop = (timestamp: number) => {
      if (timestamp - this.lastFrameTime >= frameInterval) {
        const frame = renderCallback();
        this.renderFrame(frame);
        this.lastFrameTime = timestamp;
      }

      this.animationId = requestAnimationFrame(renderLoop);
    };

    this.animationId = requestAnimationFrame(renderLoop);
  }

  /**
   * Stop render loop
   */
  stopRenderLoop(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = undefined;
    }
  }

  /**
   * Destroy renderer and cleanup resources
   */
  destroy(): void {
    this.stopRenderLoop();
    this.frameQueue = [];

    if (this.worker) {
      this.worker.terminate();
      this.worker = undefined;
    }

    if (this.offscreenCanvas) {
      this.offscreenCanvas.width = 0;
      this.offscreenCanvas.height = 0;
    }
  }

  /**
   * Get performance metrics
   */
  getMetrics(): {
    frameQueueLength: number;
    isUsingWorker: boolean;
    isUsingDoubleBuffering: boolean;
    canvasSize: { width: number; height: number };
  } {
    return {
      frameQueueLength: this.frameQueue.length,
      isUsingWorker: this.config.useWebWorker && !!this.worker,
      isUsingDoubleBuffering: this.config.useDoubleBuffering,
      canvasSize: {
        width: this.canvas.width,
        height: this.canvas.height,
      },
    };
  }
}

/**
 * Factory function for creating optimized preview renderer
 */
export function createOptimizedPreviewRenderer(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  options?: Partial<PreviewRendererConfig>
): OptimizedPreviewRenderer {
  return new OptimizedPreviewRenderer({
    canvas,
    width,
    height,
    useDoubleBuffering: true,
    useWebWorker: false, // Disabled by default due to complexity
    frameRate: 60,
    ...options,
  });
}

/**
 * Create preview renderer with Web Worker support
 */
export function createWorkerPreviewRenderer(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  options?: Partial<PreviewRendererConfig>
): OptimizedPreviewRenderer {
  return new OptimizedPreviewRenderer({
    canvas,
    width,
    height,
    useDoubleBuffering: true,
    useWebWorker: true,
    frameRate: 60,
    ...options,
  });
}

/**
 * Performance monitoring utilities
 */
export class PreviewPerformanceMonitor {
  private metrics: {
    frameTimes: number[];
    renderTimes: number[];
    droppedFrames: number;
    totalFrames: number;
  } = {
    frameTimes: [],
    renderTimes: [],
    droppedFrames: 0,
    totalFrames: 0,
  };

  recordFrameTime(time: number): void {
    this.metrics.frameTimes.push(time);
    this.metrics.totalFrames++;

    // Keep only last 100 measurements
    if (this.metrics.frameTimes.length > 100) {
      this.metrics.frameTimes.shift();
    }
  }

  recordRenderTime(time: number): void {
    this.metrics.renderTimes.push(time);

    if (this.metrics.renderTimes.length > 100) {
      this.metrics.renderTimes.shift();
    }
  }

  recordDroppedFrame(): void {
    this.metrics.droppedFrames++;
  }

  getAverageFrameTime(): number {
    if (this.metrics.frameTimes.length === 0) return 0;
    return (
      this.metrics.frameTimes.reduce((a, b) => a + b, 0) /
      this.metrics.frameTimes.length
    );
  }

  getAverageRenderTime(): number {
    if (this.metrics.renderTimes.length === 0) return 0;
    return (
      this.metrics.renderTimes.reduce((a, b) => a + b, 0) /
      this.metrics.renderTimes.length
    );
  }

  getFrameRate(): number {
    const avgFrameTime = this.getAverageFrameTime();
    return avgFrameTime > 0 ? 1000 / avgFrameTime : 0;
  }

  getDropRate(): number {
    return this.metrics.totalFrames > 0
      ? this.metrics.droppedFrames / this.metrics.totalFrames
      : 0;
  }

  getMetrics() {
    return {
      averageFrameTime: this.getAverageFrameTime(),
      averageRenderTime: this.getAverageRenderTime(),
      frameRate: this.getFrameRate(),
      droppedFrames: this.metrics.droppedFrames,
      totalFrames: this.metrics.totalFrames,
      dropRate: this.getDropRate(),
    };
  }

  reset(): void {
    this.metrics = {
      frameTimes: [],
      renderTimes: [],
      droppedFrames: 0,
      totalFrames: 0,
    };
  }
}

export { OptimizedPreviewRenderer as PreviewRenderer }; // For backward compatibility
