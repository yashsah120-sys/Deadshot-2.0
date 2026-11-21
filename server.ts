import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { WebSocketServer } from 'ws';
import { GameServer } from './src/server/GameServer.ts';
import { ProfileStore } from './src/server/ProfileStore.ts';

async function startServer() {
  const PORT = Number(process.env.PORT || 3000);
  const isProd = process.env.NODE_ENV === 'production';

  const app = express();
  app.use(express.json({ limit: '100kb' }));

  // Allow cross-origin requests from static Cloudflare Pages deployments
  app.use('/api', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  const profileStore = new ProfileStore();
  await profileStore.init();

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });
  const gameServer = new GameServer(wss, profileStore);

  // API Endpoints
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, ...gameServer.getPublicRoomStats() });
  });

  app.get('/api/stats', (_req, res) => {
    res.json(gameServer.getPublicRoomStats());
  });

  app.get('/api/profile/:playerId', (req, res) => {
    const profile = profileStore.getOrCreate(req.params.playerId);
    res.json(profile);
  });

  app.post('/api/profile', (req, res) => {
    const body = req.body as Record<string, unknown>;
    const playerId = typeof body.playerId === 'string' ? body.playerId : '';
    if (!playerId) {
      res.status(400).json({ error: 'playerId is required' });
      return;
    }
    const updated = profileStore.updateLoadoutAndName(playerId, {
      username: typeof body.username === 'string' ? body.username : undefined,
      primaryWeapon: body.primaryWeapon as never,
      secondaryWeapon: body.secondaryWeapon as never,
      equippedSkin: body.equippedSkin as never,
    });
    res.json(updated);
  });

  app.post('/api/profile/match', (req, res) => {
    const body = req.body as Record<string, unknown>;
    const playerId = typeof body.playerId === 'string' ? body.playerId : '';
    if (!playerId) {
      res.status(400).json({ error: 'playerId is required' });
      return;
    }
    const updated = profileStore.recordMatchStats(playerId, {
      kills: Number(body.kills || 0),
      deaths: Number(body.deaths || 0),
      shotsFired: Number(body.shotsFired || 0),
      shotsHit: Number(body.shotsHit || 0),
      headshots: Number(body.headshots || 0),
      won: Boolean(body.won),
      xpEarned: Number(body.xpEarned || 0),
    });
    res.json(updated);
  });

  app.get('/api/leaderboard', (_req, res) => {
    res.json(profileStore.getLeaderboard(20));
  });

  app.get('/api/export-server-source', async (_req, res) => {
    try {
      const { buildServerSourceZip } = await import('./src/server/SourceExport.ts');
      const zipBuffer = await buildServerSourceZip();
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="neon-strike-server-source.zip"');
      res.setHeader('Content-Length', String(zipBuffer.length));
      res.send(zipBuffer);
    } catch (err) {
      console.error('Source export failed:', err);
      res.status(500).json({ error: 'Failed to generate server source archive.' });
    }
  });

  app.get('/api/export-full-source', async (_req, res) => {
    try {
      const { buildFullGameSourceZip } = await import('./src/server/SourceExport.ts');
      const zipBuffer = await buildFullGameSourceZip();
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="neon-strike-full-source.zip"');
      res.setHeader('Content-Length', String(zipBuffer.length));
      res.send(zipBuffer);
    } catch (err) {
      console.error('Full source export failed:', err);
      res.status(500).json({ error: 'Failed to generate full source archive.' });
    }
  });

  app.get('/api/export-cloudflare-zip', async (_req, res) => {
    try {
      const { buildCloudflarePagesZip } = await import('./src/server/SourceExport.ts');
      const zipBuffer = await buildCloudflarePagesZip();
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="neon-strike-cloudflare-pages.zip"',
      );
      res.setHeader('Content-Length', String(zipBuffer.length));
      res.send(zipBuffer);
    } catch (err) {
      console.error('Cloudflare Pages export failed:', err);
      res.status(500).json({
        error:
          err instanceof Error ? err.message : 'Failed to generate Cloudflare Pages archive.',
      });
    }
  });

  if (!isProd) {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch {
      // Standalone server-only bundle without Vite installed
    }
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`NEON STRIKE server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start NEON STRIKE server:', err);
  process.exit(1);
});
