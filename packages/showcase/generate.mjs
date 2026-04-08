#!/usr/bin/env node
/**
 * Syncs showcase with packages/themes/:
 *   - Builds new themes (slidev build)
 *   - Removes stale showcase dirs
 *   - Extracts metadata from CSS + package.json
 *   - Regenerates index.html
 *
 * Usage: node generate.mjs [--force]
 */
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const showcaseDir = resolve(import.meta.dirname);
const themesDir = resolve(showcaseDir, '..', 'themes');
const force = process.argv.includes('--force');

// ── 1. Discover source themes ──
const themePackages = readdirSync(themesDir)
  .filter(d => d.startsWith('slidev-theme-') && statSync(join(themesDir, d)).isDirectory());

// Derive showcase dir name from theme package name: slidev-theme-Foo → foo
function showcaseName(pkg) {
  return pkg.replace(/^slidev-theme-/, '').toLowerCase();
}

// ── 2. Remove stale showcase dirs ──
const expectedDirs = new Set(themePackages.map(showcaseName));
for (const entry of readdirSync(showcaseDir)) {
  const full = join(showcaseDir, entry);
  if (!statSync(full).isDirectory()) continue;
  if (entry === 'node_modules') continue;
  if (!expectedDirs.has(entry)) {
    console.log(`🗑  Removing stale: ${entry}/`);
    rmSync(full, { recursive: true, force: true });
  }
}

// ── 3. Build new themes ──
for (const pkg of themePackages) {
  const name = showcaseName(pkg);
  const outDir = join(showcaseDir, name);
  const themeDir = join(themesDir, pkg);

  if (existsSync(outDir) && !force) {
    console.log(`⏭  Already built: ${name}/`);
    continue;
  }

  console.log(`🔨 Building: ${pkg} → ${name}/`);
  try {
    execSync(
      `npx slidev build example.md --base /${name}/ -o ${JSON.stringify(outDir)}`,
      { cwd: themeDir, stdio: 'inherit', timeout: 300_000 }
    );
    console.log(`✓  Built: ${name}/`);
  } catch (e) {
    console.error(`✗  Failed to build ${pkg}: ${e.message}`);
  }
}

// ── 4. Extract metadata & generate theme-meta.json ──
function extractMeta(pkg) {
  const name = showcaseName(pkg);
  const themeDir = join(themesDir, pkg);
  const pkgJson = JSON.parse(readFileSync(join(themeDir, 'package.json'), 'utf8'));
  const css = readFileSync(join(themeDir, 'styles', 'index.css'), 'utf8');

  // Extract CSS variable value
  const cssVar = (varName) => {
    const m = css.match(new RegExp(`${varName}:\\s*([^;]+);`));
    return m ? m[1].trim() : null;
  };

  // Colors: primary, secondary, accent-3..6
  const colors = [
    cssVar('--slidev-theme-primary'),
    cssVar('--slidev-theme-secondary'),
    cssVar('--slidev-theme-accent-3'),
    cssVar('--slidev-theme-accent-4'),
    cssVar('--slidev-theme-accent-5'),
    cssVar('--slidev-theme-accent-6'),
  ].filter(Boolean);

  // Fallback: if fewer than 2 colors, pad with primary
  while (colors.length < 2) colors.push(colors[0] || '#888888');

  const variant = pkgJson.slidev?.colorSchema === 'light' ? 'light'
    : pkgJson.slidev?.colorSchema === 'dark' ? 'dark'
    : 'both';

  const fonts = pkgJson.slidev?.defaults?.fonts?.sans || 'System';
  const text = cssVar('--slidev-theme-text') || '#000000';
  const bg = cssVar('--slidev-theme-background') || '#FFFFFF';
  const themeName = pkgJson.description?.replace(/^Slidev theme (converted from|based on)\s*/i, '').replace(/[""]/g, '') || name;

  const meta = { name: themeName, variant, colors, fonts, text, bg };

  // Write theme-meta.json into showcase dir
  const metaPath = join(showcaseDir, name, 'theme-meta.json');
  if (existsSync(join(showcaseDir, name))) {
    writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
  }

  return meta;
}

