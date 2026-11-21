import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

const WORKSPACE_ROOT = path.resolve(process.cwd());

// Hardcoded allowlist of server & shared simulation modules only
const ALLOWED_SERVER_FILES: ReadonlyArray<string> = [
  'server.ts',
  'src/server/GameServer.ts',
  'src/server/ProfileStore.ts',
  'src/shared/types.ts',
  'src/shared/physics.ts',
  'src/shared/maps.ts',
  'src/shared/weapons.ts',
];

// Hardcoded allowlist of root files for full-game archive (excludes .env secrets, data, node_modules, dist, *.zip)
const ALLOWED_FULL_ROOT_FILES: ReadonlyArray<string> = [
  '.env.example',
  '.gitignore',
  'README.md',
  'index.html',
  'metadata.json',
  'package.json',
  'server.ts',
  'tsconfig.json',
  'vite.config.ts',
];

const EXCLUDED_NAMES = new Set([
  'node_modules',
  'dist',
  'data',
  '.git',
  '.aistudio',
]);

const STANDALONE_PACKAGE_JSON = JSON.stringify(
  {
    name: 'neon-strike-multiplayer-server',
    version: '1.0.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'tsx server.ts',
      start: 'node server.ts',
      lint: 'tsc --noEmit',
    },
    dependencies: {
      dotenv: '^17.2.3',
      express: '^4.21.2',
      ws: '^8.18.0',
    },
    devDependencies: {
      '@types/express': '^4.17.21',
      '@types/node': '^22.14.0',
      '@types/ws': '^8.5.14',
      tsx: '^4.21.0',
      typescript: '^5.8.0',
    },
  },
  null,
  2,
);

const STANDALONE_TSCONFIG = JSON.stringify(
  {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      allowImportingTsExtensions: true,
      noEmit: true,
      skipLibCheck: true,
      strict: true,
    },
    include: ['server.ts', 'src/**/*.ts'],
  },
  null,
  2,
);

const STANDALONE_ENV_EXAMPLE = `# Server listening port
PORT="3000"

# Set to production when hosting standalone API + WebSocket server
NODE_ENV="production"
`;

const STANDALONE_README = `# NEON STRIKE — Standalone Multiplayer Server & Shared Physics

This archive contains the authoritative Node.js WebSocket multiplayer server, persistent player profile store, and deterministic shared FPS physics, maps, and weapon specifications.

## Included Modules

- \`server.ts\` — Express HTTP API + WebSocket (\`/ws\`) server entrypoint
- \`src/server/GameServer.ts\` — 20Hz authoritative match loop, public matchmaking, private room codes, server-side raycast hit validation, and respawning
- \`src/server/ProfileStore.ts\` — File-backed persistent player stats, XP/leveling, and cosmetic skin validation
- \`src/shared/physics.ts\` — Shared FPS movement, ramp traversal, AABB collision, and head/body hitbox raycasting
- \`src/shared/maps.ts\` — Arena geometry, ramps, and spawn points for NEON DISTRICT and ORBITAL FOUNDRY
- \`src/shared/weapons.ts\` — Weapon stats and cosmetic skins
- \`src/shared/types.ts\` — Shared WebSocket protocol and game state types

## Quick Start

1. Install dependencies (Node.js 22+ recommended):
   \`\`\`bash
   npm install
   \`\`\`
2. Start the server:
   \`\`\`bash
   NODE_ENV=production npm start
   \`\`\`
   (Or run \`npm run dev\` with \`tsx\`.)

3. Connect clients to:
   - HTTP API: \`http://localhost:3000/api/health\`
   - WebSocket: \`ws://localhost:3000/ws\`
`;

function assertInsideWorkspace(relPath: string): string {
  const resolved = path.resolve(WORKSPACE_ROOT, relPath);
  if (!resolved.startsWith(WORKSPACE_ROOT + path.sep)) {
    throw new Error(`Refusing path outside workspace boundary: ${relPath}`);
  }
  return resolved;
}

async function collectDirectoryFiles(relDir: string): Promise<string[]> {
  const absDir = assertInsideWorkspace(relDir);
  const results: string[] = [];
  const entries = await fs.readdir(absDir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (EXCLUDED_NAMES.has(entry.name)) continue;
    if (entry.name.startsWith('.env') && entry.name !== '.env.example') continue;
    if (entry.name.endsWith('.zip')) continue;

    const childRel = path.posix.join(relDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectDirectoryFiles(childRel)));
    } else if (entry.isFile()) {
      results.push(childRel);
    }
  }
  return results;
}

