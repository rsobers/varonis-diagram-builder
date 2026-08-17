import { ICON_NAMES } from './icons';
import { MAX_ELEMENTS, MAX_BOUNDARIES, MAX_CONNECTORS, CANVAS_W, CANVAS_H } from './ai';
import type { Encoding } from './model';

/**
 * The prompt is separated into its own module so it can be diffed and
 * unit-tested independently of the network call. It intentionally repeats
 * the "do not reproduce artwork" guardrail — the model is rebuilding
 * structure from a screenshot, not tracing it.
 */
export function buildPrompt(opts: { encoding?: Encoding; hint?: string }): string {
  const enc = opts.encoding;
  const hint = (opts.hint ?? '').trim();

  const encodingLine = enc
    ? `Encoding is "${enc}". ${encodingRules(enc)}`
    : `No encoding declared — stay grayscale (white or gray) only. Do not use blue, red, amber, or green.`;

  return `You are converting a screenshot of an architecture diagram into a strict-JSON representation the app will re-draw in a house style.

RETURN ONLY JSON. No prose, no markdown code fences, no leading or trailing text.

Canvas is ${CANVAS_W} wide, ${CANVAS_H} tall. All coordinates are integers in canvas units. x,y are the top-left of each item unless noted otherwise.

Schema:
{
  "encoding": ${enc ? `"${enc}"` : 'null | "ownership" | "emphasis" | "state"'},
  "items": [
    { "id": "b1", "kind": "boundary", "label": "…", "x": 0, "y": 0, "w": 300, "h": 200, "filled": false, "tint": null },
    { "id": "n1", "kind": "element", "label": "…", "x": 0, "y": 0, "size": "sm|md|lg", "color": "white|gray|blue|red|amber|green", "icon": "iconKey|null", "sub": "second line|null" },
    { "id": "g1", "kind": "grouped", "label": "…", "x": 0, "y": 0, "color": "white|gray|blue", "children": [{ "label": "row", "icon": "iconKey|null" }] },
    { "id": "a1", "kind": "actor", "label": "…", "cx": 100, "y": 60, "icon": "person|people" },
    { "id": "ic1", "kind": "inlineControl", "label": "…", "x": 0, "y": 0, "icon": "iconKey|null" },
    { "id": "l1", "kind": "legend", "x": 0, "y": 0, "encoding": "…", "rows": [["blue","Focal"]] },
    { "id": "c1", "kind": "connector", "from": "n1", "to": "n2", "label": "SHORT UPPERCASE|null", "dashed": false, "routing": "straight|elbow" }
  ]
}

Rules:
- ${encodingLine}
- Max ${MAX_ELEMENTS} elements (element + grouped + actor + inlineControl combined), ${MAX_BOUNDARIES} boundaries, ${MAX_CONNECTORS} connectors. Merge minor detail rather than exceeding these caps.
- Element sizes: sm=150×34, md=180×64, lg=180×92. Actor is ~120×60 centred on cx. Inline control is auto-sized, ~min 90×36. Boundary is user-sized.
- Leave at least 60px of vertical gap between connected elements so labels fit.
- Actor cx is the horizontal centre, not the left edge.
- Boundaries are trust or environment perimeters drawn behind nodes — give them enough padding to enclose their children (~20px on every side per §3.4).
- Grouped elements are a container holding a list of labelled rows (up to 6). Use for "SIEM integrations" or a family of similar components. Not for a heading over separate elements.
- Inline controls are for firewalls, WAFs, proxies, gateways — things traffic passes THROUGH. Not for services or data stores.
- Actors are for human roles: user, admin, analyst, attacker. Only "person" and "people" icons.
- Connector labels are SHORT and UPPERCASE (protocol/action/port), typically under 20 characters. Use dashed for indirect / asynchronous / optional relationships.
- Icon keys, pick the closest fit or omit: ${ICON_NAMES.join(', ')}.
- **Do not reproduce logos, wordmarks, or decorative artwork from the source image.** Rebuild the structure and use plain labels + the icon keys above. If the source shows an AWS icon, use the label "AWS" and an appropriate generic icon; do not attempt to trace the AWS wordmark.
- Every item MUST have a unique "id" (short strings like "n1", "b1"). Connectors reference "from" and "to" by these ids.

${hint ? `Additional direction from the user: ${hint}` : ''}
`.trim();
}

function encodingRules(enc: Encoding): string {
  switch (enc) {
    case 'ownership':
      return `Blue = Varonis-operated, white = customer-operated, gray = third-party. No other colors.`;
    case 'emphasis':
      return `Blue for the 1–3 focal components; white or gray for the rest. Blue caps at one third of elements. No other colors.`;
    case 'state':
      return `Red = at risk / attacker-controlled, amber = degraded / partial, green = protected / verified. Grayscale for everything else. Blue is NOT allowed under this encoding. If the whole zone is at risk, tint the boundary and leave its contents grayscale. Add a legend item explaining what each color means.`;
  }
}
