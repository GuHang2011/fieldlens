async (page) => {
  const ok = (value, message) => { if (!value) throw Error(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/auth/session', route => route.fulfill({json:{enabled:false,user:null}}));
  let response = {ready:false};
  await page.route('**/api/health', route => route.fulfill({json:response}));
  await page.goto('http://127.0.0.1:5176/#workspace');
  await page.locator('.connection').filter({hasText:'尚未配置模型'}).waitFor();
  await page.locator('#sample-top').click();
  await page.locator('.sample-details > summary').click();
  const date = page.locator('[data-sample="collectedAt"]');
  await date.fill('2026-11-20T09:30');
  await date.focus();await date.press('ArrowLeft');await date.press('Backspace');
  ok(await date.evaluate(el => el.validity.badInput), 'partial date fixture');
  await page.locator('#workspace-crop').fill('尚未保存的作物名称');
  await page.locator('#inspection-note').fill('检查连接时保留备注');
  const dateHandle = await date.elementHandle();
  response = {ready:true,model:'crop-service'};
  await page.locator('#refresh-status').click();
  await page.locator('.connection').filter({hasText:'crop-service'}).waitFor();
  ok(await dateHandle.evaluate(el => el.isConnected), 'service refresh must not replace the active sample form');
  ok(await date.evaluate(el => el.validity.badInput), 'service refresh preserves incomplete collection time');
  ok(await page.locator('#workspace-crop').inputValue() === '尚未保存的作物名称', 'service refresh preserves fields typed while date is incomplete');
  ok(await page.locator('.sample-details').evaluate(el => el.open), 'service refresh keeps sample fields expanded');
  ok(await page.locator('#inspection-note').inputValue() === '检查连接时保留备注', 'service refresh retains notes');
  await date.fill('2026-11-20T10:00');
  await page.locator('#save').click();
  const records = await page.evaluate(() => JSON.parse(localStorage.getItem('fieldlens.history')));
  ok(records[0].sample.crop === '尚未保存的作物名称', 'corrected sample saves retained text');
  await page.locator('#mode').selectOption('model');
  for (const malformed of [{ready:'false',model:'bad'}, {ready:true,model:{}}, {model:'missing-ready'}, null, {ready:true,model:'x'.repeat(201)}]) {
    response = malformed;
    await page.locator('#refresh-status').click();
    await page.locator('.connection').filter({hasText:'未连接'}).waitFor();
    ok(!await page.locator('.connection').evaluate(el => el.classList.contains('connected')), 'malformed health cannot show ready');
    ok(await page.locator('#detect').isDisabled(), 'malformed health cannot enable detection');
    ok(await page.locator('.setup-link').isVisible(), 'offline status shows setup guide');
    response = {ready:true,model:'healthy-model'};
    await page.locator('#refresh-status').click();
    await page.locator('.connection').filter({hasText:'healthy-model'}).waitFor();
    ok(await page.locator('.setup-link').count() === 0, 'successful retry removes obsolete setup hint');
  }
  ok(!errors.length, errors.join('; '));
  return 'PASS: service refresh preserves incomplete sample input and open form; malformed health is offline and valid retry restores status';
}
