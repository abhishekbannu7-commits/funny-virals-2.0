import { useEffect, useMemo, useRef, useState } from "react";
import { Clapperboard, Download, Film, ImageIcon, Lock, LockOpen, Pause, Play, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Bed } from "@/lib/studio/bed";
import { recordMaster } from "@/lib/studio/export-master";
import { imageSourceForVideo, lastFrameOf } from "@/lib/studio/frames";
import { applyRevision } from "@/lib/studio/merge";
import { sampleMedia, sampleProject } from "@/lib/studio/sample";
import { directReel, generateStill, pollClip, reviseReel, speakLine, startClip } from "@/lib/studio/server";
import { SHOT_SECONDS, type CutMode, type DurationSec, type MediaMap, type Project, DURATIONS } from "@/lib/studio/types";

const STORAGE_KEY = "fv-studio-v1";

function formatClock(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function slug(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "reel";
}

function activeLine(project: Project, index: number, elapsed: number) {
  const shot = project.shots[index];
  if (!shot) return null;
  let lineIndex = -1;
  shot.dialogue.forEach((line, i) => {
    if (elapsed >= line.t && elapsed < line.t + 2.6) lineIndex = i;
  });
  if (lineIndex < 0) return null;
  return { shotId: shot.id, lineIndex, text: shot.dialogue[lineIndex]?.line ?? "" };
}

export function Studio() {
  const [project, setProject] = useState<Project>(sampleProject);
  const [media, setMedia] = useState<MediaMap>(sampleMedia);
  const [voices, setVoices] = useState<Record<string, string>>({});
  const [hydrated, setHydrated] = useState(false);
  const [prompt, setPrompt] = useState(sampleProject.prompt);
  const [durationSec, setDurationSec] = useState<DurationSec>(30);
  const [mode, setMode] = useState<CutMode>("cut");
  const [instruction, setInstruction] = useState("");
  const [shotIndex, setShotIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const projectRef = useRef(project);
  const mediaRef = useRef(media);
  const voicesRef = useRef(voices);
  const bedRef = useRef<Bed | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const startIndexRef = useRef(0);
  projectRef.current = project;
  mediaRef.current = media;
  voicesRef.current = voices;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { project?: Project; media?: MediaMap };
        if (saved.project?.shots?.length && saved.media) {
          setProject(saved.project);
          setMedia(saved.media);
          setPrompt(saved.project.prompt);
          setDurationSec(saved.project.durationSec);
          setMode(saved.project.mode);
        }
      }
    } catch {
      /* keep the sample */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ project, media }));
  }, [hydrated, project, media]);

  const shot = project.shots[shotIndex] ?? project.shots[0];
  const spoken = activeLine(project, shotIndex, elapsed);
  const line =
    spoken ??
    (!playing && shot?.dialogue[0]
      ? { shotId: shot.id, lineIndex: 0, text: shot.dialogue[0].line }
      : null);
  const position = shotIndex * SHOT_SECONDS + (playing ? elapsed : 0);

  const missingStills = useMemo(
    () => project.shots.filter((item) => !media[item.id]?.stillUrl).length,
    [project.shots, media],
  );

  useEffect(() => {
    if (!playing) return;
    let index = startIndexRef.current;
    let interval = 0;
    let cancel = false;

    const finish = () => {
      if (cancel) return;
      setPlaying(false);
      setElapsed(0);
      bedRef.current?.stop();
      bedRef.current = null;
    };

    const run = () => {
      if (cancel) return;
      const current = projectRef.current.shots[index];
      if (!current) {
        finish();
        return;
      }
      setShotIndex(index);
      setElapsed(0);
      window.clearInterval(interval);
      const videoUrl = mediaRef.current[current.id]?.videoUrl;
      const video = videoRef.current;
      if (videoUrl && video) {
        video.src = videoUrl;
        video.currentTime = 0;
        video.onended = () => {
          index += 1;
          run();
        };
        video.ontimeupdate = () => setElapsed(video.currentTime || 0);
        video.onerror = () => {
          setMedia((prev) => ({
            ...prev,
            [current.id]: {
              ...prev[current.id],
              videoUrl: undefined,
              videoState: "failed",
              videoError: "That clip link expired. Render it again.",
            },
          }));
          index += 1;
          run();
        };
        void video.play().catch(() => {
          index += 1;
          run();
        });
        return;
      }
      const started = performance.now();
      interval = window.setInterval(() => {
        const nextElapsed = (performance.now() - started) / 1000;
        if (nextElapsed >= SHOT_SECONDS) {
          index += 1;
          run();
          return;
        }
        setElapsed(nextElapsed);
      }, 200);
    };

    run();
    return () => {
      cancel = true;
      window.clearInterval(interval);
      const video = videoRef.current;
      if (video) {
        video.onended = null;
        video.ontimeupdate = null;
        video.onerror = null;
        video.pause();
      }
    };
  }, [playing]);

  useEffect(() => {
    if (!playing || !line) return;
    const url = voices[`${line.shotId}:${line.lineIndex}`];
    if (!url) return;
    const audio = new Audio(url);
    void audio.play().catch(() => undefined);
    bedRef.current?.setDucked(true);
    return () => {
      audio.pause();
      bedRef.current?.setDucked(false);
    };
  }, [playing, line?.shotId, line?.lineIndex, voices]);

  function stopPlayback() {
    setPlaying(false);
    bedRef.current?.stop();
    bedRef.current = null;
    videoRef.current?.pause();
  }

  function togglePlay() {
    if (playing) {
      stopPlayback();
      return;
    }
    startIndexRef.current = shotIndex;
    bedRef.current?.stop();
    const bed = new Bed();
    bedRef.current = bed;
    bed.start(project.music.bpm);
    setElapsed(0);
    setPlaying(true);
  }

  async function onGenerate() {
    setError(null);
    setNote(null);
    setBusy("Writing the shot plan");
    stopPlayback();
    try {
      const result = await directReel({ data: { prompt, durationSec, mode } });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setProject(result.project);
      setMedia({});
      setVoices({});
      setShotIndex(0);
      setElapsed(0);
      setNote("Plan is ready. Render stills before you spend a video clip.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not write the plan.");
    } finally {
      setBusy(null);
    }
  }

  async function onRevise() {
    setError(null);
    setBusy("Rewriting unlocked shots");
    stopPlayback();
    try {
      const result = await reviseReel({ data: { instruction, project } });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const merged = applyRevision(project, result.project, media);
      setProject(merged.project);
      setMedia(merged.media);
      setNote(
        merged.dirtyIds.length
          ? `${result.note} ${merged.dirtyIds.length} shot${merged.dirtyIds.length === 1 ? "" : "s"} need a new clip.`
          : result.note,
      );
      setInstruction("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not apply the edit.");
    } finally {
      setBusy(null);
    }
  }

  async function onStills() {
    setError(null);
    const pending = project.shots.filter((item) => !media[item.id]?.stillUrl);
    if (!pending.length) {
      setNote("Every shot already has a still.");
      return;
    }
    setBusy(`Rendering still 1 of ${pending.length}`);
    let done = 0;
    for (const item of pending) {
      done += 1;
      setBusy(`Rendering still ${done} of ${pending.length}`);
      try {
        const result = await generateStill({
          data: { prompt: `${project.style} ${item.stillPrompt}`.slice(0, 800) },
        });
        if (!result.ok) {
          setError(result.error);
          break;
        }
        setMedia((prev) => ({
          ...prev,
          [item.id]: { ...prev[item.id], stillUrl: result.url, videoState: prev[item.id]?.videoState ?? "idle" },
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not render a still.");
        break;
      }
    }
    setBusy(null);
  }

  async function onRenderClip() {
    if (!shot) return;
    const current = media[shot.id];
    if (!current?.stillUrl) {
      setError("Render a still first. The clip starts from that frame.");
      return;
    }
    if (Object.values(media).some((item) => item.videoState === "rendering")) {
      setError("Wait for the clip already rendering.");
      return;
    }
    setError(null);
    setBusy("Starting a 10-second clip");
    try {
      let imageUrl = current.stillUrl;
      const previous = project.shots[shotIndex - 1];
      if (project.mode === "chain" && previous && media[previous.id]?.videoUrl) {
        try {
          imageUrl = await lastFrameOf(media[previous.id]!.videoUrl!);
        } catch {
          imageUrl = await imageSourceForVideo(current.stillUrl);
        }
      } else {
        imageUrl = await imageSourceForVideo(current.stillUrl);
      }
      const result = await startClip({
        data: {
          prompt: `${project.style} ${shot.videoPrompt}`.slice(0, 800),
          imageUrl,
        },
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMedia((prev) => ({
        ...prev,
        [shot.id]: { ...prev[shot.id], requestId: result.requestId, videoState: "rendering", videoError: undefined },
      }));
      void watchClip(shot.id, result.requestId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the clip.");
    } finally {
      setBusy(null);
    }
  }

  async function watchClip(shotId: string, requestId: string) {
    const started = Date.now();
    while (Date.now() - started < 180000) {
      await new Promise((resolve) => window.setTimeout(resolve, 4000));
      const result = await pollClip({ data: { requestId } });
      if (!result.ok) {
        setMedia((prev) => ({
          ...prev,
          [shotId]: { ...prev[shotId], videoState: "failed", videoError: result.error },
        }));
        setError(result.error);
        return;
      }
      if (result.status === "done" && result.url) {
        setMedia((prev) => ({
          ...prev,
          [shotId]: { ...prev[shotId], videoUrl: result.url, videoState: "done", videoError: undefined },
        }));
        setNote("Clip is in. Play it before you render the next one.");
        return;
      }
      if (result.status === "failed" || result.status === "expired") {
        setMedia((prev) => ({
          ...prev,
          [shotId]: { ...prev[shotId], videoState: "failed", videoError: "The clip failed. Try that shot again." },
        }));
        setError("The clip failed. Try that shot again.");
        return;
      }
    }
    setMedia((prev) => ({
      ...prev,
      [shotId]: { ...prev[shotId], videoState: "failed", videoError: "The clip timed out." },
    }));
    setError("The clip timed out. Try that shot again.");
  }

  async function onVoices() {
    setError(null);
    const jobs = project.shots.flatMap((item) =>
      item.dialogue.map((lineItem, lineIndex) => ({ id: item.id, lineIndex, text: lineItem.line })),
    );
    if (!jobs.length) return;
    setBusy("Rendering dialogue");
    for (const job of jobs) {
      const key = `${job.id}:${job.lineIndex}`;
      if (voicesRef.current[key]) continue;
      try {
        const result = await speakLine({ data: { text: job.text } });
        if (!result.ok) {
          setError(result.error);
          break;
        }
        const url = `data:${result.mime};base64,${result.audioBase64}`;
        setVoices((prev) => ({ ...prev, [key]: url }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not render dialogue.");
        break;
      }
    }
    setBusy(null);
  }

  async function onDownload() {
    setError(null);
    setBusy("Recording the master");
    stopPlayback();
    try {
      const result = await recordMaster(project, media, voices, setBusy);
      const href = URL.createObjectURL(result.blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = `funny-virals-${slug(project.title)}.${result.ext}`;
      link.click();
      URL.revokeObjectURL(href);
      setNote(
        result.usedStill
          ? "Master downloaded. Shots without a clip used their still."
          : "Master downloaded.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record the master.");
    } finally {
      setBusy(null);
    }
  }

  async function copyCaption() {
    const text = `${project.caption}\n\n${project.hashtags.map((tag) => `#${tag}`).join(" ")}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function loadSample() {
    stopPlayback();
    setProject(sampleProject);
    setMedia(sampleMedia);
    setVoices({});
    setPrompt(sampleProject.prompt);
    setDurationSec(30);
    setMode("cut");
    setShotIndex(0);
    setElapsed(0);
    setError(null);
    setNote("Sample storyboard stays on this device. A cloud plan replaces it only if you tap.");
  }

  function updateShot(patch: Partial<(typeof project.shots)[number]>) {
    if (!shot) return;
    setProject((prev) => ({
      ...prev,
      shots: prev.shots.map((item) => (item.id === shot.id ? { ...item, ...patch } : item)),
    }));
    if (patch.action || patch.videoPrompt || patch.dialogue) {
      setMedia((prev) => ({
        ...prev,
        [shot.id]: { stillUrl: prev[shot.id]?.stillUrl, videoState: "idle" },
      }));
    }
  }

  const clipLabel =
    media[shot?.id ?? ""]?.videoState === "rendering"
      ? "Cloud clip running"
      : project.mode === "chain" && shotIndex > 0
        ? "Cloud clip from last frame"
        : "Cloud 10s clip";

  return (
    <main className="min-h-screen bg-bg text-fg">
      <header className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-widest text-muted uppercase">Optional studio</p>
          <h1 className="font-display text-2xl leading-tight font-medium">Funny Virals</h1>
          <p className="text-sm text-muted">Not part of Zoro. Cloud steps are labeled and idle until you tap.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={loadSample}>Sample</Button>
          <Button variant="primary" onClick={() => void onDownload()} disabled={!!busy}>
            <Download className="size-4" aria-hidden="true" />
            Download
          </Button>
        </div>
      </header>

      <div className="grid gap-6 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <section className="flex flex-col gap-4">
          <div className="flex flex-col items-center gap-3">
            <div className="frame-9-16 relative overflow-hidden rounded-xl bg-surface">
              <video
                ref={videoRef}
                className={playing && media[shot?.id ?? ""]?.videoUrl ? "h-full w-full object-cover" : "hidden"}
                playsInline
                muted
              />
              {shot && media[shot.id]?.stillUrl && !(playing && media[shot.id]?.videoUrl) ? (
                <img
                  src={media[shot.id]?.stillUrl}
                  alt={shot.action}
                  className={playing ? "kenburns h-full w-full object-cover" : "h-full w-full object-cover"}
                />
              ) : null}
              {shot && !media[shot.id]?.stillUrl && !(playing && media[shot.id]?.videoUrl) ? (
                <div className="flex h-full flex-col justify-end p-5">
                  <p className="text-xs font-medium text-muted">Shot {shotIndex + 1}</p>
                  <p className="mt-2 font-display text-2xl leading-snug font-medium">{shot.action}</p>
                </div>
              ) : null}
              {line ? (
                <div className="absolute inset-x-0 bottom-0 bg-bg/80 px-4 py-4">
                  <p className="font-display text-lg leading-snug font-medium">{line.text}</p>
                </div>
              ) : null}
            </div>
            <div className="flex w-full max-w-md items-center justify-between gap-3">
              <Button variant="primary" onClick={togglePlay} disabled={!!busy && busy.startsWith("Recording")}>
                {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
                {playing ? "Pause" : "Play"}
              </Button>
              <p className="font-mono text-sm text-muted tabular-nums">
                {formatClock(position)} / {formatClock(project.durationSec)}
              </p>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {project.shots.map((item, index) => {
              const still = media[item.id]?.stillUrl;
              const selected = index === shotIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    stopPlayback();
                    setShotIndex(index);
                    setElapsed(0);
                  }}
                  className={`w-24 shrink-0 overflow-hidden rounded-lg border text-left ${selected ? "border-fg" : "border-line"}`}
                >
                  <div className="thumb-9-16 relative bg-surface-2">
                    {still ? <img src={still} alt="" className="h-full w-full object-cover" /> : null}
                    {media[item.id]?.videoUrl ? (
                      <Film className="absolute top-1.5 right-1.5 size-3.5 text-fg" aria-label="Clip ready" />
                    ) : null}
                  </div>
                  <p className="px-2 py-1.5 text-xs text-muted tabular-nums">
                    {formatClock(index * SHOT_SECONDS)}
                    {item.locked ? " · locked" : ""}
                  </p>
                </button>
              );
            })}
          </div>
          <p className="text-sm text-muted">
            {project.title}. {project.mode === "chain" ? "Chain mode" : "Cut mode"}. {project.music.mood} at{" "}
            {Math.round(project.music.bpm)} bpm. Stills play until you render a clip.
          </p>
        </section>

        <aside className="flex flex-col gap-5 lg:sticky lg:top-0 lg:max-h-screen lg:overflow-y-auto lg:py-1">
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {note ? <p className="text-sm text-muted">{note}</p> : null}
          {busy ? <p className="text-sm text-fg">{busy}</p> : null}
          <p className="text-sm text-muted">
            Plan, stills, clips, voices, and edits call xAI and may spend quota. Play, sample, lock, caption copy, and
            download stay on this device.
          </p>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">Prompt</span>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={4}
              className="min-h-28 rounded-lg border border-line bg-surface px-3 py-3 text-sm text-fg outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            {DURATIONS.map((value) => (
              <Button
                key={value}
                variant={durationSec === value ? "primary" : "ghost"}
                onClick={() => setDurationSec(value)}
              >
                {value === 120 ? "2 min" : `${value}s`}
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant={mode === "cut" ? "primary" : "ghost"} onClick={() => setMode("cut")}>
              Cuts
            </Button>
            <Button variant={mode === "chain" ? "primary" : "ghost"} onClick={() => setMode("chain")}>
              One take
            </Button>
          </div>
          <p className="text-sm text-muted">
            {mode === "cut"
              ? "Hard cuts, same character. Clips can be rendered in any order."
              : "Each clip starts on the last frame of the one before it. Render them in order."}
          </p>
          <Button variant="primary" onClick={() => void onGenerate()} disabled={!!busy || prompt.trim().length < 8}>
            <Clapperboard className="size-4" />
            Cloud plan
          </Button>

          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-xl font-medium">Shot {shotIndex + 1}</h2>
              <Button
                onClick={() => updateShot({ locked: !shot?.locked })}
                disabled={!shot}
              >
                {shot?.locked ? <Lock className="size-4" /> : <LockOpen className="size-4" />}
                {shot?.locked ? "Locked" : "Lock"}
              </Button>
            </div>
            <textarea
              value={shot?.action ?? ""}
              disabled={!shot || shot.locked}
              onChange={(event) => updateShot({ action: event.target.value })}
              rows={3}
              className="rounded-lg border border-line bg-surface px-3 py-3 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
            />
            <p className="text-sm text-muted">{shot?.dialogue.map((item) => item.line).join(" / ") || "No dialogue"}</p>
            {media[shot?.id ?? ""]?.videoError ? (
              <p className="text-sm text-danger">{media[shot?.id ?? ""]?.videoError}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void onStills()} disabled={!!busy || missingStills === 0}>
                <ImageIcon className="size-4" />
                {missingStills ? `Cloud stills (${missingStills})` : "Stills ready"}
              </Button>
              <Button onClick={() => void onRenderClip()} disabled={!!busy || !shot}>
                <Film className="size-4" />
                {clipLabel}
              </Button>
              <Button onClick={() => void onVoices()} disabled={!!busy}>
                Cloud voices
              </Button>
            </div>
            <p className="text-sm text-muted">
              A still is a picture. A clip is 10 seconds of video and costs more. Both are optional cloud. Edits clear the
              clip and keep the still.
            </p>
          </div>

          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">Edit the plan</span>
              <textarea
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                rows={3}
                placeholder="Change the punchline. Keep shot 1."
                className="rounded-lg border border-line bg-surface px-3 py-3 text-sm outline-none placeholder:text-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              />
            </label>
            <Button onClick={() => void onRevise()} disabled={!!busy || instruction.trim().length < 2}>
              Cloud edit
            </Button>
            <p className="text-sm text-muted">Locked shots stay. Only dirty shots lose their clip.</p>
          </div>

          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <h2 className="font-display text-xl font-medium">Post</h2>
            <p className="text-sm text-fg">{project.caption}</p>
            <p className="text-sm text-muted">{project.hashtags.map((tag) => `#${tag}`).join(" ")}</p>
            <Button onClick={() => void copyCaption()}>{copied ? "Copied" : "Copy caption"}</Button>
            <div className="rounded-lg border border-line p-3">
              <div className="flex items-center gap-2">
                <Upload className="size-4" />
                <h3 className="text-sm font-medium">YouTube</h3>
              </div>
              <p className="mt-2 text-sm text-muted">
                Download the master, copy the caption, then upload the file. YouTube will take the full{" "}
                {project.durationSec} seconds.
              </p>
              <Button
                className="mt-3"
                onClick={() => window.open("https://www.youtube.com/upload", "_blank", "noopener,noreferrer")}
              >
                Open YouTube upload
              </Button>
            </div>
            <div className="rounded-lg border border-line p-3">
              <h3 className="text-sm font-medium">Instagram</h3>
              <p className="mt-2 text-sm text-muted">
                Posting from here needs a professional account and Meta app review, which this studio does not complete.
                Download the master and post it from the Instagram app.
                {project.durationSec > 90
                  ? " API Reels are often rejected past 90 seconds, so prefer a 90-second plan for that path."
                  : " This cut is within 90 seconds."}
              </p>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
