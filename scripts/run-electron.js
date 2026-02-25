const { spawn } = require('child_process');
const isWSL = process.platform === 'linux';

const env = {
  ...process.env,
  NODE_ENV: 'development',
  ...(isWSL && {
    DISPLAY: process.env.DISPLAY || ':0',
    WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY || 'wayland-0',
  }),
};

spawn('electron', ['.', '--no-sandbox'], { env, stdio: 'inherit', shell: true });
