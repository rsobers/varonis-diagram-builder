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
- **M1 — Canvas.** Place, drag, select, edit, delete. Palette and inspector. Grid snapping.
- **M2 — Full kit.** Connectors and connector labels, boundaries, zone dividers, inline controls, grouped elements, legends.
- **M3 — Output.** SVG and 2x transparent PNG export, local persistence, keyboard shortcuts.
- **M4 — Generate from image.** Serverless proxy, upload, JSON parsing with strict validation, drop onto canvas.
- **M5 — Ship.** Deploy, decide on auth and shared storage.

M0 is deliberately UI-free. The prototype's interaction bugs came from interaction and rendering being tangled; keeping the renderer pure and tested first prevents that.

## Constraints

- **No third-party brand marks in the repo.** Icons are Material Symbols only. Vendor logos are sourced through the Brand Team; the app does not ship or fetch them.
- The image-to-diagram prompt must keep its instruction not to reproduce logos, wordmarks, or artwork from the uploaded image. It rebuilds structure, it does not trace.
- Accessibility floor: keyboard-navigable, visible focus, reduced motion respected, exported diagrams carry alt text.

## Known issues from the prototype

`prototype/diagram-builder.html` is a single-file proof of concept. Its rendering is sound and matches the current spec; its interaction layer was never tested in a browser. Treat it as a design reference, not a codebase to port line by line.

Outstanding bugs to reproduce and fix in M1/M2 — **to be filled in from the punch list before starting M1.**
