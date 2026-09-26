import { Bed } from "@/lib/studio/bed";
import { drawFrame } from "@/lib/creative/draw";
import { frameSize, type CreativeProject } from "@/lib/creative/types";

function burst(ctx: AudioContext, dest: AudioNode) {
  const noise = ctx.createBufferSource();
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.12, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  noise.buffer = buffer;
  const gain = ctx.createGain();
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.2, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
  noise.connect(gain);
  gain.connect(dest);
  noise.start(now);
  noise.stop(now + 0.2);
}

export async function recordCreative(project: CreativeProject, onProgress: (label: string) => void) {
  await document.fonts.ready;
  const size = frameSize(project.aspect);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not start the export.");

  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();
  const bed = new Bed(audioCtx, dest);
  const stream = canvas.captureStream(30);
  for (const track of dest.stream.getAudioTracks()) stream.addTrack(track);
  const mime =
    ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm"].find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
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

  recorder.start(250);
  bed.start(project.music.bpm);

  for (const scene of project.scenes) {
    onProgress(`Scene ${scene.index + 1} of ${project.scenes.length}`);
    if (scene.sfx === "whoosh") burst(audioCtx, dest);
    const dur = scene.end - scene.start;
    const started = performance.now();
    await new Promise<void>((resolve) => {
      const tick = () => {
        const elapsed = (performance.now() - started) / 1000;
        drawFrame(ctx, project, scene.start + Math.min(dur, elapsed));
        if (elapsed >= dur) resolve();
        else requestAnimationFrame(tick);
      };
      tick();
    });
  }

  bed.stop();
  await new Promise((resolve) => window.setTimeout(resolve, 120));
  recorder.stop();
  const blob = await stopped;
  void audioCtx.close();
  const ext = blob.type.includes("mp4") ? "mp4" : "webm";
  return { blob, ext };
}
