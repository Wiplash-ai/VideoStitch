# VideoStitch

VideoStitch is a local-first, AI-assisted video editor from Wiplash Labs. It is designed for podcast edits, advertisements, product demos, and social clips where every AI-proposed change remains visible, reviewable, and reversible.

This public repository contains the web UI, future browser-extension shell, public project schemas, and safe agent-facing contracts. VideoStitch remains useful without AI and does not publish media or start paid work without explicit user approval.

## Current status

Pre-alpha foundation. The first UI concept and reviewed product requirements are included; media import, timeline state, rendering, and agent integrations are not implemented yet.

## Product boundary

- **Public here:** client UI, extension code, local editing, public schemas, sanitized examples, API clients, MCP contracts, and public agent skills.
- **Private in `~/Laboratory/madbot`:** backend rendering, queues, billing, operational automation, private editorial workflows, credentials, and production infrastructure.
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

## Documents

- [Product requirements](docs/PRODUCT_REQUIREMENTS.md)
- [PRD review and first build slice](docs/PRD_REVIEW.md)
- [Public/private architecture boundary](docs/ARCHITECTURE_BOUNDARY.md)

## License

MIT
