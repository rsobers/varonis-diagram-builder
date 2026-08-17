import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Serverless proxy for the image-to-diagram request. Forwards the image
 * bytes to Anthropic once, parses the returned JSON, and hands it back to
 * the client. Image bytes are NOT persisted anywhere — this handler holds
 * them for the duration of the request and nothing else.
 *
 * Self-contained by design: no `../src/*` imports. Vercel's Node ESM
 * loader requires explicit .js extensions on relative imports, which our
 * bundler-mode tsconfig omits — the mismatch caused
 * ERR_MODULE_NOT_FOUND in production. Duplicating the tiny amount of
 * config below is the pragmatic fix.
 *
 * Deployment: this file is Vite-dev-middleware-friendly (see the
 * `apiProxyPlugin` in vite.config.ts). On Vercel the default export is
 * auto-mounted at /api/generate.
 */

// ---- Duplicated config (keep in sync with src/ai.ts and src/icons.ts) --

type Encoding = 'ownership' | 'emphasis' | 'state';

const CANVAS_W = 1200;
const CANVAS_H = 800;
const MAX_ELEMENTS = 18;
const MAX_BOUNDARIES = 4;
const MAX_CONNECTORS = 20;

const ICON_NAMES = [
  'shield', 'layers', 'database', 'server', 'cloud', 'lock', 'key', 'mail',
  'code', 'robot', 'monitor', 'folder', 'globe', 'eye', 'warning', 'tune',
  'person', 'people', 'settings', 'dashboard', 'storage', 'memory', 'bug',
  'security', 'hub', 'api', 'add', 'home', 'search', 'star', 'business',
  'work', 'wifi', 'vpn_lock', 'laptop', 'smartphone', 'chat', 'edit',
  'download', 'upload', 'save', 'delete', 'done', 'close', 'notifications',
  'build', 'power', 'http',
] as const;

type Body = {
  image?: { media?: string; data?: string };
  encoding?: Encoding | null;
  hint?: string;
  password?: string;
};

/**
 * Constant-time string compare. Only meaningful for same-length strings;
 * different lengths short-circuit (which leaks length only, not content).
 * Good enough for a static gate that protects API cost, not credentials.
 */
function passwordsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function handleGenerate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'POST required' });
  }
  let body: Body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: `Invalid JSON body: ${(err as Error).message}` });
  }
  // Access gate. When GENERATE_PASSWORD is set on the server, the client
  // must send a matching `password` in the body. Empty / unset env var
  // disables the gate — dev-friendly, and mirrors the ANTHROPIC_API_KEY
  // "not configured" behaviour that other paths already handle.
  const gate = process.env['GENERATE_PASSWORD'];
  if (gate) {
    const supplied = typeof body.password === 'string' ? body.password : '';
    if (!passwordsMatch(supplied, gate)) {
      return sendJson(res, 401, { error: 'Password required to use image-to-diagram on this deployment.' });
    }
  }

  const image = body.image;
  if (!image?.data || !image.media) {
    return sendJson(res, 400, { error: 'Missing image.data / image.media' });
  }
  if (!/^image\/(png|jpe?g|webp)$/.test(image.media)) {
    return sendJson(res, 400, { error: 'Unsupported media type' });
  }

  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    return sendJson(res, 503, {
      error: 'ANTHROPIC_API_KEY not set on the server. Configure it and retry.',
    });
  }

  const encoding = body.encoding && ['ownership', 'emphasis', 'state'].includes(body.encoding)
    ? (body.encoding as Encoding) : undefined;

  const promptOpts: { encoding?: Encoding; hint?: string } = {};
  if (encoding) promptOpts.encoding = encoding;
  if (body.hint) promptOpts.hint = body.hint;
  const prompt = buildPrompt(promptOpts);

  let anthropicResp: Response;
  try {
    anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: image.media, data: image.data } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });
  } catch (err) {
    return sendJson(res, 502, { error: `Upstream error: ${(err as Error).message}` });
  }

  if (!anthropicResp.ok) {
    const text = await anthropicResp.text().catch(() => '');
    return sendJson(res, anthropicResp.status, {
      error: `Anthropic API error (${anthropicResp.status}): ${text.slice(0, 200)}`,
    });
  }

  const data = await anthropicResp.json();
  const text = extractText(data);
  const doc = tryParseJson(text);
  if (!doc) {
    return sendJson(res, 502, {
      error: 'Model did not return parseable JSON.',
      raw: text.slice(0, 500),
    });
  }
  return sendJson(res, 200, { doc });
}

// ---- prompt (inlined; keep in sync with src/ai.prompt.ts) --------------

function buildPrompt(opts: { encoding?: Encoding; hint?: string }): string {
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

// ---- helpers ------------------------------------------------------------

function extractText(anthropicBody: unknown): string {
  const body = anthropicBody as { content?: Array<{ type?: string; text?: string }> };
  const parts = Array.isArray(body?.content) ? body.content : [];
  return parts.filter((p) => p?.type === 'text').map((p) => p?.text ?? '').join('\n');
}

function tryParseJson(text: string): unknown | null {
  // Strip common wrappers.
  const stripped = text.replace(/```json|```/g, '').trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start < 0 || end < 0) return null;
  try {
    return JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return null;
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

/**
 * Default export for Vercel serverless. Vercel auto-mounts each file in
 * `api/` at the matching URL and invokes the default export with Node's
 * (req, res). Named `handleGenerate` is kept for the Vite dev middleware.
 */
export default handleGenerate;

async function readJsonBody(req: IncomingMessage): Promise<Body> {
  // Vercel's @vercel/node runtime pre-parses JSON bodies and hangs them
  // off req.body; by the time our handler runs the request stream has
  // already been consumed. Prefer the parsed value when present, and only
  // fall back to reading the raw stream in environments (like our Vite
  // dev middleware) that don't pre-parse.
  const preParsed = (req as unknown as { body?: unknown }).body;
  if (preParsed && typeof preParsed === 'object') {
    return preParsed as Body;
  }
  if (typeof preParsed === 'string') {
    return JSON.parse(preParsed) as Body;
  }

  const chunks: Buffer[] = [];
  let bytes = 0;
  const MAX = 20 * 1024 * 1024; // 20 MB safety ceiling — client already caps upload at 10 MB post-preprocess.
  for await (const chunk of req) {
    const buf = chunk instanceof Buffer ? chunk : Buffer.from(chunk);
    bytes += buf.length;
    if (bytes > MAX) throw new Error('Body too large');
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) throw new Error('Empty request body');
  return JSON.parse(raw) as Body;
}
