# Varonis Diagram Builder

A web app for the Varonis marketing and product teams to build architecture
diagrams that are **on-brand by construction**. Users drag elements from a
kit onto a canvas; the renderer only knows how to draw compliant shapes,
so a non-designer cannot produce an off-brand diagram.

It replaces a PowerPoint template that people were copying, stretching, and
recoloring.

## Example output

Two canonical diagrams rendered by the same code path the editor uses.

![Example 1 — Varonis SaaS platform architecture](docs/example-1-v2.svg)

![Example 2 — Email security scanning pipeline](docs/example-2-v2.svg)

## Getting started

```sh
npm install
npm run dev        # http://localhost:5173
```

Interactions:

- **Drag** from the left palette onto the canvas — a real-size ghost previews
  where the item will land, snapped to the 10px grid. Click-to-arm then click
  the canvas is a fallback. Works for element kit and vendor marks alike.
- **Drag** an item to move it. Shift-click to multi-select. Drag on the empty
  canvas to marquee-select.
- **Double-click** any label to edit it in place. Enter commits, Esc cancels.
  Works on element labels, connector labels, group rows, titles, captions.
- **Cmd/Ctrl-C / V / D** for copy, paste, duplicate. Connectors carry across
  the copy only when both endpoints are in the selection.
- **Connect mode** (toolbar): click a source element, then a target.
- **Encoding selector** (toolbar): declare Ownership / Emphasis / State per
  spec §6.2. The fill palette contextualizes; violations surface in the
  right-side panel with one-click fixes.
- **Text** section in the palette places a Title (bold heading) or Caption
  (encoding declaration, legend callout).
- **Vendor marks** section places official brand marks inline or as a full
  badge; the toolbar toggle picks the style. Ship marks live in
  `assets/logos/`; the palette can also fetch on demand from logo.dev.
- **Generate from image** (toolbar): upload a screenshot; the app calls
  Anthropic's vision API and drops the parsed diagram onto the canvas.
  Password-gated so the API key doesn't burn on public traffic.

## Architecture

Kept intentionally small and boring; the rendering is imperative SVG, no
framework needed for the canvas.

| File | Role |
|---|---|
| `src/render.ts` | **Pure** function `(doc) => svg`. No DOM, no globals, no side effects. The constraint that makes snapshot tests possible. |
| `src/model.ts` | Typed, versioned `DiagramDoc`. Discriminated `Item` union: element, grouped, boundary, zone divider, inline control, actor, connector, connector-label, edge, legend, caption, title. Forward-migration lives in `migrateDoc`. |
| `src/logos.ts` | Two-tier vendor mark registry: marks shipped in `assets/logos/logos.json`, plus a runtime cache for anything fetched from logo.dev during a session. |
| `src/ai.ts` / `api/generate.ts` | Client + serverless endpoint for image-to-diagram. Anthropic key stays server-side; `GENERATE_PASSWORD` gates the endpoint. |
| `src/tokens.ts` | Mirrors section 11 of the style guide verbatim (JSON block). A test asserts they don't drift. |
| `src/icons.ts` | Curated Material Symbols kit. Icons stored in the model as `{ path, name? }` so exports are self-contained and don't change when Google updates a glyph. |
| `src/layout.ts` | `layout(doc)` → `Map<id, BBox>`. Used for selection overlays, hit-testing, connector routing, containment checks. |
| `src/routing.ts` | Straight and elbow connector routing per spec §4 (terminates on edge midpoints; parallel connectors between the same pair are spaced along the shared edge). |
| `src/validate.ts` | Runtime rule checker: §6.3 color rules, §7.2 peer-group icon consistency, §9 density cap. Emits `Violation[]` with optional click-to-fix actions. |
| `src/editorState.ts` | Pure reducer + tiny pub/sub. All UI state lives here (doc, selection, mode, snap, placing, pending, encoding). |
| `src/interactions.ts` | Pointer / keyboard / drag. Owns SVG DOM manipulation for transient state (drag transforms, marquee rect). |
| `src/copyPaste.ts` | Pure copy/paste helpers; connector endpoints are remapped to fresh IDs. |
| `src/ui/*` | Toolbar, palette, inspector, violations panel, toast, inline-edit, canvas glue. Vanilla TS — no framework. |

### Spec is authoritative

`docs/varonis-diagram-style-guide.md` is the source of truth. Section 11 is
a machine-readable JSON token block — the renderer derives constants from
it rather than hardcoding values. If a rule in the guide and a value in the
code disagree, the guide wins and the code is wrong. See `CLAUDE.md` for
the full working agreement.

### Pure renderer

`render.ts` never touches the DOM, never reads globals, never mutates. This
means:

- **Snapshot tests** are trustworthy: `tests/__snapshots__/example-{1,2}.svg`
  are byte-identical golden files that we compare on every run.
- **Interactive editor** and **static export** share the same renderer.
  Interactive mode adds `<g data-item-id="…">` wrappers gated on
  `opts.interactive`; exports never get them.
- **Selection rings**, **connect-mode pending ring**, **marquee rectangle**,
  and the **drag-and-drop ghost preview** live in `canvas.ts` as overlay
  elements, not in the renderer.

### Validation panel

Runs on every state change. Turns spec §6.3 rules from tribal knowledge
into per-item feedback the user can click to fix. Examples:

- State encoding without a legend → **Add legend** button.
- Blue > 33% under Emphasis → warning naming the offending elements.
- Tinted boundary under a non-State encoding → **Remove tint** button.
- Elements with mixed icons inside the same boundary (§7.2 peer group) →
  warning naming the odd-ones-out. Scoped to boundary siblings only — root
  elements are not treated as an implied peer group.

Nothing mutates without an explicit user click.

## Testing

```sh
npm test              # 115 unit tests (vitest)
npm run e2e           # 21 Playwright specs, 41 cases
npm run typecheck
npm run build
```

The unit suite covers the reducer, text metrics, routing, layout, copy/paste,
validation rules, tokens/guide drift, and the two golden-file renderer
snapshots. E2e specs exercise browser flows: place, drag, connect, encoding
change, inline-edit, marquee, drag ghost, icon picker, copy/paste/duplicate,
zone-divider resize, vendor marks, badge sizing, generate-from-image with
password gate.

## Not doing (out of scope)

- Custom element sizes — §3.1 fixes the sm/md/lg heights. Widths do expand
  horizontally to fit long labels (§3.1 v2.3), but nothing scales the type
  or crushes padding.
- Freeform container shapes — §1 says that's marketing-graphic work, not
  architecture-diagram work.
- Rotated text — §5.2 bans it; the renderer physically can't emit it.
- Auto-generated icons on every element — icons are opt-in (§7.1) and peer
  groups must be all-or-nothing (§7.2). The app enforces this per boundary.

## Reference

`reference/v2.py` is the debugged Python renderer we originally ported from.
It's kept for historical comparison — it's no longer authoritative.

`docs/example-1-v2.svg` and `docs/example-2-v2.svg` are now the app's own
output for the two canonical example fixtures (`src/fixtures/example{1,2}.ts`).
The snapshot test in `tests/render.test.ts` renders those fixtures through
`src/render.ts` and writes to `tests/__snapshots__/example-{1,2}.svg`; the
files in `docs/` are the same bytes. The app is the source of truth: what
users see in the editor is what the docs show.
