import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// Strip [vite] connecting/connected/hot-updated console noise from browser console
function silenceViteClientLogs() {
  return {
    name: 'silence-vite-client-logs',
    transform(code, id) {
      if (!id.includes('vite/dist/client')) return
      return code
        .replace(/console\.debug\("\[vite\] connecting\.\.\."\);?/g, '')
        .replace(/console\.debug\(`\[vite\] connected\.`\);?/g, '')
        .replace(/console\.debug\(`\[vite\] (css )?hot updated:[^`]*`\);?/g, '')
        .replace(/this\.logger\.debug\(`\[vite\] hot updated:[^`]*`\);?/g, '')
    }
  }
}

export default defineConfig({
  plugins: [silenceViteClientLogs(), vue({
    template: {
      compilerOptions: {
        isCustomElement: tag => tag === 'webview'
      }
    }
  })],
  base: './',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        passes: 2
      },
      mangle: {
        properties: {
          regex: /^_/
        }
      },
      format: {
        comments: false
      }
    },
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  },
  server: {
    port: 5173,
    strictPort: true
  }
})
