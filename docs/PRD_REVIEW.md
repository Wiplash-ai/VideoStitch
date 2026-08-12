# VideoStitch PRD review

**Review date:** 2026-08-12
**Decision:** Approved as a north-star PRD; narrow the implementation brief before building each phase.

## What is ready

The PRD has a clear product wedge: local-first editing, inspectable AI edit plans, non-destructive revisions, and explicit approval before upload, spend, or publication. Its privacy boundary, agent permission model, rendering state machine, edge cases, and measurable activation goal are strong enough to guide architecture work.

The product name is now **VideoStitch**. It will be a separately branded public web app and browser extension that can reuse Screenshot Studio capabilities. Private rendering and operational workflows remain in Madbot for now.

## Risks to resolve through prototypes

1. Browser rendering targets are hypotheses until representative 1080p and long-form projects are benchmarked across supported devices.
2. "Same project, any operator" depends on freezing a compact operation schema before UI and agent integrations diverge.
3. Preview-to-final equivalence needs golden projects and tolerances for fonts, codecs, frame timing, redactions, captions, and audio sync.
4. AI acceptance rate is meaningful only if the review UI makes source spans, uncertainty, rationale, and consequences easy to understand.
5. A public client must not accidentally expose private Madbot contracts or normalize internal filesystem and worker assumptions into its API.

## First build slice

The initial vertical slice should prove one complete, local workflow:

1. Import one supported MP4 without uploading it.
2. Persist a versioned project manifest locally.
3. Preview, scrub, trim, split, and undo/redo.
4. Load a fixture AI edit plan and show its operations as a timeline diff.
5. Accept or reject individual operations into a new revision.
6. Export the manifest and one short local render.
7. Recover the project after refresh.

### Acceptance criteria

- Source bytes make no network requests.
- The original asset is immutable.
- Every operation carries a stable ID, base revision, and integer-millisecond timing.
- Stale operations fail visibly.
- Rejected AI operations do not modify project state.
- Refresh restores the last-known-good revision.
- The exported artifact is playable and its manifest identifies the exact approved revision.

## Deferred from the first slice

Multi-user collaboration, hosted AI, BYO credential storage, cloud media, backend rendering, billing, publishing, platform OAuth, public API deployment, and production MCP authentication remain deferred. Their contracts may be modeled, but they should not block proving the local editing loop.
