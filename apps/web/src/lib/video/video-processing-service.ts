/**
 * Video Processing Service
 * Coordinates video processing between main thread and workers
 * Provides optimized video processing with fallback mechanisms
 */

import VideoProcessorWorker from "./video-processor.worker?worker";

export interface VideoProcessingOptions {
  extractFrame?: {
    time: number;
    width?: number;
    height?: number;
    quality?: number;
  };
  generateThumbnail?: {
    time: number;
    width: number;
    height: number;
    quality?: number;
  };
  getMetadata?: boolean;
}

export interface VideoProcessingResult {
  frame?: string; // Data URL
  thumbnail?: string; // Data URL
  metadata?: {
    duration: number;
    width: number;
    height: number;
    framerate?: number;
  };
}

export interface ProcessingMetrics {
  totalProcessed: number;
  workerProcessed: number;
  mainThreadProcessed: number;
  averageProcessingTime: number;
  failedOperations: number;
}

/**
 * Video Processing Service
 * Manages video processing with worker fallback
 */
class VideoProcessingService {
  private worker?: Worker;
  private messageId = 0;
  private pendingMessages = new Map<
    number,
    {
      resolve: (value: any) => void;
      reject: (error: any) => void;
      timeout: NodeJS.Timeout;
    }
  >();

  private metrics: ProcessingMetrics = {
    totalProcessed: 0,
    workerProcessed: 0,
    mainThreadProcessed: 0,
    averageProcessingTime: 0,
    failedOperations: 0,
  };

  private processingTimes: number[] = [];
  private maxProcessingTime = 30_000; // 30 seconds
  private workerTimeout = 10_000; // 10 seconds

  constructor() {
    this.initializeWorker();
  }

  private initializeWorker(): void {
    try {
      this.worker = new VideoProcessorWorker();
      this.worker.onmessage = this.handleWorkerMessage.bind(this);
      this.worker.onerror = this.handleWorkerError.bind(this);
      console.log("Video processing worker initialized successfully");
    } catch (error) {
      console.warn("Failed to initialize video processing worker:", error);
      this.worker = undefined;
    }
  }

  private handleWorkerMessage(event: MessageEvent): void {
    const response = event.data;
    const { id, success, data, error } = response;

    const pending = this.pendingMessages.get(id);
    if (!pending) {
      console.warn("Received response for unknown message ID:", id);
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingMessages.delete(id);

    if (success) {
      pending.resolve(data);
    } else {
      pending.reject(new Error(error || "Worker processing failed"));
    }
  }

  private handleWorkerError(error: ErrorEvent): void {
    console.error("Worker error:", error);

    // Reject all pending messages
    for (const [id, pending] of this.pendingMessages) {
      pending.reject(new Error("Worker error: " + error.message));
      clearTimeout(pending.timeout);
    }
    this.pendingMessages.clear();
  }

  /**
   * Process video with worker or fallback to main thread
   */
  async processVideo(
    videoFile: File,
    options: VideoProcessingOptions
  ): Promise<VideoProcessingResult> {
    const startTime = performance.now();

    try {
      // Convert file to ArrayBuffer
      const videoData = await this.fileToArrayBuffer(videoFile);

      // Try worker first
      if (this.worker) {
        try {
          const result = await this.processWithWorker(videoData, options);
          this.updateMetrics(true, performance.now() - startTime);
          return result;
        } catch (workerError) {
          console.warn(
            "Worker processing failed, falling back to main thread:",
            workerError
          );
        }
      }

      // Fallback to main thread
      const result = await this.processOnMainThread(videoData, options);
      this.updateMetrics(false, performance.now() - startTime);
      return result;
    } catch (error) {
      this.metrics.failedOperations++;
      throw error;
    }
  }

  /**
   * Process video using worker
   */
  private async processWithWorker(
    videoData: ArrayBuffer,
    options: VideoProcessingOptions
  ): Promise<VideoProcessingResult> {
    const result: VideoProcessingResult = {};

    // Process each operation type
    if (options.extractFrame) {
      const frameData = await this.sendWorkerMessage({
        type: "extractFrame",
        data: {
          videoData,
          ...options.extractFrame,
        },
      });
      result.frame = frameData;
    }

    if (options.generateThumbnail) {
      const thumbnailData = await this.sendWorkerMessage({
        type: "generateThumbnail",
        data: {
          videoData,
          ...options.generateThumbnail,
        },
      });
      result.thumbnail = thumbnailData;
    }

    if (options.getMetadata) {
      const metadata = await this.sendWorkerMessage({
        type: "getMetadata",
        data: { videoData },
      });
      result.metadata = metadata;
    }

    return result;
  }

  /**
   * Process video on main thread (fallback)
   */
  private async processOnMainThread(
    videoData: ArrayBuffer,
    options: VideoProcessingOptions
  ): Promise<VideoProcessingResult> {
    const result: VideoProcessingResult = {};

    // Create video element from data
    const video = await this.createVideoFromData(videoData);

    try {
      if (options.extractFrame) {
        result.frame = await this.extractFrameOnMainThread(
          video,
          options.extractFrame
        );
      }

      if (options.generateThumbnail) {
        result.thumbnail = await this.generateThumbnailOnMainThread(
          video,
          options.generateThumbnail
        );
      }

      if (options.getMetadata) {
        result.metadata = this.getMetadataOnMainThread(video);
      }
    } finally {
      this.cleanupVideo(video);
    }

    return result;
  }

  /**
   * Send message to worker and wait for response
   */
  private sendWorkerMessage(messageData: any): Promise<any> {
    if (!this.worker) {
      throw new Error("Worker not available");
    }

    const id = ++this.messageId;
    const message = { id, ...messageData };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingMessages.delete(id);
        reject(new Error("Worker message timeout"));
      }, this.workerTimeout);

