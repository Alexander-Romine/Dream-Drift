import { FFmpeg } from "@ffmpeg/ffmpeg";
import coreURL from "@ffmpeg/core?url";
import wasmURL from "@ffmpeg/core/wasm?url";
import threadedCoreURL from "@ffmpeg/core-mt?url";
import threadedWasmURL from "@ffmpeg/core-mt/wasm?url";
import threadedWorkerURL from "@ffmpeg/core-mt/worker?url";
import { fetchFile } from "@ffmpeg/util";

declare global {
  interface Window {
    prepareFFmpeg: () => Promise<void>;
    transcodeToMp4: (
      input: Blob,
      durationSeconds: number,
      onProgress?: (progress: number) => void,
    ) => Promise<Blob>;
  }
}

let ffmpeg: FFmpeg | null = null;
let loadPromise: Promise<void> | null = null;
let progressHandler: ((progress: number) => void) | undefined;
let activeDuration = 0;
let lastProgress = 0;
let usingThreadedCore = false;
let forceSingleCore = false;
let threadCount = 1;

function attachProgress(instance: FFmpeg) {
  instance.on("progress", ({ progress, time }) => {
    const timelineProgress =
      activeDuration > 0 && Number.isFinite(time)
        ? time / (activeDuration * 1_000_000)
        : 0;
    lastProgress = Math.max(
      lastProgress,
      Number.isFinite(progress) ? progress : 0,
      timelineProgress,
    );
    progressHandler?.(Math.max(0, Math.min(0.99, lastProgress)));
  });
}

async function loadCore() {
  const canUseThreads =
    !forceSingleCore &&
    window.crossOriginIsolated &&
    typeof window.SharedArrayBuffer !== "undefined" &&
    navigator.hardwareConcurrency > 1;

  const instance = new FFmpeg();
  attachProgress(instance);
  let timeout = 0;
  try {
    const load = instance.load(
      canUseThreads
        ? {
            coreURL: threadedCoreURL,
            wasmURL: threadedWasmURL,
            workerURL: threadedWorkerURL,
          }
        : { coreURL, wasmURL },
    );
    await Promise.race([
      load,
      new Promise<never>((_, reject) => {
        timeout = window.setTimeout(
          () => reject(new Error("FFmpeg initialization timed out.")),
          canUseThreads ? 20_000 : 45_000,
        );
      }),
    ]);
    ffmpeg = instance;
    usingThreadedCore = canUseThreads;
    threadCount = canUseThreads
      ? Math.max(2, Math.min(8, navigator.hardwareConcurrency - 1))
      : 1;
  } catch (error) {
    try {
      instance.terminate();
    } catch {}
    if (canUseThreads) {
      forceSingleCore = true;
      await loadCore();
      return;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

window.prepareFFmpeg = () => {
  loadPromise ??= loadCore().catch((error) => {
    loadPromise = null;
    throw error;
  });
  return loadPromise;
};

async function convert(input: Blob) {
  if (!ffmpeg) throw new Error("FFmpeg is not loaded.");

  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const inputName = `input-${token}.webm`;
  const outputName = `output-${token}.mp4`;

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(input));
    progressHandler?.(0.01);
    const exitCode = await ffmpeg.exec([
      "-fflags",
      "+genpts",
      "-i",
      inputName,
      "-t",
      activeDuration.toFixed(3),
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-tune",
      "zerolatency",
      "-crf",
      "26",
      "-pix_fmt",
      "yuv420p",
      "-g",
      "150",
      "-bf",
      "0",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-threads",
      String(threadCount),
      outputName,
    ]);

    if (exitCode !== 0) throw new Error(`FFmpeg exited with code ${exitCode}.`);

    const output = await ffmpeg.readFile(outputName);
    if (typeof output === "string" || output.byteLength === 0) {
      throw new Error("FFmpeg produced an empty MP4.");
    }
    return new Blob([new Uint8Array(output)], { type: "video/mp4" });
  } finally {
    await Promise.allSettled([
      ffmpeg.deleteFile(inputName),
      ffmpeg.deleteFile(outputName),
    ]);
  }
}

window.transcodeToMp4 = async (input, durationSeconds, onProgress) => {
  await window.prepareFFmpeg();
  progressHandler = onProgress;
  activeDuration = Math.max(0, durationSeconds || 0);
  lastProgress = 0;

  try {
    try {
      return await convert(input);
    } catch (error) {
      if (!usingThreadedCore) throw error;

      // A device may expose SharedArrayBuffer but still fail under memory
      // pressure. Retry once with the slower, broadly compatible core.
      try {
        ffmpeg?.terminate();
      } catch {}
      ffmpeg = null;
      usingThreadedCore = false;
      forceSingleCore = true;
      loadPromise = null;
      lastProgress = 0;
      await window.prepareFFmpeg();
      return await convert(input);
    }
  } finally {
    progressHandler = undefined;
    activeDuration = 0;
    lastProgress = 0;
  }
};

document
  .getElementById("expBtn")
  ?.addEventListener("pointerenter", () => void window.prepareFFmpeg().catch(() => {}), {
    once: true,
  });
