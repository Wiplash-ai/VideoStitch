---
name: video-stitch
description: Create safe, reviewable VideoStitch edit plans for ads, podcasts, product demos, and social clips without rendering or publishing media.
---

# VideoStitch

Use this skill when a user wants an agent to propose edits for a VideoStitch
project. The agent produces a `videostitch.edit-plan.v1` JSON file. VideoStitch
validates the plan, shows every operation to the user, and applies only selected
operations as a new revision.

## Safety boundary

- Never publish, upload, schedule, approve an artifact, authorize paid work, or
  delete source media.
- Treat source assets as immutable. Refer to clip and revision IDs from the
  exported project manifest.
- Use integer milliseconds. Clip trims and splits use source-media coordinates,
  not timeline-relative coordinates.
- Preserve chronology and meaning for podcast edits unless the user explicitly
  asks for a montage or reordered cold open.
- Record uncertainty. Do not fabricate product behavior, speaker identity,
  claims, source timestamps, or privacy conclusions.
- Produce JSON only when generating an importable plan. Do not include hidden
  reasoning or credentials.

## Workflow

1. Ask the user to export the current VideoStitch project manifest.
2. Read `schemaVersion`, `currentRevisionId`, immutable asset metadata, clip IDs,
   source spans, V2 cutaways, transcript cues, canvas, and existing overlays.
3. Establish the viewer goal and editorial mode. List beats that must remain.
4. Propose the smallest useful operation set. Every operation needs a title,
   visible detail, concise rationale, and calibrated confidence.
5. Set `baseRevisionId` exactly to the manifest's `currentRevisionId` and
   `sourceCoordinateSystem` to `source-milliseconds`.
6. Validate the result against
   `public/schemas/edit-plan.v1.schema.json` before returning it.

## Supported operations

- `trim-start` / `trim-end`: remove a duration from the whole sequence edge.
- `set-aspect`: choose `16:9`, `9:16`, or `1:1`.
- `trim-clip`: replace one clip's source in/out points.
- `split-clip`: split a clip at one source timestamp.
- `remove-clip`: remove a clip from the sequence without deleting its asset.
- `reorder-clips`: provide every current clip ID exactly once in output order.
- `set-clip-audio`: set volume from `0` to `1`, mute, and audio fade durations.
- `set-clip-transform`: choose contain/cover, zoom from `1` to `3`, and X/Y
  framing from `-100` to `100` for an existing V1 clip.
- `add-broll`: place an existing immutable asset on V2 with source/timeline
  timing, opacity, fades, and framing. V2 is visual-only and never replaces A1.
- `add-text`: add a timed caption or title at top, center, or bottom.

## Quality checks

- All IDs are unique and stable strings.
- All source coordinates are inside the referenced asset and leave at least 500
  milliseconds after trimming; splits leave at least 300 milliseconds per side.
- Text overlays stay inside the current timeline and use a six-digit hex color.
- A reorder includes all current clip IDs exactly once.
- B-roll timing must stay inside both its referenced asset and the master
  timeline. Do not infer a useful cutaway from filenames alone.
- Reframing is visual composition, not evidence of speaker tracking. Declare
  uncertainty unless the relevant frames were actually inspected.
- Each uncertainty that could change editorial meaning is explicit.
- High confidence is reserved for directly evidenced edits.

## Output

Return one JSON object conforming to `videostitch.edit-plan.v1`. The editor will
reject a stale `baseRevisionId`, malformed operation, unknown clip, invalid
coordinate, or unsupported operation before anything changes.
