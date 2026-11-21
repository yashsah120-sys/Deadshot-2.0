# NEON STRIKE

Browser-based competitive online multiplayer 3D FPS built with Three.js, WebGL, WebSockets, Express, and React.

## Architecture

- `src/shared/` — Deterministic FPS physics (`physics.ts`), weapon specs & cosmetic skins (`weapons.ts`), arena geometry & spawn definitions (`maps.ts`), and network protocol types (`types.ts`).
- `src/engine/` — Pure Three.js 3D FPS engine (`GameEngine.ts`), arena builder (`mapBuilder.ts`), composite weapon viewmodels (`weaponModels.ts`), 3D operator avatars (`characterModel.ts`), procedural PBR textures (`textures.ts`), object-pooled tracers/sparks (`effectsPool.ts`), and Web Audio synthesizer (`audio.ts`).
- `src/net/` — Reconnecting WebSocket client (`MultiplayerClient.ts`) with RTT ping measurement.
- `src/server/` — Authoritative 20Hz Node.js WebSocket multiplayer server (`GameServer.ts`) and persistent profile store (`ProfileStore.ts`).
- `server.ts` — Express HTTP + WebSocket (`/ws`) server serving Vite in development and `dist/` in production on port `3000`.

## Local Setup & Development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the full-stack dev server (Vite + Express + WebSockets on port 3000):
   ```bash
   npm run dev
   ```
3. Open `http://localhost:3000` in two separate browser windows/tabs to test live online multiplayer (Public Matchmaking or Private Room codes).

## Production Build & Deployment

1. Build the client bundle:
   ```bash
   npm run build
   ```
2. Start the production Node.js server:
   ```bash
   NODE_ENV=production npm start
   ```
   The server binds to `0.0.0.0:$PORT` (default `3000`) and serves both the static client bundle and the `/ws` WebSocket endpoint on the same origin.

## Cloudflare Pages Static Deployment

Cloudflare Pages Direct Upload does not run uncompiled `.tsx` files. Use `neon-strike-cloudflare-pages.zip` (containing pre-built `dist/` HTML/JS/CSS assets and `_redirects` at the archive root, with zero `.tsx` files):

1. Upload `neon-strike-cloudflare-pages.zip` in **Cloudflare Dashboard → Workers & Pages → Create → Pages → Upload assets**.
2. Bot Matches, Practice Range, Loadout, and Settings run standalone in the browser with `localStorage` profile persistence.
3. For live online multiplayer from Cloudflare Pages, deploy `neon-strike-server-source.zip` on a Node.js host and enter its `https://...` URL under **Settings → Multiplayer Server URL** (or set `VITE_SERVER_URL` before running `npm run build`).

## Environment Variables

- `PORT` — Listening port for Express & WebSocket server (default: `3000`).
- `NODE_ENV` — Set to `production` when running built `dist/` assets.
- `VITE_SERVER_URL` — Optional external Node.js server origin (`https://...`) for static Cloudflare Pages builds.

