import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildPrompt } from '../src/ai.prompt';
import type { Encoding } from '../src/model';

/**
 * Serverless proxy for the image-to-diagram request. Forwards the image
 * bytes to Anthropic once, parses the returned JSON, and hands it back to
 * the client. Image bytes are NOT persisted anywhere — this handler holds
 * them for the duration of the request and nothing else.
 *
 * Deployment note: this file is Vite-dev-middleware-friendly (see the
 * `apiProxyPlugin` in vite.config.ts). For production deployment, adapt to
 * the target platform's serverless signature — the core `handleGenerate`
 * function is agnostic.
 */

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
  return JSON.parse(raw) as Body;
}
