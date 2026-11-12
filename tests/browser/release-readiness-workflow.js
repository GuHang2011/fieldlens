async (page) => {
  const ok = (value, message) => { if (!value) throw Error(message); };
  const base = "http://127.0.0.1:4176/";
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base + "#workspace");
  await page.locator("#sample-top").click();
  await page.locator("#save").click();
  const other = await page.context().newPage();
  try {
    await other.goto(base + "#history");
    await other.locator("[data-details]").click();
    await other.locator("#record-notes").fill("第二个标签页未保存的复核意见");
    await page.locator('[data-view="history"]').click();
    await page.locator("[data-details]").click();
    await page.locator("#record-notes").fill("第一个标签页已经保存的新意见");
    await page.locator("#save-review").click();
    await other.locator("#detail-conflict").waitFor({ state: "visible" });
    ok(await other.locator("#save-review").isDisabled(), "stale record cannot overwrite the latest review");
    ok(await other.locator("#record-notes").inputValue() === "第二个标签页未保存的复核意见", "conflict preserves the draft");
    for (const [width, height] of [[320, 568], [844, 390], [390, 844]]) {
      await other.setViewportSize({ width, height });
      for (const selector of ["#reload-record", "#detail-export", "#record-notes", "#close-detail"]) {
        await other.locator(selector).scrollIntoViewIfNeeded();
        ok(await other.locator(selector).evaluate((element) => {
          const box = element.getBoundingClientRect();
          return box.y >= 0 && box.bottom <= innerHeight && element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
        }), `conflict action reachable: ${selector} at ${width}x${height}`);
      }
      ok(await other.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "conflict dialog fits the viewport");
    }
    await other.setViewportSize({ width: 1280, height: 720 });
    const download = other.waitForEvent("download");
    await other.locator("#detail-export").click();
    const stream = await (await download).createReadStream();
    let content = ""; for await (const chunk of stream) content += chunk.toString();
    ok(JSON.parse(content).notes === "第二个标签页未保存的复核意见", "conflicted draft can be exported");
    other.once("dialog", (dialog) => dialog.dismiss());
    await other.locator("#reload-record").click();
    ok(await other.locator("#record-notes").inputValue() === "第二个标签页未保存的复核意见", "cancel reread preserves the draft");
    other.once("dialog", (dialog) => dialog.accept());
    await other.locator("#reload-record").click();
    ok(await other.locator("#record-notes").inputValue() === "第一个标签页已经保存的新意见", "reread loads the latest record");
    await other.locator("#record-notes").fill("核对最新版本后保存");
    await other.locator("#save-review").click();
    await page.locator("#records-update").waitFor({ state: "visible" });
    await page.waitForFunction(() => document.querySelector(".record-comment").textContent === "核对最新版本后保存");
    await other.locator("[data-details]").click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("[data-delete]").click();
    await other.locator("#detail-conflict").waitFor({ state: "visible" });
    ok((await other.locator("#detail-conflict").textContent()).includes("删除"), "deleted record is distinguished from changed record");
    ok(await other.locator("#save-review").isDisabled(), "deleted record cannot report a false save");
    await other.locator("#close-detail").click();
    await page.locator('[data-view="workspace"]').click();
    await page.locator("#sample-top").click();await page.locator("#save").click();
    await other.locator("[data-details]").waitFor();
    await other.locator("#record-query").fill("示例");
    await other.locator("[data-select-record]").check();
    await page.locator("#inspection-note").fill("其他标签页更新");await page.locator("#save").click();
    await other.waitForFunction(() => document.querySelector(".record-comment").textContent === "其他标签页更新");
    ok(await other.locator("#record-query").inputValue() === "示例", "live refresh preserves search");
    ok(await other.locator("[data-select-record]").isChecked(), "live refresh preserves selection");
    await page.evaluate(() => localStorage.clear());
    await other.waitForFunction(() => document.querySelectorAll("[data-details]").length === 0);
  } finally { await other.close(); }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "?demo=1#history");
  await page.locator('[data-select-record="demo-case-01"]').check();
  await page.locator("#next-page").click();
  const box = await page.locator("#records-table tbody tr").first().boundingBox();
  ok(box.y >= 0 && box.y < 160, "mobile next page starts at the new records");
  ok(await page.locator(".table-scroll").evaluate((el) => el === document.activeElement), "pagination focus moves to the new list");
  await page.locator("#previous-page").click();
  ok(await page.locator('[data-select-record="demo-case-01"]').isChecked(), "pagination retains cross-page selection");

  // Test fixtures for an unavailable reverse proxy and a late login response.
  const loginContext = await page.context().browser().newContext();
  try {
    const login = await loginContext.newPage();
    await login.route("**/api/auth/session", (route) => route.fulfill({ json: { enabled: true, user: null } }));
    await login.route("**/api/health", (route) => route.fulfill({ status: 401, json: { error: "test fixture: login required" } }));
    await login.route("**/api/auth/login", (route) => route.fulfill({ status: 503, contentType: "text/html", body: "<!doctype html><h1>Test proxy unavailable</h1>" }));
    await login.goto("http://127.0.0.1:5176/#login");
    await login.locator("#login-username").fill("test-inspector");
    await login.locator("#login-password").fill("test-fixture-only-password");
    await login.locator("#login-submit").click();
    await login.locator("#login-error").waitFor({ state: "visible" });
    ok((await login.locator("#login-error").textContent()).includes("登录服务暂不可用"), "proxy HTML receives a readable login error");
    ok(!(await login.locator("#login-submit").isDisabled()), "login can be retried after proxy error");
    let started;
    const pending = new Promise((resolve) => { started = resolve; });
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    await login.route("**/api/auth/login", async (route) => {
      started();await gate;
      await route.fulfill({ json: { user: { id: "fixture-user" } } }).catch(() => {});
    });
    await login.locator("#login-submit").click();await pending;
    await login.locator('[data-view="guide"]').click();
    await login.getByRole("heading", { name: "运行指南", exact: true }).waitFor();
    release();
    await login.waitForLoadState("networkidle");
    ok(new URL(login.url()).hash === "#guide", "late login response does not redirect away from the user's page");
  } finally { await loginContext.close(); }

  const aiContext = await page.context().browser().newContext();
  try {
    await aiContext.route("**/api/auth/session", (route) => route.fulfill({ json: { enabled: false, user: null } }));
    await aiContext.route("**/api/health", (route) => route.fulfill({ json: { ready: false } }));
    const editor = await aiContext.newPage();
    const writer = await aiContext.newPage();
    editor.on("pageerror", (error) => errors.push(error.message));
    await writer.goto("http://127.0.0.1:5176/#workspace");
    await writer.locator("#sample-top").click();
    await writer.locator("#save").click();
    await editor.goto("http://127.0.0.1:5176/#history");
    await editor.locator("[data-details]").click();
    const openAI = () => editor.locator('[data-detail-tab="ai"]').click();
    const updateAndReload = async (note) => {
      await writer.locator("#inspection-note").fill(note);
      await writer.locator("#save").click();
      await editor.locator("#detail-conflict").waitFor({ state: "visible" });
      await editor.locator("#reload-record").click();
      await openAI();
    };
    const delay = async (url, json) => {
      let started, release;
      const pending = new Promise((resolve) => { started = resolve; });
      const gate = new Promise((resolve) => { release = resolve; });
      await editor.route(url, async (route) => {
        started(); await gate;
        await route.fulfill({ json }).catch(() => {});
      });
      return { pending, release };
    };
    await openAI();
    const status = await delay("**/api/assistant/status", { configured: true, provider: "old fixture", model: "old model" });
    await editor.locator("#ai-check").click(); await status.pending;
    await updateAndReload("重新读取配置中的记录");
    status.release();
    await editor.waitForLoadState("networkidle");
    ok(await editor.locator("#ai-send").isDisabled(), "late configuration cannot enable a new record panel");
    ok((await editor.locator("#ai-status").textContent()).includes("尚未检查"), "reread starts with fresh AI configuration state");
    await editor.route("**/api/assistant/status", (route) => route.fulfill({ json: { configured: true, provider: "fixture", model: "fixture" } }));
    await editor.locator("#ai-check").click();
    await editor.waitForFunction(() => !document.querySelector("#ai-send").disabled);
    const answer = await delay("**/api/assistant", { text: "Old snapshot answer", provider: "fixture", model: "fixture" });
    await editor.locator("#ai-send").click(); await answer.pending;
    await updateAndReload("重新读取回答中的记录");
    answer.release();
    await editor.waitForLoadState("networkidle");
    ok(await editor.locator("#ai-answer").isHidden(), "late answer cannot appear on the new record snapshot");
    ok(await editor.locator("#ai-send").isDisabled(), "disposed request cannot change fresh controls");
  } finally { await aiContext.close(); }
  ok(!errors.length, errors.join(";"));
  return "PASS: concurrent review/deletion protection, draft export/reload/cancel, live list/search/selection updates, storage clear, mobile pagination/focus, proxy error, disposed login and stale AI status/answer after record reload";
}
