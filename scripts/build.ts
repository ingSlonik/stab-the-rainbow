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

  // 4. Crush with Roadroller
  console.log('\n🛞 Step 4: Crushing with Roadroller...');
  const jsPacker = new Packer(
    [
      {
        data: minifiedJs,
        type: 'js' as any,
        action: 'eval' as any,
      },
    ],
    {
      allowFreeVars: true,
      dynamicModels: 1,
    }
  );

  await jsPacker.optimize(3);
  const { firstLine, secondLine } = jsPacker.makeDecoder();
  const roadrolledJs = firstLine + secondLine;
  console.log(`   Roadroller JS size: ${(roadrolledJs.length / 1024).toFixed(2)} KB (${roadrolledJs.length} bytes)`);

  // 5. Process index.html into dist/index.html
  console.log('\n📄 Step 5: Processing index.html into dist/index.html...');
  const indexHtmlRaw = fs.readFileSync('index.html', 'utf8');

  // Replace external CSS stylesheet link with inlined minified CSS
  const htmlWithCss = indexHtmlRaw.replace(
    /<link\b[^>]*\brel=["']stylesheet["'][^>]*\/?>|<link\b[^>]*\bhref=["'][^"']*style\.css["'][^>]*\/?>/i,
    `<style>${minifiedCss}</style>`
  );

  // Replace module script with roadrolled JS
  const roadrolledHtmlRaw = htmlWithCss.replace(
    /<script\b[^>]*\bsrc=["'][^"']*game\.ts["'][^>]*>\s*<\/script>/i,
    `<script>${roadrolledJs}</script>`
  );

  const finalHtml = await minifyHtml(roadrolledHtmlRaw, {
    collapseWhitespace: true,
    removeComments: true,
    removeAttributeQuotes: true,
    collapseBooleanAttributes: true,
    removeRedundantAttributes: true,
    removeEmptyAttributes: true,
  });

  const htmlDistPath = path.join(distDir, 'index.html');
  fs.writeFileSync(htmlDistPath, finalHtml, 'utf8');
  const htmlSize = fs.statSync(htmlDistPath).size;
  console.log(`   dist/index.html size: ${(htmlSize / 1024).toFixed(2)} KB (${htmlSize} bytes)`);

  // Also write uncompressed version for easy debugging
  const debugHtmlRaw = htmlWithCss.replace(
    /<script\b[^>]*\bsrc=["'][^"']*game\.ts["'][^>]*>\s*<\/script>/i,
    `<script>${minifiedJs}</script>`
  );
  fs.writeFileSync(path.join(distDir, 'index_debug.html'), debugHtmlRaw, 'utf8');

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
