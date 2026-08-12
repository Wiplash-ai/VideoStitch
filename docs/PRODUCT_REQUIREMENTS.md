# VideoStitch — Product Requirements Document

**Status:** Draft
**Version:** 0.2
**Last updated:** 2026-08-12
**Product name:** VideoStitch
**Scope level:** Full PRD because the product handles user media, AI credentials,
payments, third-party integrations, and paid rendering

## 1. Summary

VideoStitch is a local-first web video editor that lets creators edit
video manually or ask an AI agent to propose and apply non-destructive edits.
The product combines the current Screenshot Studio editing API, Wiplash's
Madbot-derived video skills, a versioned edit-decision format, browser-side
preview/rendering, and an optional paid backend rendering service.

The default experience keeps source media and rendering in the user's browser.
Creators may use a ChatGPT or Codex plugin connected to their existing
subscription, install a public `SKILL.md` for another capable AI agent, or run
their own model API integration outside VideoStitch. Interactive AI edits still
render locally by default. Headless API jobs and projects that exceed browser
capabilities use a quoted, paid backend render.

The product must remain useful without AI. AI is an editing assistant that
produces inspectable edit operations; it is never the only way to use the
editor, and it never publishes or spends money without explicit approval.

## 2. Contacts

| Role | Owner | Responsibility |
| --- | --- | --- |
| Product owner | Jordan Culver | Product direction, acceptance, pricing, and release approval |
| Product and engineering | Wiplash Labs | Web editor, API, billing, integrations, and operations |
| Editing engine | Screenshot Studio project | Composition model, preview, editing operations, and browser/server rendering foundation |
| Editorial workflows | Wiplash/Madbot media workflow | Podcast, ad, clipping, captions, privacy, framing, metadata, and QA rules adapted for public use |
| Design partners | SmokeAndSudo and Wiplash extension creators | Dogfood projects, usability feedback, and cleared demonstration media |

No external platform, model vendor, or social network is a product stakeholder.
Those services are replaceable dependencies and must remain behind adapters.

## 3. Background

### Problem

Video creators currently choose between three unsatisfying workflows:

1. A conventional editor offers control but requires substantial manual labor.
2. An AI editor is fast but often hides its decisions, over-edits conversations,
   duplicates captions, invents hooks, uploads source media, or forces its own
   rendering and model costs.
3. A headless media API is automatable but lacks a human review surface and can
   become expensive for iterative editing.

Wiplash already has complementary pieces that address these problems:

- Screenshot Studio provides a browser-first editor, composition state,
  FFmpeg/WebCodecs-based export, deterministic editing operations, workflow
  templates, previews, and asynchronous backend rendering.
- Madbot-derived skills provide rules for podcast clip discovery, chronological
  episode editing, hook selection, vertical reframing, captions, privacy review,
  thumbnails, metadata, and technical QA.
- Recent Wiplash advertisements and SmokeAndSudo podcast edits provide real
  examples for development, regression testing, and product demonstrations.

The opportunity is to turn those pieces into one reviewable editing system:
humans and AI agents modify the same structured project, every change is visible
and reversible, and the user chooses who supplies AI compute and where rendering
happens.

### Important OpenAI product boundary

A ChatGPT subscription is not an OpenAI API credit balance. VideoStitch must not
present subscription access as an API key, ask for a password or browser cookie,
automate the ChatGPT website, or charge the customer for OpenAI usage.

VideoStitch supports two distinct ChatGPT/Codex connections. In external-client
mode, ChatGPT or Codex performs reasoning under the user's plan and calls
VideoStitch tools; VideoStitch receives project operations, not OpenAI
credentials. In managed-runner mode, the user explicitly authorizes an isolated
Codex CLI environment on VideoStitch infrastructure through Codex's official
browser or device-code login. VideoStitch then acts as custodian of that
customer's revocable Codex credential cache and may use it only for that
customer's projects. It does not pool accounts or use one customer's identity
for another customer's work.

OpenAI documents browser login for `codex login`, device-code login for remote
or headless environments, token refresh during active sessions, and credential
storage under an independently configurable `CODEX_HOME`. Device-code login is
currently beta, so managed-runner availability must remain feature-flagged and
follow current OpenAI product terms and authentication behavior.

References:

