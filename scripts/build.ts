import * as esbuild from 'esbuild';
import { minify as minifyJs } from 'terser';
import { minify as minifyHtml } from 'html-minifier-terser';
import { Packer } from 'roadroller';
import * as csso from 'csso';
import ect from 'ect-bin';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import process from 'node:process';

const JS13K_LIMIT_BYTES = 13312;

function getInternalPropertiesToMangle(): RegExp {
  const reserved = new Set([
    'camera', 'scene', 'renderer', 'root', 'x', 'y', 'z', 'vx', 'vy', 'vz',
    'speed', 'score', 'combo', 'state', 'width', 'height', 'action', 'id', 'w', 'h',
    'color', 'type', 'time', 'dt', 'name', 'life', 'active', 'length', 'target',
    'constructor', 'setup', 'loop', 'update', 'reset', 'init', 'tick', 'push', 'pop',
    'map', 'filter', 'slice', 'find', 'indexOf', 'includes', 'forEach', 'sort',
    'position', 'rotation', 'quaternion', 'scale', 'matrixWorld', 'visible',
    'renderOrder', 'geometry', 'material', 'opacity', 'transparent', 'depthWrite',
    'depthTest', 'side', 'object3D', 'el', 'xrSession', 'inputSources', 'gamepad',
    'buttons', 'axes', 'pressed', 'value', 'handedness',
    'async', 'static', 'roundRect'
  ]);

  const safeInternal = new Set<string>();
  const srcDir = path.resolve('src');
  const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts'));

  for (const f of files) {
    const content = fs.readFileSync(path.join(srcDir, f), 'utf8');
    const matches = content.matchAll(/(?:private|public|readonly)\s+(?:async\s+|static\s+)?([a-zA-Z0-9_$]+)/g);
    for (const m of matches) {
      const name = m[1];
      if (!reserved.has(name) && name.length > 2 && !name.startsWith('THREE')) {
        safeInternal.add(name);
      }
    }
  }

  return new RegExp('^(' + Array.from(safeInternal).join('|') + ')$');
}

