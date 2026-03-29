import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { createOpusEncoder, PCM_FRAME_BYTES, type Encoder } from "./encoder.js";
import type { Logger } from "../logger.js";

export interface PlayerEvents {
  frame: (opusFrame: Buffer) => void;
  trackEnd: () => void;
  error: (err: Error) => void;
}

export type PlayerState = "idle" | "playing" | "paused";

const FRAME_DURATION_MS = 20;

export class AudioPlayer extends EventEmitter {
  private ffmpeg: ChildProcess | null = null;
  private encoder: Encoder;
  private state: PlayerState = "idle";
  private volume = 75; // 0-100
  private pcmBuffer: Buffer = Buffer.alloc(0);
  private logger: Logger;
  private frameLoopRunning = false;
  private nextFrameTime = 0;
  private currentUrl = "";
  private seekOffset = 0; // seconds offset from seek

  constructor(logger: Logger) {
    super();
    this.encoder = createOpusEncoder();
    this.logger = logger;
  }

  play(url: string, seekSeconds = 0): void {
    this.stop();
    this.currentUrl = url;
    this.seekOffset = seekSeconds;

    this.logger.info({ url: url.slice(0, 80), seek: seekSeconds }, "Starting playback");

    const args = [
      "-reconnect", "1",
      "-reconnect_streamed", "1",
      "-reconnect_delay_max", "5",
    ];
    if (seekSeconds > 0) {
      args.push("-ss", String(seekSeconds));
    }
    args.push(
      "-i", url,
      "-f", "s16le",
      "-ar", "48000",
      "-ac", "2",
      "-acodec", "pcm_s16le",
      "-",
    );

    this.ffmpeg = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });

    this.ffmpeg.stderr!.on("data", () => {
      // Suppress FFmpeg stderr output
    });

    this.ffmpeg.stdout!.on("data", (chunk: Buffer) => {
      this.pcmBuffer = Buffer.concat([this.pcmBuffer, chunk]);
    });

    this.ffmpeg.on("close", (code) => {
      this.logger.debug({ code }, "FFmpeg process closed");
      if (this.state === "playing" || this.state === "paused") {
        // Let the frame loop drain remaining frames, then it will emit trackEnd
      }
    });

    this.ffmpeg.on("error", (err) => {
      this.logger.error({ err }, "FFmpeg error");
      this.emit("error", err);
    });

    this.state = "playing";
    this.startFrameLoop();
  }

  /**
   * High-precision frame sending loop using drift-correcting setTimeout.
   * Much more accurate than setInterval which drifts ~4-16ms on Windows.
   */
  private startFrameLoop(): void {
    if (this.frameLoopRunning) return;
    this.frameLoopRunning = true;
    this.nextFrameTime = performance.now();
    this.scheduleNextFrame();
  }

  private scheduleNextFrame(): void {
    if (!this.frameLoopRunning) return;

    this.nextFrameTime += FRAME_DURATION_MS;
    const now = performance.now();
    const delay = Math.max(0, this.nextFrameTime - now);

    setTimeout(() => {
      if (!this.frameLoopRunning) return;

      if (this.state === "playing") {
        this.sendNextFrame();
      } else if (this.state === "paused") {
        // Keep the loop alive but adjust timing to avoid drift accumulation
        this.nextFrameTime = performance.now();
      }

      // Check if we should stop (FFmpeg done + buffer empty)
      if (!this.ffmpeg && this.pcmBuffer.length < PCM_FRAME_BYTES) {
        this.frameLoopRunning = false;
        if (this.state !== "idle") {
          this.state = "idle";
          this.emit("trackEnd");
        }
        return;
      }

      this.scheduleNextFrame();
    }, delay);
  }

  private sendNextFrame(): void {
    if (this.pcmBuffer.length < PCM_FRAME_BYTES) return;

    const pcmFrame = this.pcmBuffer.subarray(0, PCM_FRAME_BYTES);
    this.pcmBuffer = this.pcmBuffer.subarray(PCM_FRAME_BYTES);

    // Apply volume by scaling PCM samples directly
    const adjusted = this.applyVolume(pcmFrame);
    const opusFrame = this.encoder.encode(adjusted);
    this.emit("frame", opusFrame);
  }

  private applyVolume(pcm: Buffer): Buffer {
    if (this.volume === 100) return Buffer.from(pcm);
    const factor = this.volume / 100;
    const out = Buffer.alloc(pcm.length);
    for (let i = 0; i < pcm.length; i += 2) {
      let sample = pcm.readInt16LE(i);
      sample = Math.round(sample * factor);
      // Clamp to 16-bit range
      if (sample > 32767) sample = 32767;
      else if (sample < -32768) sample = -32768;
      out.writeInt16LE(sample, i);
    }
    return out;
  }

  pause(): void {
    if (this.state === "playing") {
      this.state = "paused";
      this.logger.debug("Playback paused");
    }
  }

  resume(): void {
    if (this.state === "paused") {
      this.state = "playing";
      // Reset timing to avoid burst of frames after unpause
      this.nextFrameTime = performance.now();
      this.logger.debug("Playback resumed");
    }
  }

  /** Seek to a position in seconds. Restarts FFmpeg with -ss offset. */
  seek(seconds: number): void {
    if (!this.currentUrl) return;
    this.logger.info({ seek: seconds }, "Seeking");
    this.play(this.currentUrl, seconds);
  }

  getSeekOffset(): number {
    return this.seekOffset;
  }

  stop(): void {
    this.frameLoopRunning = false;
    if (this.ffmpeg) {
      this.ffmpeg.kill("SIGTERM");
      this.ffmpeg = null;
    }
    this.pcmBuffer = Buffer.alloc(0);
    this.state = "idle";
    this.currentUrl = "";
    this.seekOffset = 0;
  }

  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(100, vol));
  }

  getVolume(): number {
    return this.volume;
  }

  getState(): PlayerState {
    return this.state;
  }
}
