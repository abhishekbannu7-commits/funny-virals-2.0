export async function imageSourceForVideo(url: string): Promise<string> {
  if (url.startsWith("https://") || url.startsWith("data:")) return url;
  const blob = await fetch(url).then((res) => {
    if (!res.ok) throw new Error("Could not read the still.");
    return res.blob();
  });
  return blobToJpeg(blob);
}

export async function lastFrameOf(url: string): Promise<string> {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error("Could not read the previous clip."));
  });
  const end = Math.max(0, (Number.isFinite(video.duration) ? video.duration : 10) - 0.08);
  await new Promise<void>((resolve) => {
    video.onseeked = () => resolve();
    video.currentTime = end;
  });
  return drawCover(video);
}

async function blobToJpeg(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    return drawCover(bitmap);
  } finally {
    bitmap.close();
  }
}

function drawCover(source: CanvasImageSource & { width?: number; height?: number; videoWidth?: number; videoHeight?: number }) {
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 1280;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare the frame.");
  const sw = source.videoWidth || source.width || 9;
  const sh = source.videoHeight || source.height || 16;
  const scale = Math.max(canvas.width / sw, canvas.height / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.drawImage(source, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
  try {
    ctx.getImageData(0, 0, 1, 1);
  } catch {
    throw new Error("This clip can't be copied. The next shot will start from its still.");
  }
  return canvas.toDataURL("image/jpeg", 0.84);
}
