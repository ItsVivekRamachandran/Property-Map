const {chromium} = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright') : require('playwright');
const {spawn} = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');

(async () => {
  const root = path.resolve(__dirname, '..'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-shared-'));
  const server = spawn(process.env.PYTHON || 'python3', [root + '/server.py', '--port', '8004'], {
    env: {...process.env, PROPERTY_MAP_MODE: 'shared', PROPERTY_MAP_DATA: tmp, PROPERTY_MAP_ADMIN_EMAIL: 'admin@igt.com', PROPERTY_MAP_ADMIN_PASSWORD: 'strong-password-for-tests'},
    stdio: ['ignore', 'pipe', 'inherit']
  });
  await new Promise((resolve, reject) => {server.stdout.once('data', resolve); server.once('error', reject)});
  let browser;
  try {
    browser = await chromium.launch({executablePath: require('./chromium_path.cjs'), headless: true});
    const page = await browser.newPage({viewport: {width: 1280, height: 900}}), errors = [], apiRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {if(request.url().includes('/api/'))apiRequests.push(request.method()+' '+request.url())});
    const adminSignIn = async (username, password) => {
      await page.fill('#loginForm input[name=username]', username);
      await page.fill('#loginForm input[name=password]', password);
      await page.locator('#loginForm button[type=submit]').click();
    };
    const emailSignIn = async username => {
      await page.fill('#loginForm input[name=username]', username);
      await page.locator('#loginForm button[type=submit]').click();
    };
    await page.goto('http://127.0.0.1:8004/admin');
    await page.waitForSelector('#loginForm');
    await adminSignIn('admin', 'not-the-right-password');
    await page.waitForSelector('#loginForm .form-error');
    assert((await page.locator('.form-error').textContent()).includes('incorrect'), 'a wrong password is reported as such');
    assert.equal(await page.locator('#loginForm input[name=username]').inputValue(), 'admin', 'the form keeps what was typed');
    await adminSignIn('admin', 'strong-password-for-tests');
    await page.waitForSelector('#mapSvg .region');

    await page.locator('[data-view=team]').click();
    await page.waitForSelector('#userList table');
    await page.locator('[data-action=add-user]').click();
    await page.fill('#userForm input[name=name]', 'Viewer Person');
    await page.fill('#userForm input[name=username]', 'viewer');
    await page.fill('#userForm input[name=designation]', 'Reviewer');
    await page.fill('#userForm input[name=department]', 'Operations');
    const invalidBeforeSubmit = await page.locator('#userForm :invalid').evaluateAll(nodes => nodes.map(node => `${node.name}: ${node.validationMessage}`));
    assert.deepEqual(invalidBeforeSubmit, [], invalidBeforeSubmit.join('\n'));
    assert.equal(await page.locator('button[form=userForm]').count(), 1, 'account form has one submit button');
    assert.deepEqual(await page.locator('button[form=userForm]').evaluate(button => ({type: button.type, form: button.form?.getAttribute('id')})), {type: 'submit', form: 'userForm'});
    const createResponse = page.waitForResponse(response => response.url().endsWith('/api/users') && response.request().method() === 'POST');
    await page.locator('[form=userForm]').click();
    await page.waitForTimeout(500);
    assert.deepEqual(errors, [], 'account form has no page errors');
    assert(apiRequests.some(request => request.includes('POST') && request.endsWith('/api/users')), apiRequests.join('\n'));
    assert.equal((await createResponse).status(), 201, 'account creation succeeds');
    await page.waitForFunction(() => !document.querySelector('#overlay')?.textContent.trim() || document.querySelector('#userForm .form-error')?.textContent.trim() || !document.querySelector('#userForm')?.checkValidity());
    const invalid = await page.locator('#userForm :invalid').evaluateAll(nodes => nodes.map(node => `${node.name}: ${node.validationMessage}`));
    assert.deepEqual(invalid, [], invalid.join('\n'));
    assert.equal(await page.locator('#userForm .form-error').count(), 0, await page.locator('#overlay').textContent());
    await page.waitForFunction(() => document.querySelector('#userList')?.textContent.includes('viewer@igt.com'));
    await page.locator('[data-action=share]').first().click();
    await page.waitForSelector('#shareForm select');
    await page.selectOption('#shareForm select', 'viewer');
    await page.locator('[form=shareForm]').click();
    await page.waitForSelector('#overlay:empty', {state: 'attached'});
    await page.locator('[data-action=logout]').click();

    await page.waitForSelector('#loginForm');
    assert.equal(await page.locator('#loginForm input[name=password]').count(), 1, 'the admin URL shows a password field');
    await page.goto('http://127.0.0.1:8004/');
    await page.waitForSelector('#loginForm');
    assert.equal(await page.locator('#loginForm input[name=password]').count(), 0, 'the normal URL is email-only');
    await emailSignIn('viewer');
    await page.waitForSelector('#mapSvg .region');
    assert.equal(await page.locator('[data-view=team]').count(), 0, 'members do not see account management');
    assert.equal(await page.locator('.pagehead [data-action=property]').isDisabled(), true, 'viewers cannot add properties');
    await page.locator('[data-view=projects]').click();
    assert.equal(await page.locator('.project-card').count(), 2, 'the private workspace and granted shared project are listed');
    assert.deepEqual(errors, []);
    console.log('PASS: sign-in errors, account creation, project access grant, and viewer restrictions in the shared edition.');
  } finally {
    await browser?.close(); server.kill(); fs.rmSync(tmp, {recursive: true, force: true});
  }
})().catch(error => {console.error(error); process.exitCode = 1});