      this.pendingMessages.set(id, { resolve, reject, timeout });
      this.worker!.postMessage(message);
    });
  }

  /**
   * Extract frame on main thread
   */
  private async extractFrameOnMainThread(
    video: HTMLVideoElement,
    options: NonNullable<VideoProcessingOptions["extractFrame"]>
  ): Promise<string> {
    const { time, width, height, quality = 0.8 } = options;

    // Set video time
    video.currentTime = Math.min(time, video.duration || time);

    // Wait for seek to complete
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Frame extraction timeout")),
        5000
      );

      video.onseeked = () => {
        clearTimeout(timeout);
        resolve();
      };

      video.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("Video error during frame extraction"));
      };
    });

    // Extract frame
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;

    const targetWidth = width || video.videoWidth;
    const targetHeight = height || video.videoHeight;

    canvas.width = targetWidth;
    canvas.height = targetHeight;

    ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Failed to create frame blob"));
            return;
          }

          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () =>
            reject(new Error("Failed to convert frame to data URL"));
          reader.readAsDataURL(blob);
        },
        "image/jpeg",
        quality
      );
    });
  }

  /**
   * Generate thumbnail on main thread
   */
  private async generateThumbnailOnMainThread(
    video: HTMLVideoElement,
    options: NonNullable<VideoProcessingOptions["generateThumbnail"]>
  ): Promise<string> {
    const { time, width, height, quality = 0.7 } = options;
    const thumbnailTime = time || Math.min(1, video.duration || 1);

    video.currentTime = thumbnailTime;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Thumbnail generation timeout")),
        3000
      );

      video.onseeked = () => {
        clearTimeout(timeout);
        resolve();
      };

      video.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("Video error during thumbnail generation"));
      };
    });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;

    canvas.width = width;
    canvas.height = height;

    // Use cover-like scaling
    this.drawImageCover(ctx, video, width, height);

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Failed to create thumbnail blob"));
            return;
          }

          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () =>
            reject(new Error("Failed to convert thumbnail to data URL"));
          reader.readAsDataURL(blob);
        },
        "image/jpeg",
        quality
      );
    });
  }

  /**
   * Get metadata on main thread
   */
  private getMetadataOnMainThread(video: HTMLVideoElement): {
    duration: number;
    width: number;
    height: number;
    framerate?: number;
  } {
    return {
      duration: video.duration || 0,
      width: video.videoWidth,
      height: video.videoHeight,
      framerate: this.estimateFrameRate(video),
    };
  }

  /**
   * Helper: Convert file to ArrayBuffer
   */
  private async fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Helper: Create video from ArrayBuffer
   */
  private async createVideoFromData(
    data: ArrayBuffer
  ): Promise<HTMLVideoElement> {
    const blob = new Blob([data], { type: "video/mp4" });
    const url = URL.createObjectURL(blob);

    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Video loading timeout")),
        10_000
      );

      video.onloadedmetadata = () => {
        clearTimeout(timeout);
        resolve();
      };

      video.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("Failed to load video"));
      };
    });

    return video;
  }

  /**
   * Helper: Clean up video element
   */
  private cleanupVideo(video: HTMLVideoElement): void {
    if (video.src) {
      URL.revokeObjectURL(video.src);
    }
    video.pause();
    video.removeAttribute("src");
    video.load();
  }

  /**
   * Helper: Draw image with cover scaling
   */
  private drawImageCover(
    ctx: CanvasRenderingContext2D,
    img: HTMLVideoElement | HTMLImageElement,
    targetWidth: number,
    targetHeight: number
  ): void {
    const imgWidth = img.videoWidth || img.naturalWidth;
    const imgHeight = img.videoHeight || img.naturalHeight;
    const imgRatio = imgWidth / imgHeight;
    const targetRatio = targetWidth / targetHeight;

    let drawWidth, drawHeight, offsetX, offsetY;

    if (imgRatio > targetRatio) {
      drawHeight = targetHeight;
      drawWidth = targetHeight * imgRatio;
      offsetX = (targetWidth - drawWidth) / 2;
      offsetY = 0;
    } else {
      drawWidth = targetWidth;
      drawHeight = targetWidth / imgRatio;
      offsetX = 0;
      offsetY = (targetHeight - drawHeight) / 2;
    }

    ctx.clearRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
  }

  /**
   * Estimate frame rate from video
   */
  private estimateFrameRate(video: HTMLVideoElement): number {
    // This is a rough estimation
    // In a real implementation, you'd use WebCodecs API
    return 30; // Default fallback
  }

  /**
   * Update processing metrics
   */
  private updateMetrics(usedWorker: boolean, processingTime: number): void {
    this.metrics.totalProcessed++;

    if (usedWorker) {
      this.metrics.workerProcessed++;
    } else {
      this.metrics.mainThreadProcessed++;
    }

    this.processingTimes.push(processingTime);
    if (this.processingTimes.length > 100) {
      this.processingTimes.shift();
    }

    this.metrics.averageProcessingTime =
      this.processingTimes.reduce((a, b) => a + b, 0) /
      this.processingTimes.length;
  }

  /**
   * Get processing metrics
   */
  getMetrics(): ProcessingMetrics {
    return { ...this.metrics };
  }

  /**
   * Check if worker is available
   */
  isWorkerAvailable(): boolean {
    return !!this.worker;
  }

  /**
   * Destroy service and cleanup resources
   */
  destroy(): void {
    // Reject all pending messages
    for (const [id, pending] of this.pendingMessages) {
      pending.reject(new Error("Service destroyed"));
      clearTimeout(pending.timeout);
    }
    this.pendingMessages.clear();

    // Terminate worker
    if (this.worker) {
      this.worker.terminate();
      this.worker = undefined;
    }
  }
}

// Singleton instance
let videoProcessingService: VideoProcessingService | null = null;

export function getVideoProcessingService(): VideoProcessingService {
  if (!videoProcessingService) {
    videoProcessingService = new VideoProcessingService();
  }
  return videoProcessingService;
}

export function createVideoProcessingService(): VideoProcessingService {
  return new VideoProcessingService();
}

export { VideoProcessingService };
