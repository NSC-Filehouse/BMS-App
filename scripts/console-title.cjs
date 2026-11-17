'use strict';

// Only the Windows batch launcher opts in. NODE_OPTIONS passes this preload to
// npm, nodemon, Vite and their Node children, including restarted processes.
const title = process.env.BMS_CONSOLE_TITLE;

if (process.platform === 'win32' && title) {
  process.title = title;

  // npm assigns its own process.title after preloads have run. Ignore those
  // later assignments so it cannot replace the shared console's app name.
  Object.defineProperty(process, 'title', {
    configurable: true,
    enumerable: true,
    get: () => title,
    set: () => {},
  });
}
