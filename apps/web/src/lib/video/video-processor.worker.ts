/**
 * Video Processing Worker
 * Handles heavy video processing tasks off the main thread
 * Supports frame extraction, thumbnail generation, and metadata processing
 */

export interface VideoProcessorMessage {
  id: string;
  type: "extractFrame" | "generateThumbnail" | "getMetadata" | "processVideo";
  data: any;
}

export interface VideoProcessorResponse {
  id: string;
  type: string;
  success: boolean;
  data?: any;
  error?: string;
}

export interface ExtractFrameData {
  videoData: ArrayBuffer;
  time: number;
  width?: number;
  height?: number;
  quality?: number;
}

export interface GenerateThumbnailData {
  videoData: ArrayBuffer;
  time: number;
  width: number;
  height: number;
  quality?: number;
}

export interface GetMetadataData {
  videoData: ArrayBuffer;
}

export interface ProcessVideoData {
  videoData: ArrayBuffer;
  operations: VideoOperation[];
}

export interface VideoOperation {
  type: "trim" | "resize" | "rotate" | "flip";
  params: any;
}

/**
 * Video Processor Class for Worker
 */
class VideoProcessor {
  private videoCache = new Map<string, HTMLVideoElement>();
  private canvas: OffscreenCanvas;
  private ctx: OffscreenCanvasRenderingContext2D;

  constructor() {
    this.canvas = new OffscreenCanvas(1920, 1080);
    this.ctx = this.canvas.getContext("2d")!;
  }

  /**
   * Process incoming messages
   */
  async processMessage(
    message: VideoProcessorMessage
  ): Promise<VideoProcessorResponse> {
    try {
      switch (message.type) {
        case "extractFrame":
          return {
            id: message.id,
            type: message.type,
            success: true,
            data: await this.extractFrame(message.data),
          };

        case "generateThumbnail":
          return {
            id: message.id,
            type: message.type,
            success: true,
            data: await this.generateThumbnail(message.data),
          };

        case "getMetadata":
          return {
            id: message.id,
            type: message.type,
            success: true,
            data: await this.getMetadata(message.data),
          };

        case "processVideo":
          return {
            id: message.id,
            type: message.type,
            success: true,
            data: await this.processVideo(message.data),
          };

        default:
          throw new Error(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      return {
        id: message.id,
        type: message.type,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Extract frame from video at specific time
   */
  private async extractFrame(data: ExtractFrameData): Promise<string> {
    const { videoData, time, width, height, quality = 0.8 } = data;

    const video = await this.createVideoFromData(videoData);

    try {
      // Set video time
      video.currentTime = time;

      // Wait for frame to be available
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
      const targetWidth = width || video.videoWidth;
      const targetHeight = height || video.videoHeight;

      this.canvas.width = targetWidth;
      this.canvas.height = targetHeight;

      this.ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

      // Convert to data URL
      const blob = await this.canvas.convertToBlob({
        type: "image/jpeg",
        quality,
      });

      return await this.blobToDataURL(blob);
    } finally {
      this.cleanupVideo(video);
    }
  }

  /**
   * Generate thumbnail from video
   */
  private async generateThumbnail(
    data: GenerateThumbnailData
  ): Promise<string> {
    const { videoData, time, width, height, quality = 0.7 } = data;

    // For thumbnails, we want to extract a representative frame
    // Use the provided time or default to 1 second
    const frameTime = time || 1;

    const video = await this.createVideoFromData(videoData);

    try {
      video.currentTime = Math.min(frameTime, video.duration || frameTime);

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

      this.canvas.width = width;
      this.canvas.height = height;

      // Use cover-like scaling for thumbnails
      this.drawImageCover(video, width, height);

      const blob = await this.canvas.convertToBlob({
        type: "image/jpeg",
        quality,
      });

      return await this.blobToDataURL(blob);
    } finally {
      this.cleanupVideo(video);
    }
  }

  /**
   * Get video metadata
   */
  private async getMetadata(data: GetMetadataData): Promise<{
    duration: number;
    width: number;
    height: number;
    videoCodec?: string;
    audioCodec?: string;
    bitrate?: number;
    framerate?: number;
  }> {
    const { videoData } = data;
    const video = await this.createVideoFromData(videoData);

    try {
      // Wait for metadata to load
      if (video.duration === Infinity || video.duration === 0) {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("Metadata loading timeout")),
            5000
          );

          video.onloadedmetadata = () => {
            clearTimeout(timeout);
            resolve();
          };

          video.onerror = () => {
            clearTimeout(timeout);
            reject(new Error("Video error during metadata loading"));
          };
        });
      }

      return {
        duration: video.duration || 0,
        width: video.videoWidth,
        height: video.videoHeight,
        framerate: this.estimateFrameRate(video),
      };
    } finally {
      this.cleanupVideo(video);
    }
  }

  /**
   * Process video with operations
   */
  private async processVideo(data: ProcessVideoData): Promise<ArrayBuffer> {
    const { videoData, operations } = data;

    // For now, return original data
    // This would be implemented with WebCodecs API or FFmpeg.wasm
    console.log(
      "Video processing not yet implemented, operations:",
      operations
    );
    return videoData;
  }

  /**
   * Helper: Create video element from ArrayBuffer
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

    // Wait for video to be ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Video loading timeout")),
        10_000
      );

      video.onloadeddata = () => {
        clearTimeout(timeout);
        resolve();
      };

      video.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("Failed to load video data"));
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
    img: HTMLVideoElement | HTMLImageElement,
    targetWidth: number,
    targetHeight: number
  ): void {
    const imgAspect = img.videoWidth || img.naturalWidth;
    const imgHeight = img.videoHeight || img.naturalHeight;
    const imgRatio = imgAspect / imgHeight;
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

    this.ctx.clearRect(0, 0, targetWidth, targetHeight);
    this.ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
  }

  /**
   * Helper: Convert blob to data URL
   */
  private async blobToDataURL(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () =>
        reject(new Error("Failed to convert blob to data URL"));
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Estimate frame rate from video
   */
  private estimateFrameRate(video: HTMLVideoElement): number {
    // This is a rough estimation
    // In a real implementation, you'd use WebCodecs API or analyze the video stream
    return 30; // Default fallback
  }
}

/**
 * Worker message handler
 */
const processor = new VideoProcessor();

self.onmessage = async (event: MessageEvent<VideoProcessorMessage>) => {
  const response = await processor.processMessage(event.data);
  self.postMessage(response);
};
