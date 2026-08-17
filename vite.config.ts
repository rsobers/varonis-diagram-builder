import { defineConfig, loadEnv, type Plugin } from 'vite';

/**
 * Dev-only middleware that routes /api/generate to the same handler the
 * production serverless function uses. Prod deployment (M5) will wire
 * `api/generate.ts` into the target platform directly.
 *
 * Also loads server-side env vars (ANTHROPIC_API_KEY) from .env* files into
 * process.env — Vite's built-in loadEnv only exposes VITE_-prefixed vars to
 * the client, but our api/generate.ts runs in the Node dev server and needs
 * the un-prefixed key.
 */
function apiProxyPlugin(mode: string): Plugin {
  return {
    name: 'vdb-api-proxy',
    configureServer(server) {
      const env = loadEnv(mode, process.cwd(), '');
      if (env['ANTHROPIC_API_KEY'] && !process.env['ANTHROPIC_API_KEY']) {
        process.env['ANTHROPIC_API_KEY'] = env['ANTHROPIC_API_KEY'];
      }
      server.middlewares.use('/api/generate', async (req, res, next) => {
        try {
          const mod = await server.ssrLoadModule('/api/generate.ts');
          await (mod.handleGenerate as (r: typeof req, s: typeof res) => Promise<void>)(req, res);
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: (err as Error).message }));
          next();
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  root: '.',
  plugins: [apiProxyPlugin(mode)],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
}));
