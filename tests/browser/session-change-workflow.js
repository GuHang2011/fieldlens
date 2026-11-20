async (page) => {
  const ok = (value, message) => { if (!value) throw Error(message); };
  const context = page.context(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const userA = { id: 'session-a', username: 'inspector-a', name: '巡检员 A' };
  const userB = { id: 'session-b', username: 'inspector-b', name: '巡检员 B' };
  let currentUser = userA, healthRequests = 0, aiRequests = 0;
  await context.route('**/api/auth/session', route => route.fulfill({ json: { enabled: true, user: currentUser } }));
  await context.route('**/api/health', route => { healthRequests++; return route.fulfill({ json: { ready: false } }); });
  await context.route('**/api/assistant/status', route => route.fulfill({ json: { configured: true, provider: 'fixture', model: 'fixture' } }));
  await context.route('**/api/assistant', () => { aiRequests++; });
  await context.route('**/api/auth/logout', route => { currentUser = null; return route.fulfill({ json: { ok: true } }); });
  const details = await context.newPage(), other = await context.newPage();
  try {
    await page.goto('http://127.0.0.1:5176/#workspace');
    await page.locator('#sample-top').click();
    await page.locator('#save').click();
    await page.locator('#inspection-note').fill('工作台尚未保存的巡检备注');
    await details.goto('http://127.0.0.1:5176/#history');
    await details.locator('[data-details]').click();
    await details.locator('#record-notes').fill('详情尚未保存的复核备注');
    await details.locator('[data-detail-tab="ai"]').click();
    await details.locator('#ai-question').fill('保留这条尚未完成的 AI 问题');
    await details.locator('#ai-check').click();
    await details.waitForFunction(() => !document.querySelector('#ai-send').disabled);
    await details.locator('#ai-send').click();
    await details.waitForFunction(() => !document.querySelector('#ai-cancel').hidden);
    await other.goto('http://127.0.0.1:5176/#workspace');
    other.once('dialog', dialog => dialog.accept());
    const historyBefore = await page.evaluate(() => localStorage.getItem('fieldlens.history.user.session-a'));
    await other.locator('#logout').click();
    await other.locator('#login-form').waitFor();
    await page.locator('.session-change-notice').waitFor();
    await details.locator('#ai-error').waitFor({ state: 'visible' });
    ok(await page.locator('#inspection-note').inputValue() === '工作台尚未保存的巡检备注', 'foreign logout preserves workspace draft');
    ok(await page.locator('#specimen').count() === 1, 'foreign logout preserves current image');
    ok(await details.locator('#record-notes').inputValue() === '详情尚未保存的复核备注', 'foreign logout preserves open detail draft');
    ok(await details.locator('#ai-question').inputValue() === '保留这条尚未完成的 AI 问题', 'foreign logout preserves AI question');
    ok((await details.locator('#ai-error').textContent()).includes('账号'), 'pending AI request stops with a readable account-change message');
    await page.locator('#save').click();
    ok(await page.evaluate(() => localStorage.getItem('fieldlens.history.user.session-a')) === historyBefore, 'invalidated workspace cannot write old account history');
    await details.locator('[data-detail-tab="review"]').click();
    await details.locator('#save-review').click();
    ok(await details.locator('#record-dialog').isVisible(), 'failed detail write preserves the editor');
    ok(await page.evaluate(() => localStorage.getItem('fieldlens.history.user.session-a')) === historyBefore, 'invalidated detail cannot write history');
    const requestsBefore = healthRequests;
    const blocked = await page.evaluate(async () => {
      const { apiFetch } = await import('/src/access.js');
      try { await apiFetch('/api/health'); return ''; } catch (error) { return error.message; }
    });
    ok(blocked.includes('账号') && healthRequests === requestsBefore, 'new service requests are blocked before reaching the network');
    ok(aiRequests === 1, 'pending request is not automatically retried under another account');
    page.once('dialog', dialog => dialog.dismiss());
    await page.locator('[data-session-refresh]').click();
    ok(await page.locator('#inspection-note').inputValue() === '工作台尚未保存的巡检备注', 'cancel refresh retains draft');
    const download = page.waitForEvent('download');
    await page.locator('#export').click();
    let exported = ''; const stream = await (await download).createReadStream();
    for await (const chunk of stream) exported += chunk.toString();
    ok(JSON.parse(exported).notes === '工作台尚未保存的巡检备注', 'invalidated draft can still be exported');
    await page.locator('[data-view="history"]').click();
    ok(await page.locator('.session-change-notice').count() === 1, 'notice persists across route changes without duplication');
    ok((await page.locator('.account-label').textContent()).includes('巡检员 A'), 'old draft keeps its original account label');
    await page.locator('[data-view="workspace"]').click();
    ok(await page.locator('#inspection-note').inputValue() === '工作台尚未保存的巡检备注', 'route change retains the invalidated workspace draft');
    currentUser = userB;
    page.once('dialog', dialog => dialog.accept());
    await page.locator('[data-session-refresh]').click();
    await page.waitForFunction(() => document.querySelector('.account-label')?.textContent.includes('巡检员 B'));
    ok(await page.locator('.session-change-notice').count() === 0, 'explicit refresh resets the invalidation state');
    await page.locator('[data-view="history"]').click();
    ok(await page.locator('[data-details]').count() === 0, 'new account does not inherit the old account records');
    ok(await page.evaluate(() => localStorage.getItem('fieldlens.history.user.session-a')) === historyBefore, 'old account records are retained in their original space');
    const transport = await page.evaluate(async () => {
      const { apiFetch, createAccess } = await import('/src/access.js');
      const staticAccess = createAccess(false);
      staticAccess.invalidateSession();
      const staticStatus = (await apiFetch('/api/health')).status;
      const originalFetch = window.fetch;
      let finish;
      window.fetch = () => new Promise(resolve => { finish = resolve; });
      try {
        const result = apiFetch('/api/delayed-fixture').then(() => 'accepted', error => error.message);
        createAccess(true).invalidateSession();
        finish(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
        return { staticChanged: staticAccess.sessionChanged, staticStatus, delayed: await result };
      } finally { window.fetch = originalFetch; }
    });
    ok(!transport.staticChanged && transport.staticStatus === 200, 'static access ignores invalidation without blocking requests');
    ok(transport.delayed.includes('账号'), 'response headers resolving after invalidation cannot be accepted');
    const staticContext = await context.browser().newContext();
    try {
      const staticPage = await staticContext.newPage(), staticOther = await staticContext.newPage();
      await staticPage.goto('http://127.0.0.1:4176/#workspace');
      await staticPage.locator('#sample-top').click();
      await staticPage.locator('#inspection-note').fill('公开演示不受账号通知影响');
      await staticOther.goto('http://127.0.0.1:4176/#home');
      let navigations = 0;
      staticPage.on('framenavigated', frame => { if (frame === staticPage.mainFrame()) navigations++; });
      await staticOther.evaluate(() => localStorage.setItem('fieldlens.auth.changed', crypto.randomUUID()));
      await staticPage.waitForLoadState('networkidle');
      ok(navigations === 0, 'static showcase does not reload for an auth marker');
      ok(await staticPage.locator('.session-change-notice').count() === 0, 'static showcase is not frozen');
      ok(await staticPage.locator('#inspection-note').inputValue() === '公开演示不受账号通知影响', 'static draft survives unrelated auth markers');
      await staticPage.locator('#save').click();
      ok(await staticPage.evaluate(() => JSON.parse(localStorage.getItem('fieldlens.history')).some(record => record.notes === '公开演示不受账号通知影响')), 'static draft remains saveable');
    } finally { await staticContext.close(); }
    ok(!errors.length, errors.join('; '));
    return 'PASS: foreign session changes preserve workspace/detail/AI drafts, abort pending and block new requests and writes, permit export, and switch accounts only after confirmed refresh';
  } finally {
    await details.close();
    await other.close();
  }
}