// ── 5. Collect all themes & generate index.html ──
const themes = [];
for (const pkg of themePackages) {
  const name = showcaseName(pkg);
  if (!existsSync(join(showcaseDir, name))) continue;

  try {
    const meta = extractMeta(pkg);
    themes.push({ ...meta, path: `/${name}/` });
    console.log(`📋 ${name}/ → ${meta.name}`);
  } catch (e) {
    console.warn(`⚠  Could not extract metadata for ${name}: ${e.message}`);
  }
}

if (themes.length === 0) {
  console.error('No themes found.');
  process.exit(1);
}

themes.sort((a, b) => a.name.localeCompare(b.name));

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Slidev Themes Showcase</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      background: #0a0a0b;
      color: #e4e4e7;
      min-height: 100vh;
    }

    header {
      padding: 2rem 3rem 1rem;
      border-bottom: 1px solid #27272a;
    }

    header h1 {
      font-size: 1.5rem;
      font-weight: 600;
      letter-spacing: -0.02em;
    }

    header p {
      color: #71717a;
      margin-top: 0.25rem;
      font-size: 0.875rem;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(560px, 1fr));
      gap: 2rem;
      padding: 2rem 3rem;
    }

    .card {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 12px;
      overflow: hidden;
      transition: border-color 0.2s;
    }

    .card:hover {
      border-color: #3f3f46;
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid #27272a;
    }

    .card-header h2 {
      font-size: 0.875rem;
      font-weight: 500;
    }

    .card-header .meta {
      display: flex;
      gap: 0.5rem;
    }

    .tag {
      font-size: 0.7rem;
      padding: 0.15rem 0.5rem;
      border-radius: 9999px;
      background: #27272a;
      color: #a1a1aa;
    }

    .tag.dark { background: #1e1b4b; color: #818cf8; }
    .tag.light { background: #fef3c7; color: #92400e; }

    .color-bar {
      display: flex;
      height: 4px;
    }

    .color-bar span {
      flex: 1;
    }

    .iframe-wrap {
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 9;
      background: #000;
    }

    .iframe-wrap iframe {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border: none;
    }

    .card-footer {
      padding: 0.5rem 1rem;
      display: flex;
      gap: 1rem;
      border-top: 1px solid #27272a;
    }

    .card-footer a {
      font-size: 0.75rem;
      color: #71717a;
      text-decoration: none;
      transition: color 0.2s;
    }

    .card-footer a:hover {
      color: #e4e4e7;
    }

    .nav-hint {
      text-align: center;
      padding: 1rem;
      color: #52525b;
      font-size: 0.75rem;
    }
  </style>
</head>
<body>
  <header>
    <h1>Slidev Themes Showcase</h1>
    <p>Converted from PowerPoint templates via pptx2slidev</p>
  </header>

  <div class="nav-hint">Click an iframe, then use arrow keys to navigate slides</div>

  <div class="grid" id="grid"></div>

  <script>
    const themes = ${JSON.stringify(themes, null, 6)};

    const grid = document.getElementById('grid');

    themes.forEach(t => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = \`
        <div class="color-bar">
          \${t.colors.map(c => \`<span style="background:\${c}"></span>\`).join('')}
        </div>
        <div class="card-header">
          <h2>\${t.name}</h2>
          <div class="meta">
            <span class="tag \${t.variant}">\${t.variant}</span>
            <span class="tag">\${t.fonts}</span>
          </div>
        </div>
        <div class="iframe-wrap">
          <iframe src="\${t.path}" loading="lazy"></iframe>
        </div>
        <div class="card-footer">
          <a href="\${t.path}" target="_blank">Open full &rarr;</a>
          <a href="\${t.path}overview/" target="_blank">Overview</a>
          <span style="flex:1"></span>
          <span style="font-size:0.7rem;color:#3f3f46">text: \${t.text} | bg: \${t.bg}</span>
        </div>
      \`;
      grid.appendChild(card);
    });
  </script>
</body>
</html>
`;

writeFileSync(join(showcaseDir, 'index.html'), html);
console.log(`\nGenerated index.html with ${themes.length} themes.`);
