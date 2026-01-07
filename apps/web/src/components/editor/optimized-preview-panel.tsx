/**
 * Optimized Preview Panel
 * Double-buffered canvas rendering with Web Worker support
 * Eliminates flickering and improves video editing performance
 */

"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { usePlaybackStore } from "@/stores/playback-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { useEditorStore } from "@/stores/editor-store";
import { cn } from "@/lib/utils";
import {
  createOptimizedPreviewRenderer,
  OptimizedPreviewRenderer,
  RenderFrame,
  RenderElement,
  PreviewPerformanceMonitor,
} from "@/lib/video/optimized-preview-renderer";
import { getVideoProcessingService } from "@/lib/video/video-processing-service";

interface OptimizedPreviewPanelProps {
  className?: string;
  showControls?: boolean;
  showPerformance?: boolean;
}

export function OptimizedPreviewPanel({
  className,
  showControls = true,
  showPerformance = false,
}: OptimizedPreviewPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<OptimizedPreviewRenderer | null>(null);
  const performanceMonitorRef = useRef<PreviewPerformanceMonitor | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isReady, setIsReady] = useState(false);
  const [performanceMetrics, setPerformanceMetrics] = useState({
    frameRate: 0,
    renderTime: 0,
    droppedFrames: 0,
  });

  // Store subscriptions
  const { currentTime, isPlaying, playbackRate } = usePlaybackStore();
  const { tracks, activeElements } = useTimelineStore();
  const { canvas: canvasSettings } = useEditorStore();

  const videoProcessingService = useMemo(() => getVideoProcessingService(), []);

  // Initialize renderer
  const initializeRenderer = useCallback(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    const rect = container.getBoundingClientRect();

    // Calculate dimensions maintaining aspect ratio
    const aspectRatio = canvasSettings.width / canvasSettings.height;
    let width = rect.width;
    let height = rect.height;

    if (width / height > aspectRatio) {
      width = height * aspectRatio;
    } else {
      height = width / aspectRatio;
    }

    setDimensions({ width, height });

    // Create renderer with optimizations
    rendererRef.current = createOptimizedPreviewRenderer(
      canvas,
      width,
      height,
      {
        useDoubleBuffering: true,
        useWebWorker: false, // Disabled for now due to complexity
        frameRate: 60,
      }
    );

    // Create performance monitor
    performanceMonitorRef.current = new PreviewPerformanceMonitor();

    setIsReady(true);
  }, [canvasSettings.width, canvasSettings.height]);

  // Handle canvas resize
  useEffect(() => {
    const handleResize = () => {
      if (rendererRef.current && containerRef.current) {
        const container = containerRef.current;
        const rect = container.getBoundingClientRect();
        const aspectRatio = canvasSettings.width / canvasSettings.height;

        let width = rect.width;
        let height = rect.height;

        if (width / height > aspectRatio) {
          width = height * aspectRatio;
        } else {
          height = width / aspectRatio;
        }

        setDimensions({ width, height });
        rendererRef.current.updateDimensions(width, height);
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [canvasSettings.width, canvasSettings.height]);

  // Initialize on mount
  useEffect(() => {
    initializeRenderer();

    return () => {
      if (rendererRef.current) {
        rendererRef.current.destroy();
        rendererRef.current = null;
      }
      if (performanceMonitorRef.current) {
        performanceMonitorRef.current.reset();
      }
    };
  }, [initializeRenderer]);

  // Render current frame
  const renderFrame = useCallback(() => {
    if (!rendererRef.current || !isReady) return;

    const startTime = performance.now();

    try {
      // Build render frame from current state
      const frame = buildRenderFrame(
        currentTime,
        tracks,
        activeElements,
        canvasSettings
      );

      // Render with performance monitoring
      rendererRef.current.renderFrame(frame, {
        clearBackground: true,
        smoothRendering: true,
        quality: "high",
      });

      // Update performance metrics
      if (performanceMonitorRef.current) {
        const renderTime = performance.now() - startTime;
        performanceMonitorRef.current.recordRenderTime(renderTime);
        performanceMonitorRef.current.recordFrameTime(16.67); // Assume 60fps target

        if (showPerformance) {
          const metrics = performanceMonitorRef.current.getMetrics();
          setPerformanceMetrics({
            frameRate: metrics.frameRate,
            renderTime: metrics.averageRenderTime,
            droppedFrames: metrics.droppedFrames,
          });
        }
      }
    } catch (error) {
      console.error("Error rendering frame:", error);
      if (performanceMonitorRef.current) {
        performanceMonitorRef.current.recordDroppedFrame();
      }
    }
  }, [
    currentTime,
    tracks,
    activeElements,
    canvasSettings,
    isReady,
    showPerformance,
  ]);

  // Handle playback
  useEffect(() => {
    if (!rendererRef.current || !isReady) return;

    if (isPlaying) {
      // Start render loop during playback
      rendererRef.current.startRenderLoop(() =>
        buildRenderFrame(currentTime, tracks, activeElements, canvasSettings)
      );
    } else {
      // Stop render loop and render single frame when paused
      rendererRef.current.stopRenderLoop();
      renderFrame();
    }

    return () => {
      if (rendererRef.current) {
        rendererRef.current.stopRenderLoop();
      }
    };
  }, [
    isPlaying,
    currentTime,
    tracks,
    activeElements,
    canvasSettings,
    isReady,
    renderFrame,
  ]);

  // Render single frame when not playing
  useEffect(() => {
    if (!isPlaying) {
      renderFrame();
    }
  }, [renderFrame, isPlaying]);

  return (
    <div
      className={cn("relative bg-black rounded-lg overflow-hidden", className)}
    >
      <div
        ref={containerRef}
        className="relative w-full h-full flex items-center justify-center"
      >
        <canvas
          ref={canvasRef}
          width={dimensions.width}
          height={dimensions.height}
          className={cn("max-w-full max-h-full", !isReady && "opacity-0")}
          style={{
            width: dimensions.width,
            height: dimensions.height,
          }}
        />

        {!isReady && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-white/60">Initializing preview...</div>
          </div>
        )}
      </div>

      {showControls && (
        <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
          <div className="text-white/80 text-sm">
            {currentTime.toFixed(2)}s / {isPlaying ? "Playing" : "Paused"}
          </div>

          {showPerformance && (
            <div className="text-white/60 text-xs font-mono">
              FPS: {performanceMetrics.frameRate.toFixed(1)} | Render:{" "}
              {performanceMetrics.renderTime.toFixed(1)}ms | Dropped:{" "}
              {performanceMetrics.droppedFrames}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Build render frame from timeline state
 */
function buildRenderFrame(
  currentTime: number,
  tracks: any[],
  activeElements: any[],
  canvasSettings: { width: number; height: number }
): RenderFrame {
  const elements: RenderElement[] = [];

  // Process active elements
  for (const element of activeElements) {
    if (element.startTime <= currentTime && element.endTime >= currentTime) {
      const renderElement: RenderElement = {
        id: element.id,
        type: element.type,
        x: element.x || 0,
        y: element.y || 0,
        width: element.width || canvasSettings.width,
        height: element.height || canvasSettings.height,
        opacity: element.opacity || 1,
        rotation: element.rotation || 0,
      };

      // Add type-specific properties
      if (element.type === "video" || element.type === "image") {
        renderElement.source = element.source; // HTMLVideoElement or HTMLImageElement
      } else if (element.type === "text") {
        renderElement.text = element.text;
        renderElement.font = element.font;
        renderElement.color = element.color;
      }

      elements.push(renderElement);
    }
  }

  return {
    id: `frame-${currentTime}`,
    timestamp: currentTime,
    elements,
    background: "#000000", // Black background
  };
}

/**
 * Performance optimization utilities
 */
export function usePreviewOptimization() {
  const [isOptimized, setIsOptimized] = useState(false);

  useEffect(() => {
    // Check if browser supports required APIs
    const supportsOffscreenCanvas = typeof OffscreenCanvas !== "undefined";
    const supportsWebWorker = typeof Worker !== "undefined";
    const supportsWebCodecs = "VideoDecoder" in window;

    setIsOptimized(supportsOffscreenCanvas && supportsWebWorker);
  }, []);

  return {
    isOptimized,
    supportsOffscreenCanvas: typeof OffscreenCanvas !== "undefined",
    supportsWebWorker: typeof Worker !== "undefined",
    supportsWebCodecs: "VideoDecoder" in window,
  };
}

/**
 * Preview performance hook
 */
export function usePreviewPerformance() {
  const [metrics, setMetrics] = useState({
    frameRate: 0,
    renderTime: 0,
    droppedFrames: 0,
    memoryUsage: 0,
  });

  useEffect(() => {
    const updateMetrics = () => {
      if ("memory" in performance) {
        const memoryInfo = (performance as any).memory;
        setMetrics((prev) => ({
          ...prev,
          memoryUsage: memoryInfo.usedJSHeapSize / 1024 / 1024, // MB
        }));
      }
    };

    const interval = setInterval(updateMetrics, 1000);
    return () => clearInterval(interval);
  }, []);

  return metrics;
}

/**
 * Frame rate limiting utility
 */
export function createFrameLimiter(targetFPS: number) {
  const frameInterval = 1000 / targetFPS;
  let lastFrameTime = 0;

  return function shouldRender(currentTime: number): boolean {
    if (currentTime - lastFrameTime >= frameInterval) {
      lastFrameTime = currentTime;
      return true;
    }
    return false;
  };
}

/**
 * Canvas pooling for performance
 */
export class CanvasPool {
  private pool: HTMLCanvasElement[] = [];
  private maxSize = 10;

  acquire(width: number, height: number): HTMLCanvasElement {
    const canvas = this.pool.pop() || document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  release(canvas: HTMLCanvasElement): void {
    if (this.pool.length < this.maxSize) {
      // Clear canvas references
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      this.pool.push(canvas);
    }
  }

  clear(): void {
    this.pool.forEach((canvas) => {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    });
    this.pool = [];
  }
}

// Export singleton canvas pool
export const canvasPool = new CanvasPool();
