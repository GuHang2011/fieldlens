async (page) => {
  const ok = (value, message) => { if (!value) throw Error(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/auth/session', route => route.fulfill({json:{enabled:false,user:null}}));
  let model = 'health-model-A.pt';
  await page.route('**/api/health', route => route.fulfill({json:{ready:true,model}}));
  let result = {status:200,json:{detections:[],model:'inference-model-B.pt',elapsed_ms:4}};
  await page.route('**/api/detect', route => route.fulfill(result));
  await page.goto('http://127.0.0.1:5176/#workspace');
  await page.locator('#file-input').setInputFiles({
    name:'inspection.png',mimeType:'image/png',
    buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jz9sAAAAASUVORK5CYII=','base64'),
  });
  await page.waitForFunction(() => !document.querySelector('#detect').disabled);
  await page.locator('#detect').click();
  await page.waitForFunction(() => !document.querySelector('#save').disabled);
  await page.locator('#save').click();
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('fieldlens.history')));
  ok((await stored())[0].model === 'inference-model-B.pt', 'saved provenance must use the detection response model, not the earlier health check');
  model = 'new-service-model-C.pt';
  await page.locator('#refresh-status').click();
  await page.waitForFunction(() => document.querySelector('.connection').textContent.includes('new-service-model-C.pt'));
  await page.locator('#inspection-note').fill('更新观察备注');
  ok(await page.locator('#save').isEnabled(), 'refreshing service model must not conflict with the completed result');
  await page.locator('#save').click();
  ok((await stored())[0].model === 'inference-model-B.pt', 'editing notes preserves inference provenance after service refresh');

  // Headers can arrive before the JSON body. Cancelling body consumption must
  // keep the cancellation reason instead of reporting an offline service.
  await page.evaluate(() => {
    const original = window.fetch.bind(window);
    window.fetch = async (url, options) => {
      if (String(url).endsWith('/api/detect')) {
        window.fetch = original;
        return new Response(new ReadableStream({start(controller) {
          controller.enqueue(new TextEncoder().encode('{"detections":'));
          options.signal.addEventListener('abort', () => controller.error(options.signal.reason), {once:true});
        }}), {headers:{'Content-Type':'application/json'}});
      }
      return original(url, options);
    };
  });
  await page.locator('#detect').click();
  await page.locator('#cancel-detection').click();
  await page.locator('#error').waitFor({state:'visible'});
  const cancelled = await page.locator('#error').textContent();
  ok(cancelled.includes('取消'), 'cancelling an incomplete JSON body preserves the cancellation explanation: ' + cancelled);

  for (const response of [
    {status:502,contentType:'text/html',body:'<h1>Bad gateway</h1>'},
    {status:500,contentType:'application/json',body:'null'},
    {status:200,json:{detections:[],model:{unexpected:true}}},
  ]) {
    result = response;
    await page.locator('#detect').click();
    await page.locator('#error').waitFor({state:'visible'});
    const message = await page.locator('#error').textContent();
    ok(!/Cannot read|Unexpected|\[object Object\]/.test(message), 'malformed detection responses need readable errors');
    ok(await page.locator('#save').isDisabled(), 'failed detection cannot be saved');
    ok(await page.locator('#detect').isEnabled(), 'failed detection can be retried');
  }
  result = {status:200,json:{detections:[],model:'recovered-model.pt'}};
  await page.locator('#detect').click();
  await page.waitForFunction(() => !document.querySelector('#save').disabled);
  await page.locator('#save').click();
  ok((await stored())[0].model === 'recovered-model.pt', 'successful retry stores its own model');
  ok(!errors.length, errors.join('; '));
  return 'PASS: detection model provenance stays attached to its result, service refresh does not create false conflicts, malformed responses fail safely and retry succeeds';
}
