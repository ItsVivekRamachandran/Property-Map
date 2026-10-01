// Chromium for the browser suites: CHROMIUM_PATH if set, else the sandbox build if present, else Playwright's own download.
const fs = require('fs');
const sandbox = '/tmp/pm-chromium/chromium';
module.exports = process.env.CHROMIUM_PATH || (fs.existsSync(sandbox) ? sandbox : undefined);
