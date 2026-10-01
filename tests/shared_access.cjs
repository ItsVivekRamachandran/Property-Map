const {chromium} = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright') : require('playwright');
const {spawn} = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');

(async () => {
  const root = path.resolve(__dirname, '..'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-shared-'));
  const server = spawn(process.env.PYTHON || 'python3', [root + '/server.py', '--port', '8004'], {
    env: {...process.env, PROPERTY_MAP_MODE: 'shared', PROPERTY_MAP_DATA: tmp, PROPERTY_MAP_ADMIN_EMAIL: 'admin@test.org', PROPERTY_MAP_ADMIN_PASSWORD: 'strong-password-for-tests'},
    stdio: ['ignore', 'pipe', 'inherit']
  });
  await new Promise((resolve, reject) => {server.stdout.once('data', resolve); server.once('error', reject)});
  let browser;
  try {
    browser = await chromium.launch({executablePath: require('./chromium_path.cjs'), headless: true});
    const page = await browser.newPage({viewport: {width: 1280, height: 900}}), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const signIn = async (email, password) => {
      await page.fill('#loginForm input[name=email]', email);
      await page.fill('#loginForm input[name=password]', password);
      await page.locator('#loginForm button[type=submit]').click();
    };
    await page.goto('http://127.0.0.1:8004');
    await page.waitForSelector('#loginForm');
    await signIn('admin@test.org', 'not-the-right-password');
    await page.waitForSelector('#loginForm .form-error');
    assert((await page.locator('.form-error').textContent()).includes('incorrect'), 'a wrong password is reported as such');
    assert.equal(await page.locator('#loginForm input[name=email]').inputValue(), 'admin@test.org', 'the form keeps what was typed');
    await signIn('admin@test.org', 'strong-password-for-tests');
    await page.waitForSelector('#mapSvg .region');

    await page.locator('[data-view=team]').click();
    await page.waitForSelector('#userList table');
    await page.locator('[data-action=add-user]').click();
    await page.fill('#userForm input[name=name]', 'Viewer Person');
    await page.fill('#userForm input[name=email]', 'viewer@test.org');
    await page.fill('#userForm input[name=password]', 'viewer-long-password');
    await page.locator('[form=userForm]').click();
    await page.waitForSelector('#overlay:empty', {state: 'attached'});
    await page.waitForFunction(() => document.querySelector('#userList')?.textContent.includes('viewer@test.org'));
    await page.locator('[data-action=share]').first().click();
    await page.waitForSelector('#shareForm select');
    await page.selectOption('#shareForm select', 'viewer');
    await page.locator('[form=shareForm]').click();
    await page.waitForSelector('#overlay:empty', {state: 'attached'});
    await page.locator('[data-action=logout]').click();

    await page.waitForSelector('#loginForm');
    await signIn('viewer@test.org', 'viewer-long-password');
    await page.waitForSelector('#mapSvg .region');
    assert.equal(await page.locator('[data-view=team]').count(), 0, 'members do not see account management');
    assert.equal(await page.locator('.pagehead [data-action=property]').isDisabled(), true, 'viewers cannot add properties');
    await page.locator('[data-view=projects]').click();
    assert.equal(await page.locator('.project-card').count(), 1, 'only the shared project is listed');
    assert.deepEqual(errors, []);
    console.log('PASS: sign-in errors, account creation, project access grant, and viewer restrictions in the shared edition.');
  } finally {
    await browser?.close(); server.kill(); fs.rmSync(tmp, {recursive: true, force: true});
  }
})().catch(error => {console.error(error); process.exitCode = 1});
