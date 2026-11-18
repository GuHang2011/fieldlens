async (page) => {
  const ok = (value, message) => { if (!value) throw Error(message); };
  await page.goto('http://127.0.0.1:4176/?demo=1#history');
  await page.locator('.advanced-filters summary').click();
  const date = await page.evaluate(() => new Date().toLocaleDateString('sv-SE'));
  await page.locator('#filter-from').fill(date);
  const count = await page.locator('[data-details]').count();
  await page.locator('#select-page').check();
  const input = page.locator('#filter-from');
  await input.focus();await input.press('ArrowLeft');await input.press('Backspace');
  ok(await input.evaluate(el => el.validity.badInput && !el.value), 'partial native date fixture');
  await page.locator('#filter-to').focus();
  ok(await page.locator('#filter-error').isVisible(), 'incomplete range must show an error');
  ok(await page.locator('[data-details]').count() === count, 'incomplete date retains the last valid list');
  for (const selector of ['#start-review-queue','#export-records','#report-records','#compare-records'])
    ok(await page.locator(selector).isDisabled(), selector + ' must not use an invalid date range');
  ok((await page.locator('#records-scope').textContent()).includes('日期'), 'scope describes blocked date range');
  await input.fill(date);
  ok(await page.locator('#filter-error').isHidden(), 'fixing date clears error');
  ok(await page.locator('#select-page').isChecked(), 'temporary invalid date retains selection');
  const download = page.waitForEvent('download');
  await page.locator('#export-records').click();
  const stream = await (await download).createReadStream();
  let csv = '';for await (const chunk of stream) csv += chunk.toString();
  ok(csv.includes('演示叶片-01.svg') && !csv.includes('演示叶片-12.svg'), 'corrected export keeps the requested range');
  await page.locator('#filter-to').fill(date);
  await page.locator('#filter-to').focus();
  await page.locator('#filter-to').press('ArrowLeft');await page.locator('#filter-to').press('Backspace');
  ok(await page.locator('#export-records').isDisabled(), 'incomplete end date also blocks actions');
  await page.locator('#filter-to').fill('');await input.fill('');
  ok(await page.locator('#filter-error').isHidden(), 'deliberate clearing is valid');
  await page.locator('#reset-filters').click();
  ok((await page.locator('#records-total').textContent()).includes('共 12 条'), 'reset restores all records');
  ok(await page.locator('#start-review-queue').isEnabled(), 'reset restores batch actions');
  return 'PASS: partial date filters retain valid list and selection, block batch actions, and recover correct CSV scope after correction or clear';
}
