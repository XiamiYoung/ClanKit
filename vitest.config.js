import { defineConfig, mergeConfig } from 'vitest/config'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import viteConfig from './vite.config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Vitest-specific config — extends vite.config.js (so Vue / @ alias still work)
// but stubs the `electron` module so Node-side tests never trigger
// node_modules/electron/index.js's getElectronPath(). That path requires the
// electron binary to be unpacked at node_modules/electron/dist/, which the
// Windows GH runner has been failing to install (see ci.yml history).
//
// Test files keep their own per-test mocks for any electron API they actually
// exercise; this stub only needs to satisfy module-load-time destructuring
// (`const { ipcMain } = require('electron')`, `const { app } = require('electron')`, ...).
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // Hook Module.prototype.require BEFORE every test file's top-level body
      // so `require('electron')` is intercepted regardless of whether it goes
      // through Vitest's transformer, Node's native CJS loader, or a
      // test-file-level `createRequire(import.meta.url)`. The resolve.alias
      // below alone is not enough — createRequire bypasses it.
      setupFiles: [resolve(__dirname, 'test/setup-electron-stub.cjs')],
    },
    resolve: {
      alias: {
        // Must come BEFORE any other 'electron' resolution. Real electron's
        // top-level index.js asserts the binary is present and throws if not.
        electron: resolve(__dirname, 'test/electron-stub.cjs'),
      },
    },
  }),
)
