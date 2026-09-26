import { useEffect, useRef, useState } from "react";
import { Clapperboard, Download, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Bed } from "@/lib/studio/bed";
import { drawFrame } from "@/lib/creative/draw";
import { recordCreative } from "@/lib/creative/export";
import { clock, planProject, relink } from "@/lib/creative/plan";
import { cloudJob, DEFAULT_ROUTE, PROVIDER_LANES, type CloudLane, type ProviderRoute } from "@/lib/creative/providers";
import { publishTargets } from "@/lib/creative/publish";
import { reviewProject } from "@/lib/creative/review";
import {
  DURATIONS,
  frameSize,
  sceneAt,
  type AuditRow,
  type CreativeProject,
  type DurationSec,
  type Platform,
  type Scene,
  type Transition,
} from "@/lib/creative/types";

const STORAGE_KEY = "orin-creative-v1";

function loadInitial(brief: string) {
  if (brief.trim().length > 8) return planProject(brief);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as CreativeProject;
      if (saved?.scenes?.[0]?.endFrame && saved.arc && saved.visual && saved.character?.appearance?.length) return saved;
    }
  } catch {
    /* sample */
  }
  return planProject("Make a cinematic Instagram Reel about AI doctors.", 32);
}

function slug(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "orin";
}

export function CreativeStudio({
  brief,
  onBack,
  onShotDesk,
}: {
  brief: string;
  onBack: () => void;
  onShotDesk: () => void;
}) {
  const [project, setProject] = useState<CreativeProject>(() => loadInitial(brief));
  const [prompt, setPrompt] = useState(brief.trim().length > 8 ? brief : "Make a cinematic Instagram Reel about AI doctors.");
  const [durationSec, setDurationSec] = useState<DurationSec>(32);
  const [clockSec, setClockSec] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speak, setSpeak] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState<ProviderRoute>(DEFAULT_ROUTE);
  const [consent, setConsent] = useState<CloudLane | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [publishStep, setPublishStep] = useState<"ready" | "confirm" | "handoff">("ready");
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spokenScene = useRef(-1);
  const clockRef = useRef(0);
  const whooshed = useRef(-1);

  const scene = sceneAt(project, clockSec) ?? project.scenes[0];
  const checks = reviewProject(project);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    } catch {
      /* private mode */
    }
  }, [project]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const size = frameSize(project.aspect);
    if (canvas.width !== size.width) canvas.width = size.width;
    if (canvas.height !== size.height) canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawFrame(ctx, project, clockSec);
  }, [project, clockSec]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const next = clockRef.current + dt;
      if (next >= project.durationSec - 0.04) {
        clockRef.current = Math.max(0, project.durationSec - 0.04);
        setClockSec(clockRef.current);
        setPlaying(false);
        return;
      }
      clockRef.current = next;
      setClockSec(next);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playing, project.durationSec]);

  useEffect(() => {
    if (!playing) return;
    const bed = new Bed();
    bed.start(project.music.bpm);
    return () => bed.stop();
  }, [playing, project.music.bpm]);

  useEffect(() => {
    if (!playing || !scene || scene.sfx !== "whoosh" || whooshed.current === scene.index) return;
    if (clockSec - scene.start > 0.4) return;
    whooshed.current = scene.index;
    try {
      const ctx = new AudioContext();
      const noise = ctx.createBufferSource();
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.12, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      noise.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = 0.15;
      noise.connect(gain);
      gain.connect(ctx.destination);
      noise.start();
      noise.onended = () => void ctx.close();
    } catch {
      /* effect is optional */
    }
  }, [playing, scene, clockSec]);

  useEffect(() => {
    if (!playing || !speak || !scene) return;
    if (spokenScene.current === scene.index) return;
    spokenScene.current = scene.index;
    if (!window.speechSynthesis) return;
    const utter = new SpeechSynthesisUtterance(scene.narration.slice(0, 220));
    utter.lang = project.language.startsWith("Hindi") ? "hi-IN" : project.language.startsWith("Telugu") ? "te-IN" : "en-US";
    utter.rate = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  }, [playing, speak, scene, project.language]);

  function log(lane: string, detail: string, sent: boolean) {
    setAudit((rows) => [{ id: Math.random().toString(36).slice(2, 8), at: Date.now(), lane, detail, sent }, ...rows].slice(0, 12));
  }

  function plan() {
    setPlaying(false);
    spokenScene.current = -1;
    const next = planProject(prompt, durationSec);
    setProject(next);
    setClockSec(0);
    clockRef.current = 0;
    whooshed.current = -1;
    setPublishStep("ready");
    setError(null);
    log("Planning", "Local scene graph. No request left this device.", false);
  }

  function patchScene(id: string, patch: Partial<Scene>) {
    setProject((prev) =>
      relink({
        ...prev,
        scenes: prev.scenes.map((item) => (item.id === id && !item.locked ? { ...item, ...patch } : item)),
      }),
    );
    setPublishStep("ready");
  }

  function toggleLock() {
    if (!scene) return;
    setProject((prev) =>
      relink({
        ...prev,
        scenes: prev.scenes.map((item) => (item.id === scene.id ? { ...item, locked: !item.locked } : item)),
      }),
    );
  }

  async function onDownload() {
    if (busy) return;
    setPlaying(false);
    setError(null);
    setBusy("Recording on this device");
    try {
      const result = await recordCreative(project, setBusy);
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${slug(project.title)}.${result.ext}`;
      link.click();
      URL.revokeObjectURL(url);
      log("Export", "Master recorded in the browser. No upload.", false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setBusy(null);
    }
  }

  function allowCloud(lane: CloudLane) {
    const job = cloudJob(route, lane);
    setConsent(null);
    if (!job) return;
    log(job.name, `Not connected. Nothing left this device. Would have sent: ${job.sends.join(", ")}.`, false);
    setError(`${job.name} is not connected. The local film is unchanged, and nothing was sent.`);
  }

  function setLane(lane: CloudLane, id: string) {
    setRoute((prev) => ({ ...prev, [lane]: id }));
    setConsent(null);
  }

  const pack = `${project.title}\n${project.caption}\n${project.hashtags.map((tag) => `#${tag}`).join(" ")}\nVisibility: ${project.privacy}`;

  async function copyPack() {
    try {
      await navigator.clipboard.writeText(pack);
      setCopied(true);
    } catch {
      setError("Copy was blocked. Select the caption and copy it yourself.");
    }
  }

  function togglePlatform(platform: Platform) {
    setProject((prev) => {
      const has = prev.platforms.includes(platform);
      const platforms = has ? prev.platforms.filter((item) => item !== platform) : [...prev.platforms, platform];
      const next = platforms.length ? platforms : prev.platforms;
      return { ...prev, platforms: next, platform: next[0] ?? prev.platform };
    });
    setPublishStep("ready");
  }

  return (
    <main className="min-h-screen bg-bg text-fg">
      <header className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-widest text-muted uppercase">Creative studio</p>
          <h1 className="font-display text-2xl leading-tight font-medium">Orin</h1>
          <p className="text-sm text-muted">Plans, pictures, music, and the cut stay here. Cloud is a second tap, and it is not connected.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onBack}>Back</Button>
          <Button onClick={onShotDesk}>Cloud shot desk</Button>
          <Button variant="primary" onClick={() => void onDownload()} disabled={!!busy}>
            <Download className="size-4" />
            Download
          </Button>
        </div>
      </header>

      <div className="grid gap-6 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <section className="flex flex-col gap-4">
          <div className="flex flex-col items-center gap-3">
            <div className={`${project.aspect === "16:9" ? "frame-16-9" : "frame-9-16"} relative overflow-hidden rounded-xl bg-surface`}>
              <canvas ref={canvasRef} className="h-full w-full" />
            </div>
            <div className="flex w-full max-w-md items-center justify-between gap-3">
              <Button
                variant="primary"
                onClick={() => {
                  spokenScene.current = -1;
                  if (!playing && clockSec >= project.durationSec - 0.08) {
                    clockRef.current = 0;
                    setClockSec(0);
                  }
                  setPlaying((value) => !value);
                }}
                disabled={!!busy}
              >
                {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
                {playing ? "Pause" : "Play"}
              </Button>
              <p className="font-mono text-sm text-muted tabular-nums">
                {clock(clockSec)} / {clock(project.durationSec)}
              </p>
            </div>
            <Button onClick={() => setSpeak((value) => !value)} aria-pressed={speak}>
              {speak ? "Narration on" : "Speak narration"}
            </Button>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {project.scenes.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setPlaying(false);
                  clockRef.current = item.start;
                  setClockSec(item.start);
                }}
                className={`w-28 shrink-0 rounded-lg border px-2 py-2 text-left ${item.id === scene?.id ? "border-fg" : "border-line"}`}
              >
                <p className="text-xs text-muted tabular-nums">
                  {clock(item.start)}–{clock(item.end)}
                </p>
                <p className="text-sm text-fg">{item.title}</p>
              </button>
            ))}
          </div>
          <p className="text-sm text-muted">
            {project.concept} {project.scenes.length} linked scenes, not separate clips. The figure keeps one coat and walks from the previous frame into the next.
          </p>
        </section>

        <aside className="flex flex-col gap-5 lg:sticky lg:top-0 lg:max-h-screen lg:overflow-y-auto lg:py-1">
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {busy ? <p className="text-sm text-fg">{busy}</p> : null}

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">Brief</span>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={4}
              className="min-h-28 rounded-lg border border-line bg-surface px-3 py-3 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {DURATIONS.map((value) => (
              <Button key={value} variant={durationSec === value ? "primary" : "ghost"} onClick={() => setDurationSec(value)}>
                {clock(value)}
              </Button>
            ))}
          </div>
          <p className="text-sm text-muted">Each scene is 8 seconds, the usual generated-video slot. Continuity is the handoff, not a fresh character.</p>
          <Button variant="primary" onClick={plan} disabled={prompt.trim().length < 8 || !!busy}>
            <Clapperboard className="size-4" />
            Plan locally
          </Button>

          {scene ? (
            <div className="flex flex-col gap-3 border-t border-line pt-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-xl font-medium">
                  Scene {scene.index + 1}
                  <span className="ml-2 text-sm font-sans text-muted">{scene.title}</span>
                </h2>
                <Button onClick={toggleLock}>{scene.locked ? "Locked" : "Lock"}</Button>
              </div>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium">Action</span>
                <textarea
                  value={scene.action}
                  disabled={scene.locked}
                  rows={2}
                  onChange={(event) => patchScene(scene.id, { action: event.target.value.slice(0, 180) })}
                  className="rounded-lg border border-line bg-surface px-3 py-3 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium">Narration</span>
                <textarea
                  value={scene.narration}
                  disabled={scene.locked}
                  rows={3}
                  onChange={(event) => patchScene(scene.id, { narration: event.target.value.slice(0, 220) })}
                  className="rounded-lg border border-line bg-surface px-3 py-3 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                {(["cut", "fade", "whoosh"] as Transition[]).map((transition) => (
                  <Button
                    key={transition}
                    variant={scene.transition === transition ? "primary" : "ghost"}
                    onClick={() => patchScene(scene.id, { transition, sfx: transition === "whoosh" ? "whoosh" : "none" })}
                    disabled={scene.locked}
                  >
                    {transition}
                  </Button>
                ))}
              </div>
              <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
                {(
                  [
                    ["Character", scene.continuity.characters],
                    ["Wardrobe", scene.continuity.wardrobe],
                    ["Location", scene.continuity.location],
                    ["Time", scene.continuity.time],
                    ["Camera", scene.continuity.camera],
                    ["Light", scene.continuity.lighting],
                    ["From", scene.continuity.previousEnd],
                    ["Ends", scene.endFrame],
                    ["Next must begin", scene.continuity.nextStart],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt className="text-subtle">{label}</dt>
                    <dd className="text-fg">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <h2 className="font-display text-xl font-medium">Director</h2>
            <p className="text-sm text-fg">{project.character.name}</p>
            <p className="text-sm text-muted">{project.character.appearance.join(", ")}</p>
            <p className="text-sm text-muted">
              {project.visual.environment}. {project.visual.lighting}. {project.visual.camera}.
            </p>
            <p className="text-sm text-fg">{project.arc.beginning}</p>
            <p className="text-sm text-muted">{project.arc.middle}</p>
            <p className="text-sm text-muted">{project.arc.end}</p>
          </div>

          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <h2 className="font-display text-xl font-medium">Quality</h2>
            <ul className="flex flex-col gap-2">
              {checks.map((check) => (
                <li key={check.label} className="text-sm">
                  <p className="text-fg">
                    {check.pass ? "Pass" : "Fix"} · {check.label}
                  </p>
                  <p className="text-muted">{check.detail}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <h2 className="font-display text-xl font-medium">Provider router</h2>
            <p className="text-sm text-muted">Local is the brain unless you pick another. Picking one does not send anything.</p>
            {PROVIDER_LANES.map((row) => (
              <div key={row.lane} className="flex flex-col gap-2">
                <p className="text-sm text-fg">{row.title}</p>
                <div className="flex flex-wrap gap-2">
                  {row.options.map((option) => (
                    <Button
                      key={option.id}
                      variant={route[row.lane] === option.id ? "primary" : "ghost"}
                      onClick={() => setLane(row.lane, option.id)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
            <p className="text-sm text-muted">No generation jobs are queued. The player already has local frames.</p>
            <div className="flex flex-wrap gap-2">
              {PROVIDER_LANES.map((row) => {
                const job = cloudJob(route, row.lane);
                if (!job) return null;
                return (
                  <Button key={row.lane} onClick={() => setConsent(row.lane)}>
                    Ask {job.name}
                  </Button>
                );
              })}
            </div>
            {consent && cloudJob(route, consent) ? (
              <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4" role="dialog" aria-label="Cloud creation">
                <h3 className="text-sm font-medium">{cloudJob(route, consent)?.name}</h3>
                <p className="text-sm text-muted">This operation will send: {cloudJob(route, consent)?.sends.join(", ")}.</p>
                <p className="text-sm text-muted">The provider is not connected, so Continue still sends nothing.</p>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => setConsent(null)}>Cancel</Button>
                  <Button variant="primary" onClick={() => allowCloud(consent)}>
                    Continue — Send to {cloudJob(route, consent)?.name}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <h2 className="font-display text-xl font-medium">Network audit</h2>
            {audit.length === 0 ? (
              <p className="text-sm text-muted">No cloud call yet. Planning and playback do not leave this device.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {audit.map((row) => (
                  <li key={row.id} className="text-sm">
                    <p className="text-fg">
                      {row.sent ? "Sent" : "Not sent"} · {row.lane}
                    </p>
                    <p className="text-muted">{row.detail}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <h2 className="font-display text-xl font-medium">Publishing manager</h2>
            {project.publishRequested ? (
              <p className="text-sm text-fg">The brief asked to post. That is not permission.</p>
            ) : null}
            <p className="text-sm text-muted">Nothing posts from this page. Publish only unlocks an official handoff.</p>
            <div className="flex flex-wrap gap-2">
              {(["instagram", "facebook", "youtube"] as Platform[]).map((platform) => (
                <Button
                  key={platform}
                  variant={project.platforms.includes(platform) ? "primary" : "ghost"}
                  onClick={() => togglePlatform(platform)}
                  aria-pressed={project.platforms.includes(platform)}
                >
                  {platform === "youtube" ? "YouTube" : platform.charAt(0).toUpperCase() + platform.slice(1)}
                </Button>
              ))}
            </div>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">Caption</span>
              <textarea
                value={project.caption}
                rows={2}
                onChange={(event) => {
                  setPublishStep("ready");
                  setProject((prev) => ({ ...prev, caption: event.target.value.slice(0, 220) }));
                }}
                className="rounded-lg border border-line bg-surface px-3 py-3 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              />
            </label>
            <div className="flex gap-2">
              <Button variant={project.privacy === "public" ? "primary" : "ghost"} onClick={() => setProject((prev) => ({ ...prev, privacy: "public" }))}>
                Public
              </Button>
              <Button
                variant={project.privacy === "unlisted" ? "primary" : "ghost"}
                onClick={() => setProject((prev) => ({ ...prev, privacy: "unlisted" }))}
              >
                Unlisted
              </Button>
            </div>
            <p className="text-sm text-muted">{project.hashtags.map((tag) => `#${tag}`).join(" ")}</p>
            <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
              <h3 className="text-sm font-medium">Video ready</h3>
              <p className="text-sm text-fg">
                {project.title} · {clock(project.durationSec)}
              </p>
              <ul className="flex flex-col gap-1">
                {publishTargets(project.platforms).map((target) => (
                  <li key={target.platform} className="text-sm text-muted">
                    {target.label}: Ready for handoff
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => {
                    clockRef.current = 0;
                    setClockSec(0);
                    setPlaying(true);
                  }}
                >
                  Preview
                </Button>
                <Button onClick={() => setPublishStep("ready")}>Edit</Button>
                <Button variant="primary" onClick={() => setPublishStep("confirm")}>
                  Publish
                </Button>
              </div>
            </div>
            {publishStep === "confirm" ? (
              <div className="flex flex-col gap-3 rounded-xl border border-line p-4" role="dialog" aria-label="Confirm publish">
                <h3 className="text-sm font-medium">Confirm handoff</h3>
                <ul className="flex flex-col gap-2">
                  {publishTargets(project.platforms).map((target) => (
                    <li key={target.platform} className="text-sm text-muted">
                      {target.label}. {target.reason}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => setPublishStep("ready")}>Cancel</Button>
                  <Button
                    variant="primary"
                    onClick={() => {
                      setPublishStep("handoff");
                      log("Publish", "Not posted. Handoff unlocked. No publishing API was called.", false);
                    }}
                  >
                    Confirm handoff
                  </Button>
                </div>
              </div>
            ) : null}
            {publishStep === "handoff" ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-fg">Not posted.</p>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void copyPack()}>{copied ? "Copied" : "Copy pack"}</Button>
                  {publishTargets(project.platforms).map((target) =>
                    target.href ? (
                      <Button key={target.platform} onClick={() => window.open(target.href, "_blank", "noopener,noreferrer")}>
                        Open {target.label}
                      </Button>
                    ) : (
                      <p key={target.platform} className="text-sm text-muted">
                        {target.label}: download the master, then post it in the official app.
                      </p>
                    ),
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </main>
  );
}
