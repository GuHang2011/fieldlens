async (page) => {
  const ok = (value, message) => { if (!value) throw Error(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  let signedIn = true, response, requests = 0;
  await page.route('**/api/auth/session', route => route.fulfill({ json: { enabled: true, user: signedIn ? { id: 'fixture-logout', username: 'inspector', name: '测试巡检员' } : null } }));
  await page.route('**/api/health', route => route.fulfill({ json: { ready: false } }));
  await page.route('**/api/auth/logout', async route => {
    requests++;
    if (response === 'network') return route.abort('failed');
    if (response === 'timeout') return;
    if (response === 'success') {
      signedIn = false;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill(response);
  });
  await page.goto('http://127.0.0.1:5176/#workspace');
  await page.locator('#sample-top').click();
  await page.locator('#inspection-note').fill('退出失败后保留这段未保存内容');
  const before = await page.evaluate(() => localStorage.getItem('fieldlens.auth.changed'));
  const failures = [
    { status: 200, contentType: 'text/html', body: '<!doctype html><h1>Proxy fallback</h1>' },
    ...[null, [], {}, { ok: false }, { ok: 'true' }].map(value => ({ status: 200, contentType: 'application/json', body: JSON.stringify(value) })),
    ...[401, 503].map(status => ({ status, contentType: 'application/json', body: JSON.stringify({ error: 'upstream fixture error' }) })),
    'network', 'timeout',
  ];
  for (const failure of failures) {
    response = failure;
    await page.evaluate(() => { document.querySelector('#toast').hidden = true; });
    const count = requests;
    await page.locator('#logout').click();
    await page.locator('#toast').waitFor({ state: 'visible', timeout: 10000 });
    const message = await page.locator('#toast').textContent();
    ok(/[\u4e00-\u9fff]/.test(message), `logout error should be readable Chinese: ${message}`);
    ok(!/Unexpected|Failed to fetch|upstream fixture|Cannot read/.test(message), 'raw network and parser errors are not exposed');
    ok(new URL(page.url()).hash === '#workspace', 'failed logout preserves the current page');
    ok((await page.locator('.account-label').textContent()).includes('测试巡检员'), 'failed logout preserves current account display');
    ok(await page.locator('#inspection-note').inputValue() === '退出失败后保留这段未保存内容', 'failed logout preserves unsaved input');
    ok(await page.evaluate(() => localStorage.getItem('fieldlens.auth.changed')) === before, 'failed logout does not notify another tab of a session change');
    ok(!await page.locator('#logout').isDisabled(), 'logout can be retried');
    ok(requests === count + 1, 'one click sends one logout request');
  }
  response = 'success';
  await page.locator('#logout').click();
  await page.locator('#login-form').waitFor();
  ok(new URL(page.url()).hash === '#login', 'confirmed logout opens login');
  ok(await page.evaluate(() => localStorage.getItem('fieldlens.auth.changed')) !== before, 'confirmed logout notifies other tabs');
  ok(!errors.length, errors.join('; '));
  return 'PASS: malformed and failed logout responses preserve page, account and draft; Chinese errors permit retry; confirmed JSON success logs out';
}
