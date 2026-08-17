# CLAUDE.md — Varonis Diagram Builder

## What this is

A web app that lets the Varonis marketing and product teams build architecture diagrams that are on-brand by construction. Users drag elements from a kit onto a canvas; the renderer only knows how to draw compliant shapes, so a non-designer cannot produce an off-brand diagram. It also generates a first-draft diagram from an uploaded screenshot.

It replaces a PowerPoint template that people were copying, stretching, and recoloring.

## The spec is authoritative

`docs/varonis-diagram-style-guide.md` is the source of truth for every visual decision. **Section 11 is a JSON token block — read it before writing rendering code, and derive constants from it rather than hardcoding values.** If a rule in the guide and a value in the code disagree, the guide wins and the code is wrong.

Do not invent visual rules. If something isn't covered, ask rather than guessing — several rules in the guide exist because an earlier draft guessed and got it wrong.

Rules that are most often broken by accident:

- **No rotated text, anywhere.** Not labels, not boundary titles.
- **Square corners** for elements, grouped elements, and boundaries. **Stadium** for inline controls and connector labels. Shape is semantic; never soften a box or square a pill.
- **Icons are opt-in**, and all-or-nothing within a peer group. Default to no icon.
- **One color encoding per diagram** (Ownership, Emphasis, or State), declared in a legend or caption.
- Connectors terminate on edge **midpoints**; multiple connectors on one edge are spaced evenly and centred as a group.

## Reference implementation

`reference/v2.py` is a working Python renderer that implements the spec, plus `reference/ex1.py` and `reference/ex2.py`, which build the two canonical example diagrams. The committed SVGs in `docs/` are known-good output. (The example scripts write their SVG to the current working directory — repoint them at `docs/` as a first housekeeping task.)

**Port the logic, not the language.** Use `v2.py` as the oracle for geometry: label wrapping, icon block centring, boundary label placement and layering, connector-label pill sizing, grouped-element padding. It has already been debugged against real output — reimplementing from the prose will reintroduce bugs that are already fixed.

Two things in it that matter more than they look:

1. **Width-aware text measurement.** Wrapping by character count is wrong; capitals and wide letters vary enough that two 24-character labels can differ by 25px. Port `text_width()`.
2. **Build-time fit warnings.** The renderer warns when a label overflows or when an icon plus two lines is asked to fit a medium element. Keep this, and make it fail the build in CI.

## Architecture

Decisions already made. Revisit only with a reason.

- **Vite + TypeScript.** No framework needed for the canvas; the renderer is imperative SVG. React is fine for the panels if it earns its place.
- **`src/tokens.ts`** — generated from or mirroring section 11. Single source of truth for values.
- **`src/render.ts`** — `render(state, opts) => string`. **Pure.** No DOM, no globals, no side effects. This is the constraint that makes snapshot testing and any future server-side rendering possible. Do not let interaction code leak into it.
- **`src/model.ts`** — typed node/edge/boundary model. **Version the serialized format from day one** (`{ version: 1, ... }`) so saved diagrams survive refactors.
- **`src/interactions.ts`** — pointer handling, drag, selection, connect mode.
- **`src/ai.ts`** — client half of image-to-diagram.
- **`api/generate.ts`** — serverless proxy. See below.

### The API key never touches the client

The prototype called `api.anthropic.com` directly from the browser; that only worked because the artifact runtime injected auth. In this app that call goes through a serverless function that holds the key server-side, validates the request, and rate-limits per user. Image bytes are forwarded, not stored.

### Persistence

`window.storage` does not exist outside the artifact runtime. Start with `localStorage` behind a small interface so it can be swapped. Whether the product needs shared, linkable diagrams with a real database is an open product question — do not build auth or Postgres until it is answered.

## Testing

- **Snapshot tests are the backbone.** Port `ex1` and `ex2` as fixture data, render them, and commit the output. Any change to spacing, padding, or wrapping shows up as a diff in review. Do not chase byte-identical parity with the Python output across languages — generate the TS snapshots once, verify them visually against `docs/example-1-v2.svg` and `docs/example-2-v2.svg`, then treat them as golden.
- Unit-test `text_width`, wrapping, edge routing, and pill sizing directly. They are pure functions and where the bugs live.
- Fit warnings fail CI.

## Milestones

Do not start the next one until the previous is committed and green.

- **M0 — Renderer.** Scaffold, tokens, pure `render.ts`, both examples rendering headless, snapshot tests passing. No UI at all.
- **M1 — Editor.** Full editing surface. `prototype/diagram-builder.html` is the UX acceptance target — match or beat it on every interaction. Do not port its code; do match its capability. Required:
  - **Drag-and-drop from the palette** onto the canvas, plus click-to-place as a fallback.
  - **Full element kit**: element (sm/md/lg), grouped element with editable rows, inline control, boundary (plain and filled), zone divider, actor.
  - **Connectors**: connect mode, click source then target, straight and elbow routing, solid and dashed, terminating on edge midpoints per §4 using `layout()`.
  - **Connector labels**: pill with optional secondary text and number badge, editable from the inspector.
  - **Inspector**: label, second line, size, fill, icon picker showing all icons as a grid, group row add/remove, per-kind fields.
  - **Encoding selector**: Ownership / Emphasis / State / none. State unlocks amber/red/green and requires a legend. This is what makes the color restriction legible rather than broken — the palette is contextual to the declared encoding, not permissive-by-default with tribal knowledge attached.
  - **Legend element**, auto-sized to its content.
  - Grid snapping and keyboard shortcuts (Delete / Escape / arrows, shift-arrows for ×10).
- **M2 — Output.** SVG and 2x transparent PNG export, local persistence, keyboard shortcuts. (Was M3.)
- **M3 — Generate from image.** Serverless proxy, upload, JSON parsing with strict validation, drop onto canvas. (Was M4.)
- **M4 — Ship.** Deploy, decide on auth and shared storage. (Was M5.)

M0 is deliberately UI-free. The prototype's interaction bugs came from interaction and rendering being tangled; keeping the renderer pure and tested first prevents that. Everything M1 adds — connect mode, drag-and-drop, encoding, inspector — lives in `interactions.ts` and `ui/`, never in `render.ts`.

## Constraints

- **Vendor brand marks live in `assets/logos/`**, sourced from each vendor's official brand page and recorded in the registry with their source URL and retrieval date. Never trace, redraw, screenshot, or scrape a mark, and never fetch one from an arbitrary URL at runtime. **logo.dev is permitted as a curated brand-asset provider** (`https://img.logo.dev/{domain}?token=…`) because they license marks directly and normalize them — this is not scraping. Marks fetched from logo.dev are cached in-memory for the session; anything meant to ship should be committed to `assets/logos/` with its source URL. Icons remain Material Symbols only — marks and icons are separate systems that share one slot.
- The image-to-diagram prompt must keep its instruction not to reproduce logos, wordmarks, or artwork from the uploaded image. It rebuilds structure, it does not trace.
- Accessibility floor: keyboard-navigable, visible focus, reduced motion respected, exported diagrams carry alt text.

## Known issues from the prototype

`prototype/diagram-builder.html` is a single-file proof of concept. Its rendering is sound and matches the current spec; its interaction layer was never tested in a browser. Treat it as a design reference, not a codebase to port line by line.

The prototype is the **UX acceptance target for M1**: any capability it has that the editor lacks is a bug in the editor. The parity checklist above is the definition of done. Match the shape of the interactions, not the shape of the code — the prototype's globals-and-strings model is exactly what M0's architecture was designed to avoid.
