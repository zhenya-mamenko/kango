import { defineConfig } from 'vite';
import { resolve } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig(({ mode }) => ({
  plugins: [
    viteStaticCopy({
      targets: [
        { src: 'manifest.json', dest: resolve(__dirname, 'dist') },
        { src: 'templates/sidebar.html', dest: resolve(__dirname, 'dist') },
        { src: 'src/sortable.js', dest: resolve(__dirname, 'dist') },
        { src: 'icons/*', dest: resolve(__dirname, 'dist/icons') },
        { src: '_locales/*', dest: resolve(__dirname, 'dist/_locales') }
      ]
    })
  ],
  build: {
    outDir: 'dist-es',
    target: 'es2020',
    minify: mode === 'production' ? 'esbuild' : false,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background.ts'),
        content: resolve(__dirname, 'src/content.ts'),
        sidebar: resolve(__dirname, 'src/sidebar.ts')
      },
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
        manualChunks: undefined
      }
    }
  }
}));