async function build() {
  console.log('🌈 Starting Stab the Rainbow JS13k build...');
  const startTime = Date.now();

  const distDir = path.resolve('dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // 1. Bundle TypeScript to JavaScript with esbuild
  console.log('\n📦 Step 1: Bundling TypeScript with esbuild...');
  const bundleResult = await esbuild.build({
    entryPoints: ['src/game.ts'],
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2022',
    treeShaking: true,
    legalComments: 'none',
    minify: true,
  });

  const bundledJs = bundleResult.outputFiles[0].text;
  console.log(`   Bundle size: ${(bundledJs.length / 1024).toFixed(2)} KB (${bundledJs.length} bytes)`);

  // 2. Minify JavaScript with Terser
  console.log('\n⚡ Step 2: Minifying JavaScript with Terser...');
  const terserResult = await minifyJs(bundledJs, {
    ecma: 2022,
    compress: {
      passes: 15,
      unsafe: true,
      unsafe_math: true,
      unsafe_arrows: true,
      unsafe_methods: true,
      pure_getters: true,
      drop_console: true,
      booleans_as_integers: true,
      collapse_vars: true,
      reduce_vars: true,
      evaluate: true,
      hoist_funs: true,
      hoist_vars: true,
      inline: 3,
      loops: true,
      toplevel: true,
      keep_fargs: false,
    },
    mangle: {
      toplevel: true,
      properties: {
        regex: getInternalPropertiesToMangle(),
      },
    },
    format: {
      comments: false,
    },
  });

  const minifiedJs = terserResult.code || '';
  console.log(`   Terser JS size: ${(minifiedJs.length / 1024).toFixed(2)} KB (${minifiedJs.length} bytes)`);

  // 3. Minify CSS with CSSO
  console.log('\n🎨 Step 3: Minifying CSS with CSSO...');
  const rawCss = fs.readFileSync('src/style.css', 'utf8');
  const cssoResult = csso.minify(rawCss, {
    restructure: true,
    comments: false,
  });
  const minifiedCss = cssoResult.css;
  console.log(`   CSS size: ${(rawCss.length / 1024).toFixed(2)} KB -> ${(minifiedCss.length / 1024).toFixed(2)} KB (${minifiedCss.length} bytes)`);

  // 4. Process and minify full HTML (inlining CSS & JS)
  console.log('\n📄 Step 4: Processing full index.html with inlined CSS & JS...');
  const indexHtmlRaw = fs.readFileSync('index.html', 'utf8');

  // Replace external CSS stylesheet link with inlined minified CSS
  const htmlWithCss = indexHtmlRaw.replace(
    /<link\b[^>]*\brel=["']stylesheet["'][^>]*\/?>|<link\b[^>]*\bhref=["'][^"']*style\.css["'][^>]*\/?>/i,
    `<style>${minifiedCss}</style>`
  );

  // Replace module script with minified JS
  const fullHtmlRaw = htmlWithCss.replace(
    /<script\b[^>]*\bsrc=["'][^"']*game\.ts["'][^>]*>\s*<\/script>/i,
    `<script>${minifiedJs}</script>`
  );

  // Also write uncompressed version for easy debugging
  fs.writeFileSync(path.join(distDir, 'index_debug.html'), fullHtmlRaw, 'utf8');

  const minifiedFullHtml = await minifyHtml(fullHtmlRaw, {
    collapseWhitespace: true,
    removeComments: true,
    removeAttributeQuotes: true,
    collapseBooleanAttributes: true,
    removeRedundantAttributes: true,
    removeEmptyAttributes: true,
  });
  console.log(`   Full HTML size: ${(fullHtmlRaw.length / 1024).toFixed(2)} KB -> ${(minifiedFullHtml.length / 1024).toFixed(2)} KB (${minifiedFullHtml.length} bytes)`);

  // 5. Crush entire HTML with Roadroller
  console.log('\n🛞 Step 5: Crushing full HTML with Roadroller...');
  const htmlPacker = new Packer(
    [
      {
        data: minifiedFullHtml,
        type: 'text' as any,
        action: 'write' as any,
      },
    ],
    {
      allowFreeVars: true,
      dynamicModels: 1,
    }
  );

  await htmlPacker.optimize(3);
  const { firstLine, secondLine } = htmlPacker.makeDecoder();
  const roadrolledJs = firstLine + secondLine;
  console.log(`   Roadroller decoder size: ${(roadrolledJs.length / 1024).toFixed(2)} KB (${roadrolledJs.length} bytes)`);

  const finalHtml = `<script>${roadrolledJs}</script>`;
  const htmlDistPath = path.join(distDir, 'index.html');
  fs.writeFileSync(htmlDistPath, finalHtml, 'utf8');
  const htmlSize = fs.statSync(htmlDistPath).size;
  console.log(`   dist/index.html size: ${(htmlSize / 1024).toFixed(2)} KB (${htmlSize} bytes)`);

  // 6. Compress with ECT for maximum ZIP compression
  console.log('\n🗜️ Step 6: Compressing archive with ECT (max compression)...');
  const zipName = 'stab-the-rainbow.zip';
  const zipPath = path.join(distDir, zipName);

  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  execFileSync(ect, ['-9', '-strip', '-zip', zipName, 'index.html'], {
    cwd: distDir,
    stdio: 'pipe',
  });

  const zipSize = fs.statSync(zipPath).size;
  const remainingBytes = JS13K_LIMIT_BYTES - zipSize;
  const percentUsed = ((zipSize / JS13K_LIMIT_BYTES) * 100).toFixed(2);
  const elapsedMs = Date.now() - startTime;

  // Print Summary
  console.log('\n======================================================');
  console.log(`🎉 BUILD FINISHED in ${elapsedMs}ms`);
  console.log('------------------------------------------------------');
  console.log(`📦 Final ZIP File : dist/${zipName}`);
  console.log(`📊 Size           : ${zipSize.toLocaleString()} bytes (${(zipSize / 1024).toFixed(2)} KB)`);
  console.log(`🎯 JS13k Limit    : ${JS13K_LIMIT_BYTES.toLocaleString()} bytes (13 KB)`);
  console.log(`📈 Limit Usage    : ${percentUsed}% (${remainingBytes.toLocaleString()} bytes remaining)`);
  console.log('------------------------------------------------------');
  if (zipSize <= JS13K_LIMIT_BYTES) {
    console.log(`✅ SUCCESS: Build is ${(remainingBytes).toLocaleString()} bytes UNDER the JS13k limit!`);
  } else {
    console.warn(`⚠️ WARNING: Build EXCEEDS JS13k limit by ${(zipSize - JS13K_LIMIT_BYTES).toLocaleString()} bytes!`);
  }
  console.log('======================================================\n');
}

build().catch((err) => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