- [OpenAI: ChatGPT subscriptions and API billing are separate](https://help.openai.com/en/articles/8156019-is-api-usage-included-in-chatgpt-subscriptions-even-if-i-have-a-paid-chatgpt-account)
- [OpenAI: Codex authentication](https://developers.openai.com/codex/auth)
- [OpenAI: MCP server and UI plugin quickstart](https://developers.openai.com/plugins/build/app-quickstart)

### Why now

- Modern browsers can preview and export common media through WebCodecs,
  OffscreenCanvas, Web Audio, Origin Private File System, and FFmpeg/WASM
  fallbacks.
- Tool-using AI agents can reliably emit constrained JSON edit decisions instead
  of manipulating opaque editor state.
- Screenshot Studio already exposes typed operations such as trim, canvas,
  background, frame, text, overlays, annotations, animation presets, and
  timeline zooms, plus validation and render readiness checks.
- Creators increasingly use multiple AI clients. A vendor-neutral skill and MCP
  surface can let them use the model they already pay for.
- Wiplash has cleared, internally produced ads and podcasts that can demonstrate
  the product without relying on stock-media claims.

### Competitive context

Traditional editors emphasize precise manual control. Transcript editors make
spoken-word cleanup easier. AI clippers emphasize automatic selection. Template
render APIs emphasize headless scale. Wiplash Video Studio should not try to
match every mature nonlinear-editor feature in its first release. Its wedge is
the combination of local-first media handling, explicit AI edit plans, reusable
public skills, a human approval loop, and a choice between local and paid
rendering.

### Current evidence and assumptions

| Assumption | Supporting evidence | What would invalidate it |
| --- | --- | --- |
| Creators will accept AI decisions when each cut is inspectable and reversible. | The current Madbot workflow works best when models select timestamps and deterministic systems render and QA them. | Testers consistently bypass the AI proposal review or cannot understand the edit diff. |
| Browser rendering can serve a meaningful free tier. | Screenshot Studio already exports video in-browser and uses FFmpeg/WASM and WebCodecs. | Representative 1080p projects fail or exceed acceptable time/memory limits on most supported devices. |
| Users value bringing an existing AI relationship. | The workflow already works through Codex skills and structured editing briefs. | Most testers prefer one bundled AI and will not connect an agent, plugin, or external model integration. |
| Paid backend rendering can fund storage and compute. | Rendering has an observable input size, duration, resolution, and estimated compute cost. | Quotes are routinely higher than users' willingness to pay or margins remain negative after retries and storage. |
| Existing Wiplash videos can prove the product's value. | Wiplash owns recent extension ads and podcast edits with before/after artifacts. | The assets lack documented rights, privacy clearance, or reproducible project manifests. |

## 4. Objective

**Primary objective:** Enable a creator to turn owned source media into a
human-approved video through manual or AI-assisted edits, resulting in at least
60% of activated closed-beta users completing one approved export within seven
days of creating their first project.

### Primary metric

`approved_export_activation_rate` = unique users who complete and explicitly
approve at least one valid export within seven days / unique users who create a
project and import media.

### Secondary metrics and guardrails

| Metric | Initial target |
| --- | ---: |
| Median time from import to first playable preview | Under 2 minutes for a 1080p, 10-minute supported source on the reference desktop |
| Median time to first approved AI edit plan | Under 10 minutes after required transcript/proxy inputs exist |
| AI operations accepted without modification | At least 50% during closed beta |
| Browser render completion rate for jobs declared locally compatible | At least 90% |
| Paid backend render completion rate, excluding invalid inputs | At least 98% within two attempts |
| Projects with unrecoverable edit-state loss | Under 0.5% |
| Unauthorized publishes or unapproved paid jobs | Zero |
| Source-media uploads during local-only projects | Zero |
| Secrets present in logs, telemetry, manifests, or support bundles | Zero |

These are product validation targets, not marketing claims. Baselines must be
recorded during dogfood before targets become release commitments.

## 5. Market Segments

### Primary: builder-creators editing conversations and demonstrations

These users record podcasts, tutorials, livestreams, product walkthroughs, and
screen shares. Their main job is to preserve the useful conversation while
removing setup, failures, dead air, private pixels, and repetition. They need a
full episode, coherent medium clips, short clips, captions, and multiple aspect
ratios without learning a professional NLE.

Initial reachable segment: Wiplash's own creator workflow, adjacent independent
developer-creators, and early adopters already using ChatGPT, Codex, Claude, or
other tool-capable agents. A defensible external market-size estimate requires
separate research and is not invented in this PRD.

### Secondary: product marketers and small teams producing ads

These users combine screen recordings, product images, narration, music,
captions, callouts, zooms, and branded frames. They need repeatable templates,
rapid variants, accurate previews, and easy exports for landscape, square, and
vertical placements. Their edits can be more promotional and reorderable than
podcast edits, but all claims and source assets still require review.

### Secondary: agent-first creators and developers

These users want their existing AI agent to operate a video tool through a
public `SKILL.md`, MCP tools, or HTTP API. They value deterministic schemas,
idempotent commands, job status, artifact URLs, and predictable pricing more
than a fully manual UI.

### Secondary: privacy- and cost-conscious manual editors

These users may never connect AI. They want a useful browser editor with local
projects and local rendering, and they want explicit consent before any source
media leaves the device.

### Non-target users for the first release

- Feature-film editors requiring large multicamera timelines, advanced color
  grading, VFX compositing, surround mixing, or collaborative frame-accurate
  review.
- Users seeking automatic reposting of arbitrary third-party content.
- Agencies requiring unattended mass publishing before audit, moderation,
  rights, and platform controls exist.

## 6. Value Propositions

### Customer jobs, pains, and gains

| Segment | Job | Current pain | Wiplash gain |
| --- | --- | --- | --- |
| Podcaster/tutorial creator | Turn a long recording into a full edit and reusable clips | AI tools overcut, choose incomplete quotes, or hide why a cut was made | Timestamped proposals, complete conversational arcs, reversible edits, and one project for long/medium/short outputs |
| Product marketer | Produce polished ad variants | Rebuilding crops, captions, zooms, and branding for every format | Reusable Screenshot Studio templates and AI-assisted edit plans with preview-before-render |
| Agent-first user | Let an existing AI edit video | Editors expose no safe automation contract | Public skill, MCP tools, and a versioned manifest with validation and idempotency |
| Privacy-conscious user | Edit without uploading source media | Cloud editors require media transfer | Local import, local preview, local rendering, and explicit paid-upload consent |
| Cost-conscious user | Avoid paying twice for AI and rendering | Bundled services obscure compute and render costs | Bring an agent or model integration, render in the browser, and see a quote before backend work |

### Differentiation value curve

| Capability | Traditional browser editor | Automatic AI clipper | Headless render API | VideoStitch target |
| --- | ---: | ---: | ---: | ---: |
| Useful without AI | High | Low | Low | High |
| Local source-media path | Medium | Low | None | High |
| Inspectable AI decisions | Low | Medium | Medium | High |
| Bring any capable agent | Low | Low | Medium | High |
| Human approval before spend/export | High | Medium | Low | High |
| Browser and backend render choice | Low | Low | None | High |
| Podcast and ad-specific editorial rules | Medium | Medium | Low | High |
| Deterministic automation contract | Low | Low | High | High |

The product must not compete by claiming that AI creates a perfect edit in one
click. It should compete on control, transparency, interoperability, privacy,
and the ability to move between manual and agent-driven work without rebuilding
the project.

## 7. Solution

### 7.1 Product principles

1. **Local first, not local only.** Source media stays local until a user
   explicitly requests a backend-dependent feature or paid render.
2. **One project, many operators.** Humans, ChatGPT/Codex, API-key models, and
   third-party agents all modify the same versioned project through validated
   operations.
3. **AI proposes; users remain in control.** Every material AI edit is shown as
   a diff and can be accepted, rejected, or revised.
4. **Non-destructive by default.** Original assets are immutable. Edits create
   manifests and revisions.
5. **Preview before render; quote before charge.** A paid render cannot begin
   until its preview, output settings, price, and retention policy are shown and
   approved.
6. **Editorial modes have different integrity rules.** A podcast remains
   chronological by default. Ads and montages may reorder material only when
   the user selects a mode that allows it.
7. **No invisible publication.** Uploading or scheduling to a social platform
   is a separate, explicit action and is not implied by rendering.

### 7.2 User-selectable operating modes

#### Manual local mode

- No AI connection is required.
- Project state and media stay in browser storage or a user-selected local
  directory when the browser supports file-system handles.
- Preview and compatible renders use the browser.
- Core editing remains free; account requirements are minimized.

#### ChatGPT/Codex connected mode

- The user installs/connects the Wiplash plugin or skill in a supported OpenAI
  client.
- The subscribed OpenAI client performs reasoning and calls Wiplash MCP tools.
- The plugin authenticates to the user's Wiplash account/project using OAuth or
  a short-lived, least-privilege project grant.
- Wiplash never asks for or stores ChatGPT cookies, session tokens, passwords,
  or subscription credentials.
- An interactive browser session renders locally by default. A headless call
  may create a quoted backend-render job that waits for explicit approval.

#### Managed customer-authenticated Codex mode

- The user starts an official Codex browser-login redirect or device-code flow;
  VideoStitch never asks for an OpenAI password, browser cookie, or pasted
  `auth.json` file.
- A dedicated worker runs Codex CLI with a tenant-specific `CODEX_HOME`. The
  credential cache is encrypted with a tenant-specific key, excluded from logs,
  inaccessible to application support by default, and never mounted into
  another tenant's job.
- The worker may read only media and project state covered by a short-lived,
  signed grant for that same customer and project. It receives no generic shell
  or cross-tenant storage access.
- OpenAI usage applies to the customer's selected ChatGPT/Codex account and
  workspace. VideoStitch does not pool allowances, resell tokens, or add an AI
  usage charge.
- The user can inspect connection status, disconnect the account, and request
  deletion of the cached credentials. Revocation prevents new jobs immediately.
- This is an opt-in beta convenience path. External-client and self-operated
  agent modes remain preferred because they avoid credential custody.

#### Bring-your-own model API mode

- The developer runs model inference in their own backend or a trusted local
  companion using credentials from their chosen provider.
- The provider bills the key owner directly. VideoStitch receives the resulting
  structured edit plan, never the provider credential.
- Provider keys must not enter VideoStitch HTTP requests, browser storage,
  project manifests, analytics, logs, crash reports, or support bundles.
- Direct browser calls that expose a secret provider key are unsupported.

#### External-agent mode

- A public, vendor-neutral `SKILL.md` teaches a capable agent how to inspect
  project capabilities, propose an edit plan, validate it, request previews,
  and request an optional render quote.
- The same operations are available through MCP and a documented HTTP API.
- Users bring their own model, agent runtime, and model billing.
- Local browser rendering is available while the project is open. Unattended
  or headless jobs use the paid backend renderer.

#### No VideoStitch-funded AI or AI resale

- VideoStitch does not buy, pool, resell, or mark up model inference.
- Users bring a subscribed agent, authorize their own isolated managed Codex
  runner, run their own model API integration, or edit manually.
- VideoStitch charges only for approved cloud media operations such as rendering,
  QA, storage, transfer, and separately disclosed orchestration—not OpenAI use.

### 7.3 Editorial modes

| Mode | Default rules |
| --- | --- |
| Podcast | Preserve chronology and substantive conversation. Remove verified setup, technical failures, private material, true dead air, abandoned repetition, and unrelated pre/post-roll. No reordered cold open unless the user opts in. |
| Clip discovery | Select complete conversational arcs with a clear opening and payoff. Produce source timestamps, rationale, score, and rejection reasons. |
| Advertisement | Permit reorder, montage, overlays, product zooms, narration, music, and calls to action. Never fabricate product behavior or unsupported claims. |
| Product demo/tutorial | Preserve task causality and real UI state. Use zooms and callouts without hiding context or implying nonexistent actions. |
| Custom | User defines whether reorder, synthetic assets, generated narration, music, branding, and aggressive cleanup are allowed. |

The default AI model for bounded timestamp selection should be the least costly
capable option. Deterministic validation, rendering, caption-layer checks,
privacy review, and QA remain separate from model judgment. More capable models
are escalation paths for ambiguous chronology, privacy, speaker identity, or
visual context rather than the default for every project.

### 7.4 Core user flows

#### Flow A: manual local edit

1. Create a project without connecting AI.
2. Import local video, audio, image, caption, and transcript assets.
3. The editor detects browser capabilities and creates local proxies only when
   needed.
4. Edit on the timeline; preview all changes.
5. Select an output preset and run a local compatibility estimate.
6. Render locally or request a paid backend quote.
7. Review the playable artifact, then explicitly mark it approved.

#### Flow B: AI-assisted browser edit

1. Import media and choose an editorial mode.
2. Connect ChatGPT/Codex, invoke an external agent, or import a plan produced by
   the developer's own model integration.
3. Grant the agent project-scoped permissions: read metadata/transcript,
   propose operations, request previews, or request quotes. Rendering and
   publishing are not included by default.
4. The agent returns a structured plan with timestamps, rationale,
   uncertainties, and expected outputs.
5. The editor validates the plan and shows a timeline diff plus representative
   previews.
6. The user accepts all, accepts selected operations, modifies, or rejects.
7. The browser renders accepted work unless the user approves a backend render.

#### Flow C: agent/headless edit and paid render

1. A user or agent creates a project through the API and receives an upload or
   pull-from-verified-URL plan.
2. The agent submits a versioned edit plan with idempotency keys.
3. Wiplash validates the plan and generates low-cost previews/contact sheets.
4. The API returns an immutable quote containing input assumptions, output
   settings, expiration, price, and retention.
5. The user explicitly authorizes the quoted amount.
6. The backend renders, validates, and exposes time-limited artifacts.
7. The user downloads or approves the result. Source and intermediate files
   expire under the displayed retention policy.

### 7.5 Editing and project model

The canonical project is a versioned JSON composition plus immutable asset
references. AI outputs an Edit Decision List; it never writes arbitrary code or
executes FFmpeg commands supplied in natural language.

Minimum project entities:

- `Project`: owner, editorial mode, local/cloud residency, policy, revisions.
- `Asset`: content hash, type, duration, dimensions, codecs, origin, residency,
  and rights acknowledgement.
- `Composition`: canvas, sources, tracks, timeline, captions, overlays, effects,
  audio, and output presets.
- `EditPlan`: base revision, operations, rationale, source-coordinate system,
  uncertainties, model/agent provenance, and validation result.
- `Preview`: revision, sampled time or range, render engine, artifact, and QA.
- `RenderQuote`: revision hash, output settings, price ceiling, expiry, and
  retention terms.
- `RenderJob`: state, attempts, progress, failure code, billing state, and
  artifacts.
- `Approval`: user, revision, artifact hash, scope, timestamp, and explicit
  action.

Every operation requires a stable ID, integer millisecond timing, coordinate
system, and expected base revision. Conflicts must fail instead of silently
applying to a newer project.

Initial Screenshot Studio operation families to expose:

- source media and trim
- timeline duration
- canvas/aspect ratio and output dimensions
- background, frame, shadow, border radius, and perspective
- text and image overlays
- annotations and blur/redaction regions
- animation presets
- manual and event-generated timeline zooms
- preview and render requests

Required additions for a general video editor include split/ripple-delete,
multi-segment sequence assembly, track ordering, audio gain/mute/fades, clip
transitions, caption tracks, and multiple source assets. These additions must
extend the operation schema rather than bypass it with arbitrary FFmpeg text.

### 7.6 Functional requirements

#### Projects and media

- **FR-001:** Users can create, rename, duplicate, archive, export, and import a
  project manifest.
- **FR-002:** The editor supports immutable local media references and warns
  when a browser file handle is no longer available.
- **FR-003:** Import accepts at minimum H.264/AAC MP4, WebM, common image
  formats, WAV/MP3 audio, SRT, WebVTT, and JSON transcripts in MVP. MOV, MKV,
  HEVC, AV1, multichannel audio, and variable-frame-rate media are capability-
  detected and may require a local transcode or paid backend path.
- **FR-004:** The product reports why a source is unsupported and offers a safe
  next action; it must not advertise literal support for "any video" until the
  tested compatibility matrix justifies that claim.
- **FR-005:** Original assets are never overwritten. Project saves create
  revisions, and undo/redo survives page refresh for local projects.
- **FR-006:** Local projects recover from tab crashes using transactional
  browser storage and a last-known-good manifest.

#### Manual editor

- **FR-010:** Users can play, scrub, zoom, select, trim, split, reorder when the
  mode permits it, mute, change gain, add fades, and delete timeline ranges.
- **FR-011:** Users can add and edit text, captions, images, annotations,
  redactions, backgrounds, frames, aspect ratios, crop/reframe plans, and zooms.
- **FR-012:** Users can create output variants for landscape, square, and
  vertical formats without duplicating source media.
- **FR-013:** Captions have one authoritative editable track. The editor warns
  when imported media appears to contain burned captions and prevents
  accidental duplicate burned layers.
- **FR-014:** Users can export sidecars such as SRT/WebVTT, edit manifests,
  chapters, and metadata independently of the rendered video.
- **FR-015:** Templates are versioned, inspectable, and removable. A template
  cannot silently add watermarks, branding, analytics, or calls to action.

#### AI assistance

- **FR-020:** AI actions are constrained to a published capability catalog and
  validated operation schema.
- **FR-021:** Before analysis, the user chooses which data the agent can read:
  metadata, transcript, audio proxy, frame samples, or source media.
- **FR-022:** Every AI edit plan includes a viewer/user goal, exact source spans,
  output order, rationale, uncertainties, protected beats, and expected output.
- **FR-023:** The editor shows additions, removals, reorderings, caption changes,
  and visual changes as a reviewable diff.
- **FR-024:** Users can accept or reject individual operations. Applying a plan
  creates a new revision and never mutates the original revision.
- **FR-025:** Podcast AI defaults to chronological timestamp selection and
  restrained cleanup. A reordered teaser or montage requires an explicit mode
  and records repeated/reordered source spans.
- **FR-026:** AI may propose previews and render quotes but cannot approve a
  charge, render a paid job, upload, publish, schedule, delete source media, or
  change project privacy without a fresh user action.
- **FR-027:** Agent and model provenance is recorded without retaining hidden
  reasoning. Managed Codex credentials are retained only in the dedicated
  secrets boundary and referenced by opaque connection ID elsewhere.
- **FR-028:** Model failure, quota exhaustion, disconnection, or unsupported
  output returns the project to a usable manual state.
- **FR-029:** Managed Codex jobs enforce customer, project, credential, media,
  workspace, and output ownership at both queue admission and worker startup.
  Any mismatch fails closed before Codex starts.

#### Rendering

- **FR-030:** Capability detection chooses among WebCodecs/Canvas/Web Audio,
  native browser APIs, and optional FFmpeg/WASM. FFmpeg/WASM is a fallback, not
  a mandatory initial download.
- **FR-031:** Before a local render, the editor estimates storage, memory,
  duration, output size, codec support, and whether the tab must remain open.
- **FR-032:** Local renders show progress, cancellation, recoverable errors, and
  a playable final artifact before approval.
- **FR-033:** A backend render requires upload consent, output settings, a fixed
  or capped quote, retention terms, and explicit authorization.
- **FR-034:** Backend jobs use a queue and state machine:
  `draft -> quoted -> authorized -> uploading -> queued -> rendering -> qa ->`
  `succeeded|failed|cancelled|expired`.
- **FR-035:** Backend rendering preflights worker health, queue health,
  capabilities, template compatibility, storage, and required binaries before
  accepting authorization.
- **FR-036:** Production renders require a preview. Output QA includes full
  decode, stream/codec checks, duration, dimensions, audio continuity, and
  representative frame checks. Podcast/clip modes add sync, captions, framing,
  and privacy gates.
- **FR-037:** A completed render returns the video, project/edit manifest,
  relevant captions/sidecars, and a concise machine-readable QA report.
- **FR-038:** Retries are bounded. Deterministic failures cannot loop and
  consume additional charges.

#### API, MCP, and public skill

- **FR-040:** The HTTP API is versioned and documented with OpenAPI.
- **FR-041:** Mutating requests support idempotency keys and optimistic revision
  checks.
- **FR-042:** MCP exposes narrow tools rather than a generic shell. Initial tools
  include `get_capabilities`, `inspect_project`, `create_edit_plan`,
  `validate_edit_plan`, `apply_edit_plan`, `request_preview`,
  `request_render_quote`, `get_job`, and `list_artifacts`.
- **FR-043:** `authorize_render` is a separate high-impact tool and requires an
  interactive confirmation tied to a non-expired quote. It is excluded from
  default agent scopes.
- **FR-044:** The public `SKILL.md` documents coordinate systems, editorial
  modes, schemas, preview/QA requirements, billing boundaries, privacy rules,
  and example calls. It must not include private Madbot credentials, internal
  paths, proprietary source assets, or deployment details.
- **FR-045:** Public skills derived from Madbot undergo licensing, privacy,
  security, and claim review before release. Internal skills remain private
  until explicitly approved.
- **FR-046:** API clients can upload files directly to short-lived object-storage
  URLs without routing media through the application process.
- **FR-047:** API responses use stable error codes and actionable field paths.

#### Billing

- **FR-050:** Browser editing and compatible local rendering can be used
  without purchasing render credits.
- **FR-051:** BYO model/API charges are paid directly by the user to their
  provider. Managed Codex uses the customer's own subscription identity;
  VideoStitch never marks up AI use.
- **FR-052:** Paid quotes separate rendering, storage, transfer, and optional
  deterministic media-processing add-ons when those costs apply.
- **FR-053:** A quote identifies the exact project revision and output settings
  and cannot be reused after either changes.
- **FR-054:** The user sets a maximum authorized amount. Overages require a new
  quote and approval.
- **FR-055:** The ledger records authorizations, captures, releases, credits,
  retries, and refunds. A failed job never becomes an approved export.
- **FR-056:** Pricing is based on observable job inputs and measured compute,
  not opaque "AI magic" units. Exact prices require backend benchmarks before
  launch.

#### Demonstrations and proof

- **FR-060:** The product site includes reproducible before/after examples for a
  podcast, a short clip, a landscape product ad, and a vertical product ad.
- **FR-061:** Initial examples should use cleared Wiplash-owned material from
  recent products such as Privacy Lens, VolumeSilencer, Labeloo, Social-XP, or
  Cruddy Weather, plus cleared SmokeAndSudo recordings.
- **FR-062:** Every demonstration links its visible result to a sanitized edit
  manifest or operation summary so viewers can see what the tool actually did.
- **FR-063:** Demonstrations cannot expose private dashboards, messages,
  filesystem paths, credentials, personal details, or uncleared third-party
  media.
- **FR-064:** Claims distinguish AI-selected edits, template-driven edits,
  browser renders, backend renders, and human corrections.

### 7.7 API surface proposal

The exact resource names may change, but the first implementation should
preserve these boundaries:

```text
POST   /v1/projects
GET    /v1/projects/{project_id}
POST   /v1/projects/{project_id}/assets:init
POST   /v1/projects/{project_id}/edit-plans
POST   /v1/edit-plans/{plan_id}:validate
POST   /v1/edit-plans/{plan_id}:apply
POST   /v1/projects/{project_id}/previews
POST   /v1/projects/{project_id}/render-quotes
POST   /v1/render-quotes/{quote_id}:authorize
GET    /v1/render-jobs/{job_id}
POST   /v1/render-jobs/{job_id}:cancel
GET    /v1/render-jobs/{job_id}/artifacts
GET    /v1/system/capabilities
```

API keys are scoped by project and capability. OAuth grants for ChatGPT/Codex
plugins are short-lived and revocable. Download/upload URLs expire. Webhooks
are signed, replay-protected, and limited to state changes; they never contain
credentials or raw transcript/private-media contents.

### 7.8 Rendering architecture

```text
User media
   |
   +--> Browser project store --> Editor/timeline --> Preview
   |                                  |                |
   |                                  |                +--> Local render
   |                                  |                     WebCodecs/Canvas/
   |                                  |                     Web Audio/FFmpeg WASM
   |                                  |
   |                                  +--> Versioned edit plan <--- AI adapter
   |                                                                |
   |                         ChatGPT/Codex plugin -------------------+
   |                         Managed per-customer Codex sandbox -----+
   |                         Developer-owned model integration -----+
   |                         Public SKILL.md / external MCP ---------+
   |
   +-- explicit consent --> Object storage --> Render queue
                                               |
                                               +--> Screenshot Studio worker
                                               +--> Deterministic QA
                                               +--> Expiring artifacts + report
```

Interactive AI should operate on transcripts, metadata, audio features,
low-resolution proxies, and sampled frames whenever those are sufficient. The
system must not upload full-resolution source media merely because an AI mode
was enabled.

Each managed sandbox contains exactly one Codex session and is bound to one
customer connection plus an explicit project grant. A session can resume only
inside that ownership boundary. Sandboxes are not pooled across customers or
silently repurposed across projects, and deterministic render jobs execute in a
separate worker pool.

### 7.9 Security, privacy, and data requirements

- Local-only projects have no server-side asset record unless the user signs in
  and chooses cloud metadata sync; even then, media remains local.
- Backend uploads use encryption in transit and at rest, tenant-scoped object
  keys, content-type validation, size/duration limits, malware scanning where
  applicable, and signed URLs.
- The user sees a retention duration before upload. Default source and
  intermediate retention should be short and automatically enforced; approved
  artifacts can have a separately selected retention period.
- Deletion removes project metadata and schedules owned blobs for deletion.
  Tombstones preserve only the minimum billing/security audit data required.
- API keys, OAuth tokens, media URLs, signed URLs, private transcript text, and
  detected secrets are redacted from logs and telemetry.
- Managed Codex credentials live outside the application database in an
  encrypted secrets store. Decryption is limited to the assigned tenant worker,
  raw values never enter analytics or support tooling, and every use is audited
  without recording token material.
- Support bundles require user review before export and exclude source media and
  credentials by default.
- Tool permissions distinguish read, propose, apply, preview, quote, spend,
  download, and publish. Least privilege is the default.
- Users attest that they own or have permission to edit and render uploaded
  media. Hosted processing must have an abuse/reporting process before public
  launch.
- Generated narration, images, or music must be labeled in project provenance
  when used. The product must not imply that provenance metadata proves a media
  claim beyond what it actually records.

### 7.10 Performance and reliability requirements

- Supported browsers are current stable Chromium first. Firefox and Safari are
  enabled only after their tested capability matrix passes; unsupported
  features degrade clearly.
- Large files use streaming reads, chunked uploads, proxies, and OPFS rather
  than loading complete media into JavaScript memory.
- UI playback and timeline interaction remain responsive while analysis or
  rendering runs in workers.
- Project revisions are content-addressed or checksummed. Saved manifests are
  validated before replacing the last-known-good state.
- Preview and backend render results include the capability/template version so
  regressions are reproducible.
- Backend workers expose health, heartbeat, queue age/depth, oldest stuck job,
  supported formats, and operator warnings.
- Paid jobs have bounded retries, cancellation semantics, resumable transfer,
  and idempotent settlement.
- Accessibility target is WCAG 2.2 AA for core project creation, timeline
  navigation, text editing, dialogs, and approval controls. Keyboard operation
  and reduced-motion behavior are required.

### 7.11 Edge cases

1. The user closes or refreshes the tab during a local render.
2. Browser storage is full or the imported file handle loses permission.
3. A 4K/long-form source exceeds WASM memory or browser codec support.
4. Variable-frame-rate media causes transcript, audio, and picture timestamps
   to drift.
5. A project has two caption sources and one is already burned into the video.
6. An AI plan references a stale project revision or timestamps outside the
   source duration.
7. An agent reorders podcast dialogue and changes causality or speaker intent.
8. A redaction covers the preview but not the final output due to a coordinate
   mismatch.
9. The user's external model integration is revoked, exhausted, or rate-limited
   halfway through an analysis.
10. The ChatGPT/Codex plugin loses authorization while an edit plan is pending.
11. A managed Codex token is revoked or refreshed while a job is running.
12. A tenant, project, or credential mismatch is detected at worker startup.
13. A backend quote expires after upload but before authorization.
14. The render worker dies after a charge authorization but before completion.
15. An idempotent retry arrives after the first job succeeded.
16. A source URL changes content after a quote; content hashes must invalidate
    the job.
17. Audio exists on multiple tracks with different sample rates or channel
    layouts.
18. A browser preview differs from backend output because font, codec, or
    renderer versions differ.
19. Private information appears only in a brief final-render frame, not sampled
    previews.
20. The user requests deletion while a paid render or upload is active.
21. A plugin tries to approve a charge using a general-purpose access token.
22. A social platform rejects, delays, or privately restricts a later upload;
    rendering success must remain separate from publishing success.

### 7.12 Out of scope for MVP

- Treating a ChatGPT subscription as API credits, collecting passwords/browser
  cookies, pooling customer accounts, or using one customer's Codex identity for
  another customer's work.
- VideoStitch-funded model inference or AI-token resale.
- Automatic publishing or scheduling to social platforms.
- TikTok Direct Post approval as a dependency for the editor's launch.
- Literal support for every codec/container and unlimited project size.
- Collaborative simultaneous editing, comments, team workspaces, and enterprise
  roles.
- Full professional color grading, motion graphics/VFX, multicamera switching,
  surround sound, and plugin ecosystems.
- Training models on user media.
- Long-term cloud media libraries by default.
- Mobile-browser editing beyond viewing, approval, and lightweight metadata
  changes.

TikTok and YouTube export/upload integrations are later features. If pursued,
they require separate OAuth, review, consent, status, quota, and platform-policy
work. The product must be useful as an editor for a broad creator audience, not
constructed merely as an internal uploader to obtain platform API access.

## 8. Release

### Phase 0 — Contracts and dogfood foundation

- Freeze composition/edit-plan schema v1 and coordinate conventions.
- Map current Screenshot Studio operations into the shared schema.
- Add missing sequence, track, audio, and caption operations behind feature
  flags.
- Define local-versus-cloud data boundaries and threat model.
- Create sanitized project manifests for one podcast and two Wiplash ads.
- Benchmark browser rendering and backend rendering on representative sources.
- Exit checkpoint: the same approved edit plan produces acceptably equivalent
  browser and backend outputs with documented differences.

### Phase 1 — Manual local editor MVP

- Local project creation/import/recovery.
- Timeline editing, captions, overlays, aspect variants, previews, and local
  render compatibility checks.
- Project manifest import/export and last-known-good recovery.
- No account required for purely local use where technically practical.
- Exit checkpoint: at least ten dogfood projects export successfully, including
  one 45+ minute podcast source and ads in landscape and vertical formats.

### Phase 2 — Agent-assisted editing

- Public `SKILL.md` and narrow MCP tools.
- ChatGPT/Codex plugin connection using project-scoped authentication.
- BYO model integration that keeps provider credentials outside VideoStitch.
- Feature-flagged managed Codex beta using per-customer authentication,
  isolated `CODEX_HOME` storage, explicit revocation, and tenant-bound jobs.
- AI plan diff, selective approval, provenance, and manual fallback.
- Closed beta with builder-creators.
- Exit checkpoint: zero credential leaks, zero unauthorized high-impact
  operations, and at least half of AI operations accepted without modification.

### Phase 3 — Paid backend render API

- Signed/chunked uploads, quotes, authorization, job queue, Screenshot Studio
  workers, deterministic QA, artifacts, billing ledger, expiry, and deletion.
- Browser UI and headless API use the same quote/job contract.
- Support and refund/retry runbooks.
- Exit checkpoint: 98% valid-job completion within two attempts during a
  controlled beta, positive gross margin under measured workloads, and no
  unreconciled charges.

### Phase 4 — Public launch and integrations

- Publish the cleared podcast and Wiplash product-ad examples with sanitized
  operation summaries.
- Submit the ChatGPT/Codex plugin when product and security requirements pass.
- Evaluate YouTube and TikTok export integrations as separate gated projects;
  do not delay the editor for platform approval.

### Feature flags

- `browser_render`
- `ffmpeg_wasm_fallback`
- `multi_source_timeline`
- `ai_plan_diff`
- `chatgpt_codex_plugin`
- `managed_customer_codex`
- `external_model_plan_import`
- `external_agent_api`
- `backend_render_quotes`
- `paid_render_authorization`
- `youtube_export`
- `tiktok_export`

### Rollback and kill criteria

- Disable a render engine when output differs materially from the approved
  preview, corruption exceeds the error budget, or browser crashes exceed the
  compatibility threshold.
- Disable an AI adapter immediately after a credential exposure, unauthorized
  action, repeated schema bypass, or project data crossing a denied boundary.
- Stop paid-job intake when queue age exceeds the service threshold, workers
  cannot prove readiness, storage deletion fails, or billing cannot reconcile.
- Roll back a schema/template version when existing projects cannot migrate
  losslessly; preserve the prior reader and renderer until affected projects
  are exported or migrated.

### Review checkpoints

1. Product review: confirm working name, MVP boundary, and primary activation
   metric.
2. Architecture/security review: approve local/cloud boundary, external-agent handling,
   plugin OAuth scopes, managed Codex credential custody and tenant isolation,
   and deletion design.
3. Editorial review: validate podcast, clip, ad, caption, privacy, and QA modes
   against cleared examples.
4. Cost review: approve browser compatibility tiers, render benchmarks, quote
   formula, retry policy, and retention defaults.
5. Closed-beta review: compare activation, accepted edits, failures, support
   burden, and willingness to pay against the targets in this PRD.
6. Launch review: verify demonstrations, policies, accessibility, support,
   billing, security, and platform claims before public release.

### Decisions still needed before implementation

- VideoStitch is a separately branded Wiplash application using compatible
  Screenshot Studio engine capabilities.
- The public UI, web app, and extension live in the VideoStitch repository.
  Private backend rendering and operational workflows remain in Madbot until a
  separate private service repository is justified.
- Exact MVP browser/project-size limits after benchmarks.
- Whether the first ChatGPT/Codex connection ships as one combined plugin or a
  plugin plus independently installable skill.
- Whether managed customer-authenticated Codex is invited beta only or available
  to every cloud account at launch.
- Backend media-retention defaults and maximum paid retention.
- Render pricing after measured Madbot/production-worker costs.
- Which cleared Wiplash ads and podcast projects become the canonical public
  examples.
