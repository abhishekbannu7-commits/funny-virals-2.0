import { useState } from "react";
import { Button } from "@/components/ui/button";
import { inspectTexts, type InspectReport } from "@/lib/code/inspect";

const CAP = 200_000;

async function readChosen(list: FileList | null) {
  const files = [...(list ?? [])].slice(0, 40);
  const rows: { name: string; text: string }[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    const name = file.webkitRelativePath || file.name;
    if (file.size > CAP) {
      skipped.push(`${name} (over 200 KB)`);
      continue;
    }
    rows.push({ name, text: await file.text() });
  }
  const report = inspectTexts(rows);
  report.skipped.push(...skipped);
  return report;
}

export function InspectDesk({ onBack }: { onBack: () => void }) {
  const [report, setReport] = useState<InspectReport | null>(null);
  const [query, setQuery] = useState("");
  const [reading, setReading] = useState(false);
  const [note, setNote] = useState("No files read. Nothing has left this device.");

  async function take(list: FileList | null) {
    setReading(true);
    try {
      const next = await readChosen(list);
      setReport(next);
      setNote(`Read ${next.files.length} files, ${next.bytes} characters, on this device. Sent 0 bytes. No app was opened. No compiler ran.`);
    } finally {
      setReading(false);
    }
  }

  const q = query.trim().toLowerCase();
  const files = report?.files.filter((file) => !q || file.name.toLowerCase().includes(q)) ?? [];
  const findings = report?.findings.filter((item) => !q || `${item.file} ${item.detail}`.toLowerCase().includes(q)) ?? [];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col gap-6 px-4 py-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-widest text-muted uppercase">Local</p>
          <h1 className="font-display text-3xl leading-tight font-medium">Inspect</h1>
        </div>
        <Button onClick={onBack}>Back</Button>
      </header>
      <p className="text-sm text-muted">
        Phase 1 reads files you pick. This page cannot open other apps, run Gradle, use a terminal, or see a folder you did not select. Android does not give a website those controls.
      </p>
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-line bg-surface-2 px-4 text-sm font-medium">
          Choose files
          <input
            className="sr-only"
            type="file"
            multiple
            onChange={(event) => {
              void take(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-line bg-surface-2 px-4 text-sm font-medium">
          Choose folder
          <input
            className="sr-only"
            type="file"
            multiple
            ref={(node) => {
              if (node) node.setAttribute("webkitdirectory", "");
            }}
            onChange={(event) => {
              void take(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
      </div>
      <p className="text-sm">{reading ? "Reading on this device." : note}</p>
      {report ? (
        <>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">Search these files</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="rounded-lg border border-line bg-surface px-3 py-3 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
          </label>
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">Files</h2>
            <ul className="flex flex-col rounded-xl border border-line bg-surface">
              {files.length ? (
                files.map((file) => (
                  <li key={file.name} className="border-b border-line px-4 py-3 text-sm last:border-b-0">
                    <span className="text-fg">{file.name}</span>
                    <span className="text-muted"> · {file.lines} lines</span>
                  </li>
                ))
              ) : (
                <li className="px-4 py-3 text-sm text-muted">No text files in that pick.</li>
              )}
            </ul>
          </section>
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">Notes</h2>
            <ul className="flex flex-col rounded-xl border border-line bg-surface">
              {findings.length ? (
                findings.map((item, index) => (
                  <li key={`${item.file}-${item.line}-${index}`} className="border-b border-line px-4 py-3 text-sm last:border-b-0">
                    <span className="text-fg">{item.kind}</span>
                    <span className="text-muted"> · {item.file}:{item.line} · {item.detail}</span>
                  </li>
                ))
              ) : (
                <li className="px-4 py-3 text-sm text-muted">No secret-like lines, debugger statements, empty catches, or TODO marks in the text that was read. This is not a build or a test run.</li>
              )}
            </ul>
            {report.skipped.length ? <p className="text-sm text-muted">Skipped: {report.skipped.slice(0, 8).join(", ")}</p> : null}
          </section>
          <p className="text-sm text-muted">Network: offline. Provider: none. Data sent: 0 bytes.</p>
        </>
      ) : null}
    </main>
  );
}
