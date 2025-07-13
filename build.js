import esbuild from 'esbuild';
import fs from 'fs/promises';

const args = process.argv.slice(2);
const isMinify = args.includes('--minify');

const files = ['background', 'content', 'sidebar'];

for (const file of files) {
  await esbuild.build({
    entryPoints: [`dist-es/${file}.js`],
    outfile: `dist/${file}.js`,
    bundle: true,
    format: 'iife',
    globalName: file.charAt(0).toUpperCase() + file.slice(1),
    minify: isMinify,
    target: 'es2020'
  });
}

await fs.rm('dist-es', { recursive: true, force: true });
