import type { TextOverlay } from "./model";

function timestampToMs(value: string) {
  const normalized = value.trim().replace(",", ".");
  const parts = normalized.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return null;
  const seconds = parts.length === 3
    ? parts[0] * 3_600 + parts[1] * 60 + parts[2]
    : parts[0] * 60 + parts[1];
  return Math.round(seconds * 1_000);
}

export function parseCaptionFile(source: string, durationMs: number): TextOverlay[] {
  const normalized = source.replace(/^WEBVTT[^\n]*\n+/i, "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  const blocks = normalized.split(/\n{2,}/);
  const overlays: TextOverlay[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex < 0) continue;
    const [rawStart, rawEndWithSettings] = lines[timingIndex].split("-->");
    const rawEnd = rawEndWithSettings?.trim().split(/\s+/)[0];
    const startMs = timestampToMs(rawStart);
    const endMs = rawEnd ? timestampToMs(rawEnd) : null;
    const text = lines.slice(timingIndex + 1).join(" ").replace(/<[^>]+>/g, "").trim();
    if (startMs === null || endMs === null || !text || endMs <= startMs || startMs >= durationMs) continue;
    overlays.push({
      id: crypto.randomUUID(),
      kind: "caption",
      text,
      startMs: Math.max(0, startMs),
      endMs: Math.min(durationMs, endMs),
      position: "bottom",
      fontSize: 56,
      color: "#ffffff",
      background: true,
    });
  }
  return overlays;
}
