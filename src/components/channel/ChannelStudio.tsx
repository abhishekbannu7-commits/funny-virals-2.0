import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { speakFree } from "@/lib/assistant/local";
import {
  blocked,
  handoffHref,
  loadChannels,
  planChannel,
  produceEpisode,
  reviewEpisode,
  saveChannels,
  type Channel,
  type Episode,
} from "@/lib/channel/plan";

const SAMPLE = "Create a faceless channel for realistic 8-10 minute scary stories. Plan the first 10 episodes, make episode 1, and prepare it for YouTube.";

export function ChannelStudio({ brief, onBack }: { brief: string; onBack: () => void }) {
  const [channels, setChannels] = useState<Channel[]>(() => loadChannels());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [episodeNo, setEpisodeNo] = useState(1);
  const [draft, setDraft] = useState(brief.trim() ? brief : SAMPLE);
  const [confirm, setConfirm] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [notice, setNotice] = useState("");
  const applied = useRef("");
  const channelsRef = useRef(channels);
  channelsRef.current = channels;

  function commit(next: Channel[]) {
    const trimmed = next.slice(0, 8);
    channelsRef.current = trimmed;
    setChannels(trimmed);
    saveChannels(trimmed);
  }

  useEffect(() => {
    const text = brief.trim();
    if (!text || applied.current === text) return;
    applied.current = text;
    const list = channelsRef.current;
    const publish = text.match(/publish(?:\s+\w+){0,6}\s+episode\s+(\d+)/i);
    const make = text.match(/(?:make|produce|render|build)\s+episode\s+(\d+)/i);
    if ((publish || make) && list[0]) {
      const n = Number((publish ?? make)?.[1]);
      const updated = make ? produceEpisode(list[0], n) : list[0];
      commit(list.map((item, index) => (index === 0 ? updated : item)));
      setActiveId(updated.id);
      setEpisodeNo(n);
      setConfirm(false);
      setUnlocked(false);
      setNotice(publish ? "Publish waits for the confirm button. Nothing is posted from the sentence." : "");
      return;
    }
    if (/\b(?:create|plan|build|start|make|launch)\b/i.test(text) && /\b(?:channel|faceless|series)\b/i.test(text)) {
      const channel = planChannel(text);
      commit([channel, ...list]);
      setActiveId(channel.id);
      setEpisodeNo(1);
      setConfirm(false);
      setUnlocked(false);
      setNotice("");
    }
  }, [brief]);

  const active = channels.find((item) => item.id === activeId) ?? null;
  const episode = active?.episodes.find((item) => item.number === episodeNo) ?? active?.episodes[0] ?? null;

  function plan() {
    const channel = planChannel(draft);
    commit([channel, ...channelsRef.current]);
    setActiveId(channel.id);
    setEpisodeNo(1);
    setConfirm(false);
    setUnlocked(false);
    setNotice("");
  }

  function patch(next: Channel) {
    commit(channels.map((item) => (item.id === next.id ? next : item)));
  }

  function make(channel: Channel, number: number) {
    const next = produceEpisode(channel, number);
    patch(next);
    setEpisodeNo(number);
    setUnlocked(false);
    setConfirm(false);
  }

  function markSources(channel: Channel, current: Episode) {
    const updated: Episode = { ...current, sourcesReviewed: true };
    updated.checks = reviewEpisode(channel, updated);
    patch({ ...channel, episodes: channel.episodes.map((item) => (item.number === current.number ? updated : item)) });
  }

  function confirmHandoff(channel: Channel, current: Episode) {
    if (blocked(current)) return;
    const updated: Episode = { ...current, status: "handoff" };
    patch({
      ...channel,
      episodes: channel.episodes.map((item) => (item.number === current.number ? updated : item)),
      handoffs: [...channel.handoffs, { episode: current.number, at: new Date().toISOString() }],
    });
    setConfirm(false);
    setUnlocked(true);
  }

  const queue = channels.flatMap((channel) =>
    channel.episodes
      .filter((item) => item.status !== "idea")
      .map((item) => ({ channel: channel.name, episode: item })),
  );

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col gap-6 px-4 py-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-widest text-muted uppercase">Faceless</p>
          <h1 className="font-display text-3xl leading-tight font-medium">Channel studio</h1>
        </div>
        <Button onClick={onBack}>Back</Button>
      </header>
      <p className="text-sm text-muted">
        One idea becomes a series on this device: brand, episodes, script, scenes, narration, captions, and metadata. Cloud video stays off. Publish never posts.
      </p>

      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          plan();
        }}
      >
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">Channel idea</span>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={4}
            className="min-h-28 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
        </label>
        <Button type="submit" variant="primary">
          Plan channel
        </Button>
      </form>

      {notice ? <p className="text-sm text-fg">{notice}</p> : null}

      {channels.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Channels</h2>
          <div className="flex flex-wrap gap-2">
            {channels.map((channel) => (
              <Button key={channel.id} onClick={() => { setActiveId(channel.id); setEpisodeNo(1); setUnlocked(false); setConfirm(false); }}>
                {channel.name}
              </Button>
            ))}
          </div>
        </section>
      ) : (
        <p className="text-sm text-muted">No series yet. Plan one, or ask Zoro to create a faceless channel.</p>
      )}

      {queue.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Queue</h2>
          <ul className="flex flex-col rounded-xl border border-line bg-surface">
            {queue.slice(0, 8).map((row) => (
              <li key={`${row.channel}-${row.episode.number}`} className="border-b border-line px-4 py-3 text-sm last:border-b-0">
                <span className="text-fg">{row.channel}</span>
                <span className="text-muted"> · Episode {String(row.episode.number).padStart(2, "0")} · {row.episode.status}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {active && episode ? (
        <ChannelBody
          channel={active}
          episode={episode}
          confirm={confirm}
          unlocked={unlocked}
          onMode={(mode) => patch({ ...active, mode })}
          onPick={(number) => { setEpisodeNo(number); setUnlocked(false); setConfirm(false); }}
          onMake={() => make(active, episode.number)}
          onSources={() => markSources(active, episode)}
          onSpeak={() => speakFree(episode.scenes[0]?.narration || episode.premise, false)}
          onPublish={() => { setConfirm(true); setUnlocked(false); }}
          onCancel={() => setConfirm(false)}
          onConfirm={() => confirmHandoff(active, episode)}
        />
      ) : null}
    </main>
  );
}

function ChannelBody({
  channel,
  episode,
  confirm,
  unlocked,
  onMode,
  onPick,
  onMake,
  onSources,
  onSpeak,
  onPublish,
  onCancel,
  onConfirm,
}: {
  channel: Channel;
  episode: Episode;
  confirm: boolean;
  unlocked: boolean;
  onMode: (mode: Channel["mode"]) => void;
  onPick: (number: number) => void;
  onMake: () => void;
  onSources: () => void;
  onSpeak: () => void;
  onPublish: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const thumb = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = thumb.current;
    if (!canvas || !episode.thumbnail) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#0c0c0b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#d5e4ee";
    ctx.fillRect(0, canvas.height - 8, canvas.width, 8);
    ctx.fillStyle = "#f3f1ea";
    ctx.font = "600 28px Fraunces, serif";
    ctx.fillText(channel.name, 24, 64);
    ctx.font = "500 18px Outfit, sans-serif";
    ctx.fillStyle = "#9a968c";
    const title = episode.title.length > 42 ? `${episode.title.slice(0, 41)}…` : episode.title;
    ctx.fillText(title, 24, 104);
  }, [channel.name, episode.thumbnail, episode.title]);

  const href = handoffHref(channel.format);
  const needsSources = (channel.niche === "medical" || channel.niche === "true-crime") && !episode.sourcesReviewed;

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-2xl font-medium">{channel.name}</h2>
        <p className="text-sm text-muted">{channel.concept}</p>
        <p className="mt-2 text-sm text-muted">{channel.note}</p>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-muted">Niche</dt>
          <dd>{channel.niche}</dd>
        </div>
        <div>
          <dt className="text-muted">Format</dt>
          <dd>{channel.format} · {channel.visual.aspect}</dd>
        </div>
        <div>
          <dt className="text-muted">Look</dt>
          <dd>{channel.visual.style}</dd>
        </div>
        <div>
          <dt className="text-muted">Voice</dt>
          <dd>{channel.audio.narrator}</dd>
        </div>
      </dl>
      <p className="text-sm">{channel.brand.intro} {channel.brand.outro}</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => onMode(channel.mode === "assisted" ? "autonomous" : "assisted")} aria-pressed={channel.mode === "autonomous"}>
          {channel.mode === "assisted" ? "Assisted mode" : "Autonomous mode"}
        </Button>
      </div>
      <p className="text-sm text-muted">
        {channel.mode === "assisted"
          ? "Assisted: you preview, then you confirm. Confirm does not upload."
          : `Autonomous still cannot upload. Cap ${channel.uploadsPerDay} handoffs a day. Medical and unverified crime stay blocked until you mark sources. Cloud spend stays at zero.`}
      </p>
      <div className="flex flex-wrap gap-2">
        {channel.episodes.map((item) => (
          <Button key={item.number} onClick={() => onPick(item.number)}>
            {String(item.number).padStart(2, "0")}
          </Button>
        ))}
      </div>
      <article className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
        <p className="text-xs font-medium tracking-widest text-muted uppercase">Episode {String(episode.number).padStart(2, "0")}</p>
        <h3 className="font-display text-xl font-medium">{episode.title}</h3>
        <p className="text-sm text-muted">{episode.premise}</p>
        {episode.status === "idea" ? (
          <Button variant="primary" onClick={onMake}>
            Make episode {episode.number}
          </Button>
        ) : (
          <>
            <canvas ref={thumb} width={640} height={360} className="h-auto w-full rounded-md border border-line" />
            <p className="text-sm">{episode.thumbnail}</p>
            <h4 className="text-sm font-medium">Scenes</h4>
            <ol className="flex flex-col gap-3">
              {episode.scenes.map((scene) => (
                <li key={scene.index} className="text-sm">
                  <p className="text-fg">{scene.title}</p>
                  <p className="text-muted">{scene.narration}</p>
                  <p className="text-muted">{scene.visual} Ends with {scene.endFrame}. {scene.sfx}.</p>
                </li>
              ))}
            </ol>
            <p className="text-sm text-muted">{episode.description}</p>
            <p className="text-sm text-muted">{episode.tags.join(" · ")}</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={onSpeak}>Play narration</Button>
              {needsSources ? <Button onClick={onSources}>Mark sources reviewed</Button> : null}
              <Button variant="primary" onClick={onPublish} disabled={blocked(episode)}>
                Publish
              </Button>
            </div>
          </>
        )}
        {episode.checks.length ? (
          <ul className="flex flex-col gap-2">
            {episode.checks.map((check) => (
              <li key={check.name} className="text-sm">
                <span className="text-fg">{check.name}. {check.pass ? "Pass." : check.blocks ? "Blocked." : "Note."}</span>{" "}
                <span className="text-muted">{check.detail}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {confirm ? (
          <div className="flex flex-col gap-3 rounded-md border border-line p-3">
            <p className="text-sm">
              This does not upload. It unlocks the official {channel.format.startsWith("youtube") ? "YouTube" : "platform"} handoff for episode {episode.number}. You still post it yourself.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={onCancel}>Cancel</Button>
              <Button variant="primary" onClick={onConfirm}>Confirm handoff</Button>
            </div>
          </div>
        ) : null}
        {unlocked ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm">Not posted. Handoff unlocked. No publishing API was called.</p>
            {href ? (
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm text-fg underline">
                Open the upload page
              </a>
            ) : (
              <p className="text-sm text-muted">Instagram has no upload link here. Download is not a silent post. Use the Instagram app yourself.</p>
            )}
          </div>
        ) : null}
      </article>
    </section>
  );
}
