# VideoStitch

VideoStitch is a local-first, AI-assisted video editor from Wiplash Labs. It is designed for podcast edits, advertisements, product demos, and social clips where every AI-proposed change remains visible, reviewable, and reversible.

This public repository contains the web UI, future browser-extension shell, public project schemas, and safe agent-facing contracts. VideoStitch remains useful without AI and does not publish media or start paid work without explicit user approval.

## Current status

Pre-alpha working editor. The first local-only vertical slice now supports
browser media import and recovery, timeline editing, revision history, fixture
AI-plan review, project-manifest import/export, verified local rendering, and a
private-beta hosted-runner client. Cloud rendering and account onboarding are
later phases.

### Working locally today

- Import MP4/WebM media into IndexedDB without uploading source bytes.
- Preview seamlessly across clips; seek, split, precisely trim, reorder, remove,
  mute, adjust volume, and add audio fades to immutable source spans.
- Switch among landscape, vertical, and square canvas presets.
- Add timed titles/captions or import SRT/WebVTT caption files.
- Undo/redo changes and inspect persisted revision history.
- Generate a fixture AI plan, review each rationale, and selectively apply it
  as a reversible revision.
- Export the current manifest to an external agent, then import and validate a
  `videostitch.edit-plan.v1` plan using the public VideoStitch skill. Stale
  revisions, unknown clips, invalid coordinates, and unsupported operations fail
  before anything changes.
- Submit the current manifest and a brief to a customer-scoped hosted runner,
  poll/cancel the job, and review the returned operations. The API key remains
  in memory and source video bytes stay local.
- Export and import the versioned `videostitch.project.v1` manifest.
- Export a local VP9/Opus WebM with progress and cancellation, browser playback
  QA, duration repair, artifact fingerprinting, and explicit revision approval.
- Create, duplicate, switch, delete, and recover multiple local projects; relink
  missing media only when its SHA-256 fingerprint matches.
- Load the permission-light MV3 extension shell to open the local or deployed
  editor. It requests only extension storage and cannot read tabs or page media.

## Product boundary

- **Public here:** client UI, extension code, local editing, public schemas, sanitized examples, API clients, MCP contracts, and public agent skills.
- **Private in Madbot:** backend rendering, queues, billing, operational automation, private editorial workflows, credentials, and production infrastructure.
- No private Madbot source, filesystem paths, secrets, worker internals, or proprietary media may be copied into this repository.

## Local development

```bash
npm install
npm run dev
```

Production verification:

```bash
npm run typecheck
npm run build
```

Extension smoke test: open `chrome://extensions`, enable Developer mode, choose
**Load unpacked**, and select the repository's `extension/` directory. The
default destination is `http://localhost:4173`; change it from extension
settings when the web app is deployed.

## Documents

- [Product requirements](docs/PRODUCT_REQUIREMENTS.md)
- [PRD review and first build slice](docs/PRD_REVIEW.md)
- [Public/private architecture boundary](docs/ARCHITECTURE_BOUNDARY.md)
- [Commercial API and UI plan](docs/COMMERCIAL_API_UI_PLAN.md)

## Public agent contract

- [VideoStitch agent skill](skills/video-stitch/SKILL.md)
- [Edit-plan JSON Schema](public/schemas/edit-plan.v1.schema.json)
- [Project-manifest JSON Schema](public/schemas/project.v1.schema.json)
- [Hosted runner OpenAPI](public/openapi/runner.v1.openapi.json)

## License

MIT
