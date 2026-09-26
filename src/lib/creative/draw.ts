import { sceneAt, type CreativeProject, type Scene } from "@/lib/creative/types";

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 5);
}

function figureX(scene: Scene, count: number, local: number) {
  const span = Math.max(1, count - 1);
  const from = scene.index / span;
  const to = Math.min(1, (scene.index + 1) / span);
  const t = scene.end > scene.start ? local / (scene.end - scene.start) : 0;
  return 0.18 + (from + (to - from) * Math.min(1, t)) * 0.58;
}

function paintScene(ctx: CanvasRenderingContext2D, project: CreativeProject, scene: Scene, local: number) {
  const { width, height } = ctx.canvas;
  const wide = project.aspect === "16:9";
  const horizon = height * (wide ? 0.62 : 0.58);
  ctx.fillStyle = "#0c0c0b";
  ctx.fillRect(0, 0, width, height);
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#1c1c1a");
  sky.addColorStop(1, "#0c0c0b");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#d5e4ee";
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = wide ? 8 : 14;
  ctx.beginPath();
  ctx.moveTo(width * 0.08, 0);
  ctx.lineTo(width * 0.08, horizon);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.strokeStyle = "#2e2d2a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  ctx.lineTo(width, horizon);
  ctx.stroke();

  if (scene.continuity.objects.startsWith("Holographic")) {
    ctx.strokeStyle = "#d5e4ee";
    ctx.lineWidth = 2;
    const boxX = width * 0.58;
    const boxY = horizon - height * 0.28;
    for (let row = 0; row < 4; row++) {
      ctx.strokeRect(boxX, boxY + row * 22, width * 0.28, 12);
    }
  }

  const x = width * figureX(scene, project.scenes.length, local);
  const scale = wide ? 1 : 1.15;
  const head = horizon - 200 * scale;
  ctx.fillStyle = "#f3f1ea";
  ctx.beginPath();
  ctx.arc(x, head, 28 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d5e4ee";
  ctx.beginPath();
  ctx.moveTo(x - 52 * scale, horizon);
  ctx.lineTo(x - 20 * scale, head + 34 * scale);
  ctx.lineTo(x + 20 * scale, head + 34 * scale);
  ctx.lineTo(x + 52 * scale, horizon);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#9a968c";
  ctx.font = `${wide ? 18 : 22}px Outfit, sans-serif`;
  ctx.fillText(scene.continuity.location, 36, 48);
  ctx.fillStyle = "#6f6c64";
  ctx.font = `${wide ? 16 : 18}px Outfit, sans-serif`;
  ctx.fillText(`${scene.continuity.time} · ${scene.continuity.camera}`, 36, 76);

  ctx.fillStyle = "#f3f1ea";
  ctx.font = `600 ${wide ? 42 : 56}px Fraunces, Georgia, serif`;
  const title = scene.index === 0 ? project.title : scene.title;
  wrap(ctx, title, width - 80).forEach((line, i) => ctx.fillText(line, 36, height * 0.2 + i * (wide ? 50 : 64)));

  const bar = wide ? 150 : 220;
  ctx.fillStyle = "rgba(12,12,11,0.82)";
  ctx.fillRect(0, height - bar, width, bar);
  ctx.fillStyle = "#f3f1ea";
  ctx.font = `${wide ? 26 : 32}px Fraunces, Georgia, serif`;
  wrap(ctx, scene.narration, width - 72).forEach((line, i) => ctx.fillText(line, 36, height - bar + 48 + i * (wide ? 34 : 42)));

  if (scene.index === project.scenes.length - 1 && local > 6.2) {
    ctx.fillStyle = "#0c0c0b";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#d5e4ee";
    ctx.font = `600 ${wide ? 28 : 32}px Outfit, sans-serif`;
    ctx.fillText("Orin", 36, height * 0.38);
    ctx.fillStyle = "#f3f1ea";
    ctx.font = `600 ${wide ? 42 : 52}px Fraunces, Georgia, serif`;
    wrap(ctx, project.cta, width - 72).forEach((line, i) => ctx.fillText(line, 36, height * 0.38 + 64 + i * 58));
  }
}

export function drawFrame(ctx: CanvasRenderingContext2D, project: CreativeProject, time: number) {
  const scene = sceneAt(project, time);
  if (!scene) return;
  const local = time - scene.start;
  const prev = project.scenes[scene.index - 1];
  if (scene.transition === "fade" && prev && local < 0.45) {
    paintScene(ctx, project, prev, prev.end - prev.start);
    ctx.save();
    ctx.globalAlpha = local / 0.45;
    paintScene(ctx, project, scene, local);
    ctx.restore();
    return;
  }
  paintScene(ctx, project, scene, local);
}
