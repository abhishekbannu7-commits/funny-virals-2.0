import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AudioLines,
  Bell,
  Check,
  ImageIcon,
  Link2,
  Mail,
  MapPin,
  MessageSquare,
  MessagesSquare,
  Mic,
  PenLine,
  Phone,
  Send,
  Smartphone,
  Sparkles,
  Square,
  Youtube,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { detectDevice, handoffHref, type DeviceKind } from "@/lib/assistant/device";
import { cardFromPlan, makeLinkCode, normalizeCode, parseWireJob, planToWire, type Card, type WireJob } from "@/lib/assistant/jobs";
import { applyLocal, ding, reminderLine, senseDevice, speakFree } from "@/lib/assistant/local";
import { offlineMiss } from "@/lib/assistant/engines";
import { CAPABILITIES, loadCloudOptIn, saveCloudOptIn } from "@/lib/assistant/policy";
import { emptyVault, loadVault, saveVault, type Reminder, type Vault } from "@/lib/assistant/vault";
import { useP2PRoom, type PeerInfo } from "@/lib/multiplayer";
import { askAide, generateStill, type AidePlan } from "@/lib/studio/server";
import { Studio } from "@/components/studio/Studio";
import { CreativeStudio } from "@/components/creative/CreativeStudio";

type Rec = {
  lang: string;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

type Turn = { who: "you" | "orin"; text: string };

type InstallPrompt = Event & { prompt: () => Promise<void> };

const LINK_KEY = "orin-link";

const APPS: { label: string; target: NonNullable<AidePlan["target"]>; icon: typeof Phone }[] = [
  { label: "ChatGPT", target: "chatgpt", icon: Sparkles },
  { label: "Claude", target: "claude", icon: PenLine },
  { label: "WhatsApp", target: "whatsapp", icon: MessagesSquare },
  { label: "Maps", target: "maps", icon: MapPin },
  { label: "YouTube", target: "youtube", icon: Youtube },
  { label: "Instagram", target: "instagram", icon: ImageIcon },
  { label: "Mail", target: "mail", icon: Mail },
];

function recognition(): Rec | null {
  const root = window as Window & {
    SpeechRecognition?: new () => Rec;
    webkitSpeechRecognition?: new () => Rec;
  };
  const Ctor = root.SpeechRecognition ?? root.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

function remain(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function peerLabel(name: string) {
  if (name.startsWith("hands-phone")) return "your phone";
  if (name.startsWith("hands-tablet")) return "your tablet";
  if (name.startsWith("desk")) return "your other screen";
  return "another Orin";
}

function linkStatus(joined: boolean, peers: PeerInfo[]) {
  if (!joined) return "Connecting the link…";
  const live = peers.filter((peer) => peer.connectionState === "connected");
  if (live.length) return `Linked to ${live.map((peer) => peerLabel(peer.name)).join(", ")}.`;
  if (peers.some((peer) => peer.connectionState === "failed")) {
    return "This network blocked the link. Keep Orin open on the phone and confirm there.";
  }
  if (peers.length) return "Reaching the other screen…";
  return "Waiting. Open Orin on the other device and enter this code.";
}

function externalLink(href: string) {
  return href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {};
}

function LinkBridge({
  code,
  device,
  onStatus,
  onJob,
  senderRef,
}: {
  code: string;
  device: DeviceKind;
  onStatus: (joined: boolean, peers: PeerInfo[]) => void;
  onJob: (job: WireJob) => void;
  senderRef: { current: ((job: WireJob) => boolean) | null };
}) {
  const role = device === "desktop" ? "desk" : "hands";
  const p2p = useP2PRoom({ room: `orin-${code}`, name: `${role}-${device}` });
  const onJobRef = useRef(onJob);
  onJobRef.current = onJob;

  useEffect(() => {
    onStatus(p2p.joined, p2p.peers);
  }, [onStatus, p2p.joined, p2p.peers]);

  useEffect(
    () =>
      p2p.onMessage((_from, data) => {
        const job = parseWireJob(data);
        if (job) onJobRef.current(job);
      }),
    [p2p.onMessage],
  );

  useEffect(() => {
    senderRef.current = (job) => {
      const live = p2p.peers.some((peer) => peer.connectionState === "connected");
      if (!live) return false;
      p2p.send(job);
      return true;
    };
    return () => {
      senderRef.current = null;
    };
  }, [p2p, senderRef]);

  return null;
}

function ActionCard({
  card,
  title,
  copied,
  onCopy,
  onShareImage,
}: {
  card: Card;
  title: string;
  copied: boolean;
  onCopy: (text: string) => void;
  onShareImage: (url: string) => void;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2 text-muted">
        <AudioLines className="size-4" />
        <h2 className="text-sm font-medium text-fg">{title}</h2>
      </div>
      <p className="font-display text-xl leading-snug font-medium">{card.say}</p>
      {card.detail ? <p className="text-sm whitespace-pre-wrap text-muted">{card.detail}</p> : null}
      {card.note ? <p className="text-sm text-fg">{card.note}</p> : null}
      {card.imageUrl ? <img src={card.imageUrl} alt="Generated by Orin" className="w-full rounded-lg" /> : null}
      <div className="flex flex-wrap gap-2">
        {card.href && card.hrefLabel ? (
          <a
            href={card.href}
            {...externalLink(card.href)}
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg"
          >
            {card.href.startsWith("tel:") ? <Phone className="size-4" /> : <Send className="size-4" />}
            {card.hrefLabel}
          </a>
        ) : null}
        {card.copy ? <Button onClick={() => onCopy(card.copy!)}>{copied ? "Copied" : "Copy"}</Button> : null}
        {card.imageUrl ? (
          <Button onClick={() => onShareImage(card.imageUrl!)}>
            <ImageIcon className="size-4" />
            Share image
          </Button>
        ) : null}
      </div>
    </section>
  );
}

export function Orin() {
  const [command, setCommand] = useState("");
  const [listening, setListening] = useState(false);
  const [keep, setKeep] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [incoming, setIncoming] = useState<Card | null>(null);
  const [desk, setDesk] = useState<null | "create" | "shots">(null);
  const [brief, setBrief] = useState("");
  const [device, setDevice] = useState<DeviceKind | null>(null);
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [joinDraft, setJoinDraft] = useState("");
  const [linkJoined, setLinkJoined] = useState(false);
  const [linkPeers, setLinkPeers] = useState<PeerInfo[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [vault, setVault] = useState<Vault>(emptyVault);
  const [tick, setTick] = useState(0);
  const [contacts, setContacts] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const [cloudOn, setCloudOn] = useState(false);
  const [cloudAsk, setCloudAsk] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const recRef = useRef<Rec | null>(null);
  const keepRef = useRef(false);
  const stopWanted = useRef(false);
  const commandRef = useRef<HTMLTextAreaElement>(null);
  const senderRef = useRef<((job: WireJob) => boolean) | null>(null);
  const seenJobs = useRef(new Set<string>());
  const installRef = useRef<InstallPrompt | null>(null);
  const turnsRef = useRef<Turn[]>([]);
  const vaultRef = useRef<Vault>(emptyVault());
  const quietRef = useRef(false);
  const cloudRef = useRef(false);
  turnsRef.current = turns;
  quietRef.current = vault.quiet;

  const onStatus = useCallback((joined: boolean, peers: PeerInfo[]) => {
    setLinkJoined(joined);
    setLinkPeers(peers);
  }, []);

  const onJob = useCallback((job: WireJob) => {
    if (seenJobs.current.has(job.id)) return;
    seenJobs.current.add(job.id);
    setIncoming(cardFromPlan(job, job.imageUrl));
    setError(null);
    navigator.vibrate?.(40);
    speakFree(job.say, quietRef.current);
  }, []);

  useEffect(() => {
    const kind = detectDevice();
    setDevice(kind);
    const fromUrl = normalizeCode(new URLSearchParams(window.location.search).get("link") ?? "");
    const saved = normalizeCode(sessionStorage.getItem(LINK_KEY) ?? "");
    const next = fromUrl.length === 6 ? fromUrl : saved.length === 6 ? saved : null;
    if (next) setCode(next);
    const loaded = loadVault();
    vaultRef.current = loaded;
    setVault(loaded);
    const opted = loadCloudOptIn();
    cloudRef.current = opted;
    setCloudOn(opted);
    setContacts("contacts" in navigator);
    const ios = /iPhone|iPad/i.test(navigator.userAgent);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIosHint(ios && !standalone);
    const onPrompt = (event: Event) => {
      event.preventDefault();
      installRef.current = event as InstallPrompt;
      setCanInstall(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  useEffect(() => {
    if (!vault.reminders.some((item) => !item.fired)) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      setTick(now);
      const due = vaultRef.current.reminders.filter((item) => !item.fired && item.at <= now);
      if (!due.length) return;
      const ids = new Set(due.map((item) => item.id));
      const next: Vault = {
        ...vaultRef.current,
        reminders: vaultRef.current.reminders.map((item) => (ids.has(item.id) ? { ...item, fired: true } : item)),
      };
      vaultRef.current = next;
      setVault(next);
      saveVault(next);
      const line = reminderLine(due[due.length - 1].text);
      ding();
      speakFree(line, next.quiet);
      setCard({ say: line });
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        for (const item of due) {
          try {
            new Notification("Orin", { body: reminderLine(item.text) });
          } catch {
            /* an embedded preview can refuse notifications */
          }
        }
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [vault.reminders]);

  function rememberCode(next: string) {
    setCode(next);
    sessionStorage.setItem(LINK_KEY, next);
    const url = new URL(window.location.href);
    url.searchParams.set("link", next);
    window.history.replaceState({}, "", url);
  }

  function endLink() {
    setCode(null);
    setLinkJoined(false);
    setLinkPeers([]);
    sessionStorage.removeItem(LINK_KEY);
    const url = new URL(window.location.href);
    url.searchParams.delete("link");
    window.history.replaceState({}, "", url);
  }

  function commit(next: Vault) {
    vaultRef.current = next;
    quietRef.current = next.quiet;
    setVault(next);
    saveVault(next);
  }

  function toggleTask(id: string) {
    commit({
      ...vaultRef.current,
      tasks: vaultRef.current.tasks.map((task) => (task.id === id ? { ...task, done: !task.done } : task)),
    });
  }

  function cancelReminder(id: string) {
    commit({
      ...vaultRef.current,
      reminders: vaultRef.current.reminders.filter((item) => item.id !== id),
    });
  }

  function pushTurn(who: Turn["who"], text: string) {
    setTurns((prev) => [...prev, { who, text: text.slice(0, 400) }].slice(-8));
  }

  function setCloud(on: boolean) {
    cloudRef.current = on;
    setCloudOn(on);
    saveCloudOptIn(on);
  }

  async function applyPlan(plan: AidePlan) {
    if (plan.action === "studio") {
      setPendingImage(null);
      setCard({ say: plan.say });
      pushTurn("orin", plan.say);
      speakFree(plan.say, quietRef.current);
      if (/shot desk/i.test(plan.say)) setDesk("shots");
      else {
        setBrief(plan.prompt ?? "");
        setDesk("create");
      }
      return;
    }
    if (plan.action === "image" && plan.imagePrompt) {
      setPendingImage(plan.imagePrompt);
      setCard({
        say: plan.say,
        detail: plan.imagePrompt,
        note: "Not made yet. Optional cloud image uses xAI and may spend quota.",
      });
      pushTurn("orin", plan.say);
      speakFree(plan.say, quietRef.current);
      return;
    }
    setPendingImage(null);
    const wire = planToWire(plan);
    const pushed = senderRef.current?.(wire) ?? false;
    const next = cardFromPlan(plan);
    const handsJob = plan.action === "call" || plan.action === "message";
    if (pushed && device === "desktop" && handsJob) {
      next.href = undefined;
      next.hrefLabel = undefined;
      next.note = "Waiting on your phone or tablet. Tap there. Nothing is sent until you do.";
    } else if (!pushed && device === "desktop" && handsJob) {
      next.note = "Link a phone with the code below if this screen cannot dial. You still confirm with a tap.";
    } else if (pushed) {
      next.note = "Also sent to the linked device. Confirm on whichever screen you are holding.";
    }
    setCard(next);
    pushTurn("orin", plan.say);
    speakFree(pushed && device === "desktop" && handsJob ? "It's on your phone. Tap to confirm." : plan.say, quietRef.current);
  }

  async function run(text: string) {
    const commandText = text.trim();
    if (commandText.length < 2) return;
    setError(null);
    setCopied(false);
    pushTurn("you", commandText);
    try {
      const sensed = await senseDevice(commandText);
      if (sensed) {
        setCloudAsk(null);
        await applyPlan(sensed);
        return;
      }
      const local = applyLocal(commandText, vaultRef.current);
      if (local) {
        setCloudAsk(null);
        commit(local.vault);
        if (local.notify && typeof Notification !== "undefined" && Notification.permission === "default") {
          void Notification.requestPermission();
        }
        await applyPlan(local.plan);
        return;
      }
      const miss = offlineMiss(commandText);
      setCloudAsk(miss.offerCloud ? commandText : null);
      await applyPlan(miss.plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Orin couldn't do that.");
    } finally {
      setBusy(null);
    }
  }

  async function askCloud() {
    const commandText = cloudAsk;
    if (!commandText || !cloudRef.current) return;
    setError(null);
    setBusy("Asking xAI");
    try {
      const history = turnsRef.current.slice(-6).filter((turn) => turn.text.trim());
      const result = await askAide({ data: { command: commandText, history } });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCloudAsk(null);
      await applyPlan(result.plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Optional cloud didn't answer.");
    } finally {
      setBusy(null);
    }
  }

  async function makePicture() {
    const prompt = pendingImage;
    if (!prompt || !cloudRef.current) return;
    setError(null);
    setBusy("Optional cloud image");
    try {
      const image = await generateStill({ data: { prompt } });
      if (!image.ok) {
        setError(image.error);
        return;
      }
      setPendingImage(null);
      setCard({
        say: "Picture is ready.",
        imageUrl: image.url,
        note: "Made with optional cloud (xAI). It may have used quota.",
      });
      pushTurn("orin", "Picture is ready.");
      speakFree("Picture is ready.", quietRef.current);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The picture didn't come back.");
    } finally {
      setBusy(null);
    }
  }

  function startRec() {
    const rec = recognition();
    if (!rec) {
      setError("This browser has no speech recognition. Type the command instead.");
      setKeep(false);
      keepRef.current = false;
      return;
    }
    setError(null);
    setListening(true);
    rec.lang = "en-US";
    rec.continuous = keepRef.current;
    rec.onresult = (event) => {
      const last = event.results[event.results.length - 1]?.[0]?.transcript ?? "";
      if (!last.trim()) return;
      setCommand(last);
      if (!keepRef.current) setListening(false);
      void run(last);
    };
    rec.onerror = () => {
      setListening(false);
      if (!keepRef.current) setError("I didn't hear that. Try again, or type it.");
    };
    rec.onend = () => {
      setListening(false);
      if (keepRef.current && !stopWanted.current) window.setTimeout(() => startRec(), 350);
    };
    recRef.current = rec;
    try {
      rec.start();
    } catch {
      setListening(false);
      setError("The microphone didn't start.");
    }
  }

  function toggleListen() {
    if (listening) {
      stopWanted.current = true;
      keepRef.current = false;
      setKeep(false);
      recRef.current?.stop();
      setListening(false);
      return;
    }
    stopWanted.current = false;
    startRec();
  }

  function toggleKeep() {
    const next = !keep;
    setKeep(next);
    keepRef.current = next;
    stopWanted.current = false;
    if (next && !listening) startRec();
    if (!next) recRef.current?.stop();
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setError("Copy was blocked. Select the text and copy it yourself.");
    }
  }

  async function shareImage(url: string) {
    try {
      const fileRes = await fetch(url);
      const blob = await fileRes.blob();
      const file = new File([blob], "orin.jpg", { type: blob.type || "image/jpeg" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Orin" });
        return;
      }
    } catch {
      /* fall through */
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function pickContact(kind: "call" | "text") {
    const picker = (
      navigator as Navigator & {
        contacts?: {
          select: (props: string[], opts: { multiple: boolean }) => Promise<{ name?: string[]; tel?: string[] }[]>;
        };
      }
    ).contacts;
    if (!picker?.select) {
      setCommand(kind === "call" ? "Call " : "Text ");
      commandRef.current?.focus();
      return;
    }
    try {
      const picked = await picker.select(["name", "tel"], { multiple: false });
      const tel = picked?.[0]?.tel?.[0];
      if (!tel) {
        setError("That contact has no number.");
        return;
      }
      setError(null);
      setCommand(kind === "call" ? `Call ${tel}` : `Text ${tel} `);
      commandRef.current?.focus();
    } catch {
      /* the picker was dismissed */
    }
  }

  async function install() {
    const prompt = installRef.current;
    if (!prompt) return;
    await prompt.prompt();
    setCanInstall(false);
  }

  if (desk === "shots") {
    return (
      <div>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="text-sm text-muted">Cloud shot desk</p>
          <Button onClick={() => setDesk("create")}>Back to studio</Button>
        </div>
        <Studio />
      </div>
    );
  }

  if (desk === "create") {
    return (
      <CreativeStudio
        key={brief || "sample"}
        brief={brief}
        onBack={() => setDesk(null)}
        onShotDesk={() => setDesk("shots")}
      />
    );
  }

  const linked = linkPeers.some((peer) => peer.connectionState === "connected");
  const deviceLine =
    device === "phone" || device === "tablet"
      ? `This ${device} opens the dialer, Messages, and the apps below. You confirm each one. It cannot change system settings.`
      : device === "desktop"
        ? "Link your phone or tablet. Calls and texts wait there for your tap. Optional cloud is separate."
        : "Checking this device.";

  let linkBlock: ReactNode = null;
  if (code && device) {
    linkBlock = (
      <LinkBridge code={code} device={device} onStatus={onStatus} onJob={onJob} senderRef={senderRef} />
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col gap-6 px-4 py-6">
      {linkBlock}
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-widest text-muted uppercase">Aide</p>
          <h1 className="font-display text-3xl leading-tight font-medium">Orin</h1>
        </div>
        <Button variant="primary" onClick={() => { setBrief(""); setDesk("create"); }}>
          Create
        </Button>
      </header>

      {incoming ? (
        <ActionCard
          card={incoming}
          title="On this device"
          copied={copied}
          onCopy={(text) => void copyText(text)}
          onShareImage={(url) => void shareImage(url)}
        />
      ) : null}

      <p className="text-sm text-muted">{deviceLine}</p>
      <p className="text-sm text-muted">
        Core stays on this device. Optional cloud is {cloudOn ? "on" : "off"} and never runs by itself.
      </p>

      <div className="flex flex-col items-center gap-4">
        <button
          type="button"
          className="orin-orb grid place-items-center text-fg"
          data-live={listening ? "true" : "false"}
          data-linked={linked ? "true" : "false"}
          onClick={toggleListen}
          aria-pressed={listening}
        >
          {listening ? <Square className="size-6" /> : <Mic className="size-6" />}
          <span className="sr-only">{listening ? "Stop listening" : "Listen"}</span>
        </button>
        <p className="text-sm text-muted">{listening ? "Listening" : busy ?? "Tap the circle, or type below."}</p>
        <Button onClick={toggleKeep} aria-pressed={keep}>
          {keep ? "Stop staying on" : "Stay listening"}
        </Button>
      </div>

      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void run(command);
        }}
      >
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">Command</span>
          <textarea
            ref={commandRef}
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            rows={3}
            placeholder="Add task pack a bag, or timer 5 minutes"
            className="rounded-lg border border-line bg-surface px-3 py-3 text-sm outline-none placeholder:text-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
        </label>
        <Button variant="primary" type="submit" disabled={!!busy || command.trim().length < 2}>
          <Send className="size-4" />
          Ask Orin
        </Button>
      </form>

      <div className="flex flex-wrap gap-2">
        {["Good morning", "Add task pack a bag", "Timer 5 minutes", "What is 18% of 240", "Make a reel about AI doctors"].map(
          (hint) => (
            <Button key={hint} onClick={() => setCommand(hint)}>
              {hint}
            </Button>
          ),
        )}
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {card ? (
        <ActionCard
          card={card}
          title="Orin"
          copied={copied}
          onCopy={(text) => void copyText(text)}
          onShareImage={(url) => void shareImage(url)}
        />
      ) : null}

      {cloudAsk ? (
        <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
          <h2 className="text-sm font-medium">Optional cloud</h2>
          <p className="text-sm text-muted">
            Provider: xAI. It may use quota. Nothing is sent until you tap
            {cloudOn ? "." : ", and the switch below is still off."}
          </p>
          <Button variant="primary" disabled={!cloudOn || !!busy} onClick={() => void askCloud()}>
            Ask xAI
          </Button>
        </section>
      ) : null}

      {pendingImage ? (
        <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
          <h2 className="text-sm font-medium">Optional cloud image</h2>
          <p className="text-sm text-muted">Provider: xAI. A picture may cost more than a text reply. It is not made yet.</p>
          <Button variant="primary" disabled={!cloudOn || !!busy} onClick={() => void makePicture()}>
            Make picture
          </Button>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Bell className="size-4 text-muted" />
          <h2 className="text-sm font-medium">Notebook</h2>
        </div>
        <Notebook
          tasks={vault.tasks.filter((task) => !task.done)}
          reminders={vault.reminders.filter((item) => !item.fired).sort((a, b) => a.at - b.at)}
          notes={vault.notes.length}
          facts={vault.facts.length}
          quiet={vault.quiet}
          now={tick || Date.now()}
          onDone={toggleTask}
          onCancel={cancelReminder}
        />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Link2 className="size-4 text-muted" />
          <h2 className="text-sm font-medium">Link a phone or tablet</h2>
        </div>
        <p className="text-sm text-muted">
          Open Orin on both screens and use the same code. The other device gets the call, text, or app, and you tap
          to confirm. Orin cannot reach a device that does not have this page open. Anyone with the code can see the
          next action, so keep it to your own screens.
        </p>
        {code ? (
          <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
            <p className="font-display text-4xl tracking-widest">{code}</p>
            <p className="text-sm text-muted">{linkStatus(linkJoined, linkPeers)}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  const url = new URL(window.location.href);
                  url.searchParams.set("link", code);
                  void copyText(`${code} ${url.href}`);
                }}
              >
                {copied ? "Copied" : "Copy code"}
              </Button>
              <Button onClick={endLink}>End link</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Button variant="primary" onClick={() => rememberCode(makeLinkCode())}>
              <Smartphone className="size-4" />
              Create a code
            </Button>
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const next = normalizeCode(joinDraft);
                if (next.length < 6) {
                  setError("Enter the 6-character code from the other screen.");
                  return;
                }
                setError(null);
                rememberCode(next);
              }}
            >
              <label className="sr-only" htmlFor="link-code">
                Link code
              </label>
              <input
                id="link-code"
                value={joinDraft}
                onChange={(event) => setJoinDraft(event.target.value.toUpperCase())}
                maxLength={6}
                autoCapitalize="characters"
                placeholder="Code"
                className="min-h-11 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 text-sm tracking-widest uppercase outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              />
              <Button type="submit">Join</Button>
            </form>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Where work happens</h2>
        <ul className="flex flex-col rounded-xl border border-line bg-surface">
          {CAPABILITIES.map((row) => (
            <li key={row.name} className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0">
              <div className="min-w-0">
                <p className="text-sm text-fg">{row.name}</p>
                <p className="text-sm text-muted">{row.detail}</p>
              </div>
              <p className="shrink-0 text-xs font-medium tracking-wide text-subtle uppercase">{row.net}</p>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted">
          Optional cloud uses xAI and may spend quota. It is {cloudOn ? "on" : "off"}. Turning it on does not send anything.
        </p>
        <Button onClick={() => setCloud(!cloudOn)} aria-pressed={cloudOn}>
          {cloudOn ? "Turn optional cloud off" : "Turn optional cloud on"}
        </Button>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">On this device</h2>
        <div className="grid grid-cols-3 gap-2">
          <Button className="w-full" onClick={() => void pickContact("call")}>
            <Phone className="size-4" />
            Call
          </Button>
          <Button className="w-full" onClick={() => void pickContact("text")}>
            <MessageSquare className="size-4" />
            Text
          </Button>
          {APPS.map((app) => {
            const href = handoffHref(app.target, undefined, undefined)?.href;
            const Icon = app.icon;
            if (!href) return null;
            return (
              <a
                key={app.label}
                href={href}
                {...externalLink(href)}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-line bg-surface-2 px-2 text-sm font-medium text-fg"
              >
                <Icon className="size-4 shrink-0" />
                {app.label}
              </a>
            );
          })}
        </div>
        {contacts ? <p className="text-sm text-muted">Call and Text can open this phone's contact list.</p> : null}
        {canInstall ? (
          <Button onClick={() => void install()}>Add Orin to this home screen</Button>
        ) : iosHint ? (
          <p className="text-sm text-muted">On iPhone or iPad, use Share, then Add to Home Screen, so Orin stays put.</p>
        ) : null}
      </section>

      {turns.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">Recent</h2>
          <ol className="flex flex-col gap-2">
            {turns.slice(-4).map((turn, index) => (
              <li key={`${turn.who}-${index}`} className="text-sm">
                <span className="text-subtle">{turn.who === "you" ? "You" : "Orin"}</span>
                <p className="text-fg">{turn.text}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </main>
  );
}

function Notebook({
  tasks,
  reminders,
  notes,
  facts,
  quiet,
  now,
  onDone,
  onCancel,
}: {
  tasks: { id: string; text: string }[];
  reminders: Reminder[];
  notes: number;
  facts: number;
  quiet: boolean;
  now: number;
  onDone: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <p className="text-sm text-muted">
        Saved on this device only. Timers ring while Orin is open.{quiet ? " Voice is off." : ""}
      </p>
      {reminders.length ? (
        <ul className="flex flex-col gap-2">
          {reminders.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-fg">{item.text}</p>
                <p className="font-display text-2xl leading-tight">{remain(item.at - now)}</p>
              </div>
              <Button onClick={() => onCancel(item.id)}>Cancel</Button>
            </li>
          ))}
        </ul>
      ) : null}
      {tasks.length ? (
        <ul className="flex flex-col gap-2">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center justify-between gap-3">
              <p className="min-w-0 flex-1 text-sm text-fg">{task.text}</p>
              <Button onClick={() => onDone(task.id)}>
                <Check className="size-4" />
                Done
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg">No open tasks. Try Good morning, or add a task.</p>
      )}
      <p className="text-sm text-subtle">
        {notes} {notes === 1 ? "note" : "notes"}, {facts} remembered
      </p>
    </div>
  );
}

