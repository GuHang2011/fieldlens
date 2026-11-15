async (page) => {
  const ok = (value, message) => { if (!value) throw Error(message); };
  const base = "http://127.0.0.1:4176/";
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + "#workspace");
  await page.locator("#sample-top").click();
  await page.locator("#save").click();
  const template = await page.evaluate(() => JSON.parse(localStorage.getItem("fieldlens.history"))[0]);
  const records = (count) => Array.from({ length: count }, (_, index) => ({
    ...template,
    id: `queue-${index + 1}`,
    name: `queue-fixture-${index + 1}.svg`,
    date: `2026-01-${String(20 - index).padStart(2, "0")}T01:00:00Z`,
    notes: `原始备注 ${index + 1}`,
    reviewed: false,
    followUp: null,
    sample: { ...template.sample, code: `QUEUE-${index + 1}` },
  }));
  const seed = async (items) => {
    await page.goto(base + "#history");
    await page.evaluate((value) => localStorage.setItem("fieldlens.history", JSON.stringify(value)), items);
    await page.reload();
    await page.locator("#start-review-queue").waitFor();
  };
  const current = () => page.locator("#detail-code").inputValue();
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem("fieldlens.history")));
  const expectRecord = async (number) => ok(await current() === `QUEUE-${number}`, `expected record ${number}`);

  await seed([]);
  ok(await page.locator("#start-review-queue").isDisabled(), "empty list cannot start a review queue");
  await seed(records(3));
  await page.locator('[data-details="queue-1"]').click();
  ok(await page.locator("#save-next-review").count() === 0, "ordinary details retain their original single-record behavior");
  await page.locator("#record-notes").fill("普通详情保存");
  await page.locator("#save-review").click();
  ok(await page.locator("#record-dialog").isHidden(), "ordinary save returns to the list");

  await page.locator("#record-review").selectOption("pending");
  await page.locator("#start-review-queue").click();
  await expectRecord(1);
  ok(await page.locator("#review-previous").isDisabled(), "first item has no previous record");
  await page.locator("#record-reviewed").check();
  await page.locator("#save-next-review").click();
  await expectRecord(2);
  ok((await stored())[0].reviewed === true, "explicit reviewed choice is saved");
  ok((await page.locator("#review-queue-progress").textContent()).includes("2 / 3"), "queue retains its original size after a record leaves the pending filter");
  await page.locator("#record-notes").fill("只保存意见，不自动标为已查看");
  await page.locator("#save-next-review").click();
  await expectRecord(3);
  ok((await stored())[1].reviewed === false, "saving does not silently mark a record reviewed");
  ok(await page.locator("#review-next").isDisabled(), "last item has no next record");
  ok((await page.locator("#save-next-review").textContent()).includes("结束"), "last save states that the queue will end");
  await page.locator("#save-next-review").click();
  ok(await page.locator("#record-dialog").isHidden(), "last save ends the queue");
  ok(await page.locator("[data-details]").count() === 2, "pending list reflects only explicitly reviewed records");

  await seed(records(10));
  await page.locator('[data-select-record="queue-1"]').check();
  await page.locator("#next-page").click();
  await page.locator('[data-select-record="queue-10"]').check();
  await page.locator("#record-sort").selectOption("oldest");
  await page.locator("#start-review-queue").click();
  await expectRecord(10);
  ok((await page.locator("#review-queue-progress").textContent()).includes("1 / 2"), "queue is limited to selected records across pages");
  await page.locator("#record-notes").fill("下一条前的草稿");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator("#review-next").click();
  await expectRecord(10);
  ok(await page.locator("#record-notes").inputValue() === "下一条前的草稿", "cancel next keeps the draft");
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#review-next").click();
  await expectRecord(1);
  ok((await stored()).find((record) => record.id === "queue-10").notes === "原始备注 10", "confirmed navigation discards rather than saves the draft");
  await page.locator("#record-notes").fill("上一条前的草稿");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator("#review-previous").click();
  await expectRecord(1);
  ok(await page.locator("#record-notes").inputValue() === "上一条前的草稿", "cancel previous keeps the draft");
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#review-previous").click();
  await expectRecord(10);
  await page.locator("#save-review").click();
  ok(await page.locator("#record-dialog").isHidden(), "save and return exits before the end of a queue");

  await seed(records(2));
  await page.locator("#start-review-queue").click();
  await page.locator('[data-detail-tab="sample"]').click();
  // datetime-local rejects malformed keystrokes itself. A text input fixture
  // exercises the record parser's failure path without changing product code.
  const collected = page.locator('[data-sample="collectedAt"]');
  const originalTime = await collected.inputValue();
  await collected.evaluate((element) => { element.type = "text"; });
  await collected.fill("invalid-collection-date");
  await page.locator("#save-next-review").click();
  await expectRecord(1);
  ok((await page.locator("#detail-error").textContent()).includes("采集"), "collection validation explains why review cannot advance");
  await collected.fill(originalTime);
  await collected.evaluate((element) => { element.type = "datetime-local"; });
  await page.locator('[data-detail-tab="followup"]').click();
  await page.locator("#followup-enabled").check();
  await page.locator("#save-next-review").click();
  await expectRecord(1);
  ok((await page.locator("#detail-error").textContent()).includes("复查原因"), "follow-up validation prevents advancing");
  await page.locator("#followup-reason").fill("补拍叶背");
  await page.locator('[data-detail-tab="review"]').click();
  await page.locator("#record-notes").fill("存储失败时仍需保留的草稿");
  await page.evaluate(() => {
    window.queueTestSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "fieldlens.history") throw new DOMException("Test storage quota", "QuotaExceededError");
      return window.queueTestSetItem.call(this, key, value);
    };
  });
  try {
    await page.locator("#save-next-review").click();
    await expectRecord(1);
    ok((await page.locator("#detail-error").textContent()).includes("保存失败"), "storage failure is reported");
    ok(await page.locator("#record-notes").inputValue() === "存储失败时仍需保留的草稿", "failed save preserves the editable draft");
    ok((await stored())[0].notes === "原始备注 1", "failed save leaves persisted record unchanged");
  } finally {
    await page.evaluate(() => { Storage.prototype.setItem = window.queueTestSetItem; delete window.queueTestSetItem; });
  }
  await page.locator("#save-next-review").click();
  await expectRecord(2);
  ok((await stored())[0].followUp.reason === "补拍叶背", "retry saves the validated follow-up before advancing");
  await page.locator("#close-detail").click();

  await seed(records(1));
  await page.locator("#start-review-queue").click();
  ok(await page.locator("#review-previous").isDisabled() && await page.locator("#review-next").isDisabled(), "single-record queue has no navigation targets");
  await page.locator("#save-next-review").click();
  ok(await page.locator("#record-dialog").isHidden(), "single-record queue can finish normally");

  await seed(records(4));
  const writer = await page.context().newPage();
  writer.on("pageerror", (error) => errors.push(error.message));
  try {
    await writer.goto(base + "#history");
    await page.locator("#start-review-queue").click();
    await page.locator("#record-notes").fill("冲突前未保存的草稿");
    await writer.locator('[data-details="queue-1"]').click();
    await writer.locator("#record-notes").fill("另一标签页已保存的意见");
    await writer.locator("#save-review").click();
    await page.locator("#detail-conflict").waitFor({ state: "visible" });
    ok(await page.locator("#save-next-review").isDisabled() && await page.locator("#save-review").isDisabled(), "conflict disables both save choices");
    ok(await page.locator("#record-notes").inputValue() === "冲突前未保存的草稿", "conflict does not replace the draft");
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#reload-record").click();
    ok(await page.locator("#record-notes").inputValue() === "另一标签页已保存的意见", "reread obtains the latest record");
    ok((await page.locator("#review-queue-progress").textContent()).includes("1 / 4"), "reread keeps the frozen queue");
    writer.once("dialog", (dialog) => dialog.accept());
    await writer.locator('[data-delete="queue-2"]').click();
    const inserted = { ...records(1)[0], id: "queue-new", sample: { ...template.sample, code: "QUEUE-NEW" } };
    await writer.evaluate((record) => {
      localStorage.setItem("fieldlens.history", JSON.stringify([record, ...JSON.parse(localStorage.getItem("fieldlens.history"))]));
    }, inserted);
    await writer.reload();
    await page.waitForFunction(() => document.querySelector('[data-details="queue-new"]'));
    await page.locator("#review-next").click();
    await expectRecord(3);
    ok((await page.locator("#review-queue-progress").textContent()).includes("3 / 4"), "navigation skips deleted next record without adding a new record");
    writer.once("dialog", (dialog) => dialog.accept());
    await writer.locator('[data-delete="queue-3"]').click();
    await page.locator("#detail-conflict").waitFor({ state: "visible" });
    ok(await page.locator("#save-next-review").isDisabled(), "deleted current record cannot be saved while advancing");
    await page.locator("#review-next").click();
    await expectRecord(4);
    await page.locator("#review-previous").click();
    await expectRecord(1);
    await page.locator("#review-next").click();
    await expectRecord(4);
    ok(await page.locator("#review-next").isDisabled(), "newly inserted records are not appended to the frozen queue");
    await page.locator("#save-next-review").click();
    ok(await page.locator("#record-dialog").isHidden(), "queue finishes after external deletions");
  } finally { await writer.close(); }

  const aiContext = await page.context().browser().newContext();
  try {
    await aiContext.route("**/api/auth/session", (route) => route.fulfill({ json: { enabled: false, user: null } }));
    await aiContext.route("**/api/health", (route) => route.fulfill({ json: { ready: false } }));
    await aiContext.route("**/api/assistant/status", (route) => route.fulfill({ json: { configured: true, provider: "queue fixture", model: "queue fixture" } }));
    const editor = await aiContext.newPage();
    editor.on("pageerror", (error) => errors.push(error.message));
    await editor.goto("http://127.0.0.1:5176/#history");
    await editor.evaluate((items) => localStorage.setItem("fieldlens.history", JSON.stringify(items)), records(2));
    await editor.reload();
    await editor.locator("#start-review-queue").click();
    await editor.locator('[data-detail-tab="ai"]').click();
    await editor.locator("#ai-check").click();
    await editor.waitForFunction(() => !document.querySelector("#ai-send").disabled);
    let started, release;
    const pending = new Promise((resolve) => { started = resolve; });
    const gate = new Promise((resolve) => { release = resolve; });
    await editor.route("**/api/assistant", async (route) => {
      started(); await gate;
      await route.fulfill({ json: { text: "Old record fixture answer", provider: "fixture", model: "fixture" } }).catch(() => {});
    });
    await editor.locator("#ai-send").click();
    await pending;
    await editor.locator("#review-next").click();
    await editor.locator('[data-detail-tab="ai"]').click();
    release();
    await editor.waitForLoadState("networkidle");
    ok(await editor.locator("#detail-code").inputValue() === "QUEUE-2", "AI waiting does not prevent moving to the next record");
    ok(await editor.locator("#ai-answer").isHidden(), "late answer from the previous record is not shown on the next record");
    ok(await editor.locator("#ai-send").isDisabled(), "previous request cannot enable the new record's AI controls");
  } finally { await aiContext.close(); }
  ok(!errors.length, errors.join("; "));
  return "PASS: frozen filtered/selected review queue, cross-page sorting, explicit review status, draft navigation confirmation, validation/storage retry, single/empty/last item, cross-tab update/deletion/insertion and stale AI answer isolation";
}
