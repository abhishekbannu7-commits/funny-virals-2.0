import { Bed } from "@/lib/studio/bed";
import { SHOT_SECONDS, type Project, type ShotMedia } from "@/lib/studio/types";

export async function recordMaster(
  project: Project,
  media: Record<string, ShotMedia>,
  voices: Record<string, string>,
  onProgress: (label: string) => void,
) {
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 1280;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not start the export.");

  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();
  const bed = new Bed(audioCtx, dest);
  const stream = canvas.captureStream(30);
  for (const track of dest.stream.getAudioTracks()) stream.addTrack(track);

  const mime =
    ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm"].find((type) =>
      MediaRecorder.isTypeSupported(type),
    ) ?? "";
  const recorder = new MediaRecorder(stream, {
    ...(mime ? { mimeType: mime } : {}),
    videoBitsPerSecond: 2_500_000,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  const stopped = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime || "video/webm" }));
  });

  const decoded = new Map<string, AudioBuffer>();
  for (const [key, url] of Object.entries(voices)) {
    try {
      const bytes = await fetch(url).then((res) => res.arrayBuffer());
      decoded.set(key, await audioCtx.decodeAudioData(bytes.slice(0)));
    } catch {
      /* caption still carries the line */
    }
  }

  recorder.start(250);
  bed.start(project.music.bpm);
  let usedStill = false;

  for (let index = 0; index < project.shots.length; index++) {
    const shot = project.shots[index];
    if (!shot) break;
    onProgress(`Shot ${index + 1} of ${project.shots.length}`);
    const fellBack = await drawShot(ctx, shot, media[shot.id], audioCtx, dest, decoded, bed);
    if (fellBack) usedStill = true;
  }

  bed.stop();
  await new Promise((resolve) => window.setTimeout(resolve, 120));
  recorder.stop();
  const blob = await stopped;
  void audioCtx.close();
  const ext = blob.type.includes("mp4") ? "mp4" : "webm";
  return { blob, ext, usedStill };
}

async function drawShot(
  ctx: CanvasRenderingContext2D,
  shot: { id: string; action: string; dialogue: { t: number; line: string }[] },
  media: ShotMedia | undefined,
  audioCtx: AudioContext,
  dest: MediaStreamAudioDestinationNode,
  decoded: Map<string, AudioBuffer>,
  bed: Bed,
) {
  const started = performance.now();
  let video: HTMLVideoElement | null = null;
  let image: HTMLImageElement | null = null;
  let tainted = false;

  if (media?.videoUrl) {
    video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.src = media.videoUrl;
    try {
      await video.play();
    } catch {
      video = null;
    }
  }
  if (!video && media?.stillUrl) {
    image = await loadImage(media.stillUrl);
  }

  for (const [lineIndex, line] of shot.dialogue.entries()) {
    const buffer = decoded.get(`${shot.id}:${lineIndex}`);
    if (!buffer) continue;
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    const gain = audioCtx.createGain();
    gain.gain.value = 0.9;
    source.connect(gain);
    gain.connect(dest);
    gain.connect(audioCtx.destination);
    const when = audioCtx.currentTime + line.t;
    source.start(when);
    bed.setDucked(true);
    window.setTimeout(() => bed.setDucked(false), (line.t + 2.4) * 1000);
  }

  await new Promise<void>((resolve) => {
    const tick = () => {
      const elapsed = (performance.now() - started) / 1000;
      if (elapsed >= SHOT_SECONDS) {
        resolve();
        return;
      }
      paint(ctx, video, image, shot, elapsed, () => {
        tainted = true;
        video = null;
      });
      if (tainted) video = null;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  video?.pause();
  return tainted || !media?.videoUrl;
}

function paint(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement | null,
  image: HTMLImageElement | null,
  shot: { action: string; dialogue: { t: number; line: string }[] },
  elapsed: number,
  onTaint: () => void,
) {
  const { width, height } = ctx.canvas;
  ctx.fillStyle = "#0c0c0b";
  ctx.fillRect(0, 0, width, height);
  const source = video && video.readyState >= 2 ? video : image;
  if (source) {
    const zoom = 1 + elapsed * 0.012;
    try {
      drawCover(ctx, source, zoom);
      ctx.getImageData(0, 0, 1, 1);
    } catch {
      onTaint();
      ctx.fillStyle = "#0c0c0b";
      ctx.fillRect(0, 0, width, height);
      wrapText(ctx, shot.action, 64, height * 0.4, width - 128, 42);
    }
  } else {
    wrapText(ctx, shot.action, 64, height * 0.4, width - 128, 42);
  }
  const line = [...shot.dialogue].reverse().find((item) => item.t <= elapsed);
  if (line) {
    ctx.fillStyle = "rgba(12,12,11,0.72)";
    ctx.fillRect(0, height - 280, width, 280);
    ctx.fillStyle = "#f3f1ea";
    ctx.font = "600 40px Fraunces, Georgia, serif";
    wrapText(ctx, line.line, 48, height - 180, width - 96, 48);
  }
}

function drawCover(ctx: CanvasRenderingContext2D, source: HTMLVideoElement | HTMLImageElement, zoom: number) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const mediaW = source instanceof HTMLVideoElement ? source.videoWidth || width : source.naturalWidth || width;
  const mediaH = source instanceof HTMLVideoElement ? source.videoHeight || height : source.naturalHeight || height;
  const scale = Math.max(width / mediaW, height / mediaH) * zoom;
  const dw = mediaW * scale;
  const dh = mediaH * scale;
  ctx.drawImage(source, (width - dw) / 2, (height - dh) / 2, dw, dh);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lineHeight: number) {
  const words = text.split(" ");
  let line = "";
  let cursor = y;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > max && line) {
      ctx.fillText(line, x, cursor);
      line = word;
      cursor += lineHeight;
    } else {
      line = next;
    }
  }
  if (line) ctx.fillText(line, x, cursor);
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    if (url.startsWith("https://")) image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load a still for export."));
    image.src = url;
  });
}
