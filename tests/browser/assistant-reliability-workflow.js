async (page) => {
  const ok = (value, message) => { if (!value) throw Error(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/auth/session', route => route.fulfill({ json: { enabled: false, user: null } }));
  await page.route('**/api/health', route => route.fulfill({ json: { ready: false } }));
  await page.route('**/api/assistant/status', route => route.fulfill({ json: { configured: true, provider: 'fixture', model: 'fixture' } }));
  let response = { status: 200, contentType: 'application/json', body: JSON.stringify({ text: '基于旧备注的测试回答', provider: 'fixture', model: 'fixture' }) };
  await page.route('**/api/assistant', route => route.fulfill(response));
  await page.goto('http://127.0.0.1:5176/#workspace');
  await page.locator('#sample-top').click();
  await page.locator('#inspection-note').fill('第一版备注');
  await page.locator('#save').click();
  await page.locator('[data-view="history"]').click();
  await page.locator('[data-details]').click();
  await page.locator('[data-detail-tab="ai"]').click();
  await page.locator('#ai-check').click();
  await page.waitForFunction(() => !document.querySelector('#ai-send').disabled);
  await page.locator('#ai-send').click();
  await page.locator('#ai-answer').waitFor({ state: 'visible' });
  const download = page.waitForEvent('download');
  await page.locator('#ai-export').click();
  const stream = await (await download).createReadStream();
  let text = ''; for await (const chunk of stream) text += chunk.toString();
  ok(text.includes('基于旧备注的测试回答') && text.includes('第一版备注'), 'answer export identifies its actual input snapshot');
  await page.locator('[data-detail-tab="review"]').click();
  await page.locator('#record-notes').fill('第二版备注');
  await page.locator('[data-detail-tab="ai"]').click();
  await page.getByText('发送内容预览', { exact: true }).click();
  await page.locator('#ai-refresh').click();
  ok(JSON.parse(await page.locator('#ai-payload').textContent()).notes === '第二版备注', 'preview refresh reads the current draft');
  ok(await page.locator('#ai-answer').isHidden(), 'refresh hides the answer for the old snapshot');
  ok(await page.locator('#ai-export').isDisabled(), 'refresh disables export of the discarded answer');
  ok(await page.locator('#ai-text').textContent() === '', 'refresh removes the stale answer text');
  const malformed = [
    { status: 502, contentType: 'text/html', body: '<!doctype html><h1>Bad Gateway</h1>' },
    ...[null, [], {}, { text: '' }, { text: 'missing attribution' }].map(value => ({ status: 200, contentType: 'application/json', body: JSON.stringify(value) })),
    { status: 502, contentType: 'application/json', body: JSON.stringify({ error: { internal: 'fixture detail' } }) },
  ];
  for (const invalid of malformed) {
    response = invalid;
    await page.locator('#ai-send').click();
    await page.locator('#ai-error').waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector('#ai-send').disabled);
    const message = await page.locator('#ai-error').textContent();
    ok(/[\u4e00-\u9fff]/.test(message), `invalid response receives a readable Chinese error: ${message}`);
    ok(!/Unexpected|Cannot read|\[object Object\]|fixture detail/.test(message), 'internal parser errors are not shown to the user');
    ok(await page.locator('#ai-answer').isHidden(), 'invalid response cannot show an answer');
    ok(await page.locator('#ai-export').isDisabled(), 'invalid response cannot export stale output');
    response = { status: 200, contentType: 'application/json', body: JSON.stringify({ text: '重试后的有效回答', provider: 'fixture', model: 'fixture' }) };
    await page.locator('#ai-send').click();
    await page.locator('#ai-answer').waitFor({ state: 'visible' });
    ok(await page.locator('#ai-text').textContent() === '重试后的有效回答', 'retry succeeds after an invalid response');
  }
  await page.locator('#save-review').click();
  await page.locator('[data-view="assistant"]').click();
  await page.locator('#helper-tab-platform').click();
  await page.locator('#ai-check').click();
  await page.waitForFunction(() => !document.querySelector('#ai-send').disabled);
  response = { status: 503, contentType: 'text/html', body: '<h1>Service unavailable</h1>' };
  await page.locator('#ai-send').click();
  await page.locator('#ai-error').waitFor({ state: 'visible' });
  ok(/[\u4e00-\u9fff]/.test(await page.locator('#ai-error').textContent()), 'standalone helper uses the same readable error handling');
  ok(!errors.length, errors.join('; '));
  return 'PASS: fresh snapshot clears stale answer/export, malformed and proxy responses receive Chinese errors, every failure can be retried, helper shares reliable handling';
}
