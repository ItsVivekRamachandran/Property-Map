const {chromium} = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright') : require('playwright');
const assert = require('assert'), path = require('path');
(async () => {
  const browser = await chromium.launch({executablePath: require('./chromium_path.cjs'), headless: true});
  try {
    const page = await browser.newPage();
    await page.goto('file://' + path.resolve(__dirname, '../Property-Map.html'));
    await page.waitForSelector('#mapSvg .region');
    const result = await page.evaluate(async () => {
      const before = await api('/api/bootstrap'), p = before.projects[0], failures = [];
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function () {throw new DOMException('Full', 'QuotaExceededError')};
      try {
        for (const [url, method, body] of [
          ['/api/projects/' + p.id, 'PUT', {...p, name: 'Should not persist'}],
          ['/api/projects', 'POST', {...p, name: 'Unsaved project'}],
          ['/api/projects/' + p.id, 'DELETE'],
          ['/api/config', 'PUT', {...before.config, accountName: 'Unsaved account'}],
          ['/api/import', 'POST', {projects: [p]}]
        ]) {
          let rejected = false;
          try {await api(url, method, body)} catch (e) {rejected = e.message.includes('storage')}
          const after = await api('/api/bootstrap');
          failures.push({rejected, unchanged: JSON.stringify(after) === JSON.stringify(before)});
        }
      } finally {Storage.prototype.setItem = original}
      await api('/api/projects/' + p.id, 'PUT', {...p, name: 'Successful retry'});
      const saved = await api('/api/bootstrap');
      const originalApi = api;
      let settingsUpdated, userUpdated;
      try {
        S.modeServer = 'shared';
        const response = {...clone(S), config: {...clone(S.config), accountName: 'Remote update'}, user: {...S.user, name: 'Remote profile'}, mode: 'shared'};
        api = async () => response;
        await syncUpdates();
        settingsUpdated = S.config.accountName === 'Remote update';
        userUpdated = S.user.name === 'Remote profile';
      } finally {api = originalApi; S.modeServer = 'browser-preview'}
      return {failures, retry: saved.projects[0].name, settingsUpdated, userUpdated};
    });
    assert(result.failures.every(x => x.rejected && x.unchanged), JSON.stringify(result));
    assert.equal(result.retry, 'Successful retry');
    assert(result.settingsUpdated && result.userUpdated, 'sync applies settings and profile changes without project version changes');
    console.log('PASS: failed offline writes leave state unchanged, retries succeed, and shared settings/profile changes refresh.');
  } finally {await browser.close()}
})().catch(error => {console.error(error); process.exitCode = 1});