export async function buildServerSourceZip(): Promise<Buffer> {
  const zip = new JSZip();
  const rootFolder = zip.folder('neon-strike-server');
  if (!rootFolder) {
    throw new Error('Failed to initialize ZIP archive folder.');
  }

  for (const relPath of ALLOWED_SERVER_FILES) {
    const resolved = assertInsideWorkspace(relPath);
    const content = await fs.readFile(resolved, 'utf8');
    rootFolder.file(relPath, content);
  }

  rootFolder.file('package.json', STANDALONE_PACKAGE_JSON);
  rootFolder.file('tsconfig.json', STANDALONE_TSCONFIG);
  rootFolder.file('.env.example', STANDALONE_ENV_EXAMPLE);
  rootFolder.file('README.md', STANDALONE_README);

  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

export async function buildFullGameSourceZip(): Promise<Buffer> {
  const zip = new JSZip();
  const rootFolder = zip.folder('neon-strike-full');
  if (!rootFolder) {
    throw new Error('Failed to initialize full-game ZIP archive folder.');
  }

  for (const relPath of ALLOWED_FULL_ROOT_FILES) {
    const resolved = assertInsideWorkspace(relPath);
    try {
      const content = await fs.readFile(resolved);
      rootFolder.file(relPath, content);
    } catch {
      // Skip optional root files if not present
    }
  }

  const srcFiles = await collectDirectoryFiles('src');
  for (const relPath of srcFiles) {
    const resolved = assertInsideWorkspace(relPath);
    const content = await fs.readFile(resolved);
    rootFolder.file(relPath, content);
  }

  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

async function collectDistFiles(absDir: string, prefix = ''): Promise<string[]> {
  const results: string[] = [];
  const entries = await fs.readdir(absDir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (entry.name.startsWith('.env') || entry.name.endsWith('.zip')) continue;
    const childAbs = path.join(absDir, entry.name);
    const childRel = prefix ? path.posix.join(prefix, entry.name) : entry.name;

    if (entry.isDirectory()) {
      results.push(...(await collectDistFiles(childAbs, childRel)));
    } else if (entry.isFile()) {
      if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) continue;
      results.push(childRel);
    }
  }
  return results;
}

export async function buildCloudflarePagesZip(): Promise<Buffer> {
  const distDir = assertInsideWorkspace('dist');
  const distIndex = path.join(distDir, 'index.html');
  try {
    const st = await fs.stat(distIndex);
    if (!st.isFile()) {
      throw new Error('dist/index.html is not a file');
    }
  } catch {
    throw new Error('Compiled static build (dist/index.html) not found. Run "npm run build" first.');
  }

  const zip = new JSZip();
  const distFiles = await collectDistFiles(distDir);
  let hasRedirects = false;

  for (const relPath of distFiles) {
    if (relPath === '_redirects') hasRedirects = true;
    const absPath = path.resolve(distDir, relPath);
    if (!absPath.startsWith(distDir + path.sep)) {
      throw new Error(`Refusing path outside dist directory: ${relPath}`);
    }
    const content = await fs.readFile(absPath);
    zip.file(relPath, content);
  }

  if (!hasRedirects) {
    zip.file('_redirects', '/* /index.html 200\n');
  }

  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

export async function writeWorkspaceSourceZips(): Promise<{
  cloudflareZipPath: string;
  cloudflareBytes: number;
  fullZipPath: string;
  fullBytes: number;
  serverZipPath: string;
  serverBytes: number;
}> {
  const [cloudflareBuf, fullBuf, serverBuf] = await Promise.all([
    buildCloudflarePagesZip(),
    buildFullGameSourceZip(),
    buildServerSourceZip(),
  ]);

  const cloudflarePath = assertInsideWorkspace('neon-strike-cloudflare-pages.zip');
  const fullPath = assertInsideWorkspace('neon-strike-full-source.zip');
  const serverPath = assertInsideWorkspace('neon-strike-server-source.zip');

  const cloudflareTmp = `${cloudflarePath}.tmp`;
  const fullTmp = `${fullPath}.tmp`;
  const serverTmp = `${serverPath}.tmp`;

  await fs.writeFile(cloudflareTmp, cloudflareBuf);
  await fs.rename(cloudflareTmp, cloudflarePath);

  await fs.writeFile(fullTmp, fullBuf);
  await fs.rename(fullTmp, fullPath);

  await fs.writeFile(serverTmp, serverBuf);
  await fs.rename(serverTmp, serverPath);

  return {
    cloudflareZipPath: 'neon-strike-cloudflare-pages.zip',
    cloudflareBytes: cloudflareBuf.length,
    fullZipPath: 'neon-strike-full-source.zip',
    fullBytes: fullBuf.length,
    serverZipPath: 'neon-strike-server-source.zip',
    serverBytes: serverBuf.length,
  };
}
