export type Finding = {
  file: string;
  line: number;
  kind: "secret" | "todo" | "empty-catch" | "debugger";
  detail: string;
};

export type InspectFile = { name: string; bytes: number; lines: number };

export type InspectReport = {
  files: InspectFile[];
  findings: Finding[];
  skipped: string[];
  bytes: number;
};

const TEXT = /\.(txt|md|json|ts|tsx|js|jsx|mjs|cjs|css|html|py|kt|kts|java|gradle|xml|yml|yaml|toml|rs|go|swift|sql|sh)$/i;
const SECRET = /(?:api[_-]?key|secret|password|token|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY)\s*[:=]\s*['"]?[A-Za-z0-9_\-./+=]{8,}/i;

export function isInspectCommand(text: string) {
  const t = text.trim();
  if (/^(?:inspect|review)(?: this)?(?: project| code| repo| files)?\.?$/i.test(t)) return true;
  if (/\b(?:inspect|review)\b/i.test(t) && /\b(?:project|code|repo|files|bugs?)\b/i.test(t)) return true;
  if (/^(?:find|list)(?: all)? bugs?\.?$/i.test(t)) return true;
  return false;
}

export function inspectTexts(input: { name: string; text: string }[]): InspectReport {
  const files: InspectFile[] = [];
  const findings: Finding[] = [];
  const skipped: string[] = [];
  let bytes = 0;
  const list = input.slice(0, 40);
  if (input.length > 40) skipped.push(`${input.length - 40} files over the 40-file cap`);
  for (const file of list) {
    const name = file.name.replace(/\\/g, "/").slice(-180);
    if (!TEXT.test(name) && name.includes(".")) {
      skipped.push(name);
      continue;
    }
    if (file.text.includes("\u0000")) {
      skipped.push(name);
      continue;
    }
    const text = file.text.slice(0, 200_000);
    bytes += text.length;
    const lines = text.split(/\r?\n/);
    files.push({ name, bytes: text.length, lines: lines.length });
    lines.forEach((line, index) => {
      if (findings.length > 80) return;
      if (SECRET.test(line)) {
        findings.push({ file: name, line: index + 1, kind: "secret", detail: "Looks like a secret. It was not copied out." });
      } else if (/\bdebugger\b/.test(line)) {
        findings.push({ file: name, line: index + 1, kind: "debugger", detail: "debugger statement" });
      } else if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(line)) {
        findings.push({ file: name, line: index + 1, kind: "empty-catch", detail: "Empty catch" });
      } else if (/\b(?:TODO|FIXME)\b/.test(line)) {
        findings.push({ file: name, line: index + 1, kind: "todo", detail: line.trim().slice(0, 120) });
      }
    });
  }
  return { files, findings, skipped, bytes };
}
