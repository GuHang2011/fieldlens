async (page) => {
  const ok = (value, message) => { if (!value) throw Error(message); };
  const base = "http://127.0.0.1:4176/";
  await page.goto(base + "#workspace");
  await page.locator("#sample-top").click();
  await page.locator("#inspection-note").fill("原有备注");
  await page.locator("#save").click();
  const other = await page.context().newPage();
  try {
    await other.goto(base + "#workspace");
    await other.locator("#sample-top").click();
    await other.locator("#save").click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("fieldlens.history")).length === 2);
    ok(await page.locator("#workspace-conflict").isHidden(), "saving an unrelated record must not report a conflict");
    await page.locator("#inspection-note").fill("工作台未保存的草稿");
    await other.goto(base + "#history");
    await other.locator("[data-details]").last().click();
    await other.locator("#record-notes").fill("另一个标签页保存的新意见");
    await other.locator("#save-review").click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("fieldlens.history")).some((record) => record.notes === "另一个标签页保存的新意见"));
    ok(await page.locator("#save").isDisabled(), "workspace must block overwriting a remotely updated record");
    await page.locator("#workspace-conflict").waitFor({ state: "visible" });
    ok(await page.locator("#inspection-note").inputValue() === "工作台未保存的草稿", "conflict retains workspace draft");
    const download = page.waitForEvent("download");
    await page.locator("#export").click();
    const stream = await (await download).createReadStream();
    let text = ""; for await (const part of stream) text += part.toString();
    ok(JSON.parse(text).notes === "工作台未保存的草稿", "conflicted draft remains exportable");
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.locator("#reload-workspace-record").click();
    ok(await page.locator("#inspection-note").inputValue() === "工作台未保存的草稿", "cancel reread preserves local inputs");
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#reload-workspace-record").click();
    ok(await page.locator("#inspection-note").inputValue() === "另一个标签页保存的新意见", "reread loads latest saved fields");
    await page.locator("#inspection-note").fill("核对新意见后的修改");
    await page.locator("#save").click();
    ok(await page.evaluate(() => JSON.parse(localStorage.getItem("fieldlens.history"))[0].notes) === "核对新意见后的修改", "save works after explicit reread");
    other.once("dialog", (dialog) => dialog.accept());
    await other.locator("[data-delete]").first().click();
    await page.locator("#workspace-conflict").waitFor({ state: "visible" });
    ok(await page.locator("#save").isDisabled(), "workspace cannot silently recreate a deleted record");
    ok(await page.locator("#reload-workspace-record").isHidden(), "deleted record has no invalid reload action");
    ok((await page.locator("#workspace-conflict").textContent()).includes("删除"), "deletion explanation is specific");
    await page.locator('[data-view="history"]').click();
    await page.locator('[data-view="workspace"]').click();
    ok(await page.locator("#save").isDisabled(), "conflict survives navigation");
    await page.locator("#sample-top").click();
    await page.locator("#save").click();
    ok(await page.evaluate(() => JSON.parse(localStorage.getItem("fieldlens.history")).length) === 2, "new result can be saved after deletion");
    ok(await page.locator("#workspace-conflict").isHidden(), "new result has no old conflict");
  } finally { await other.close(); }

  const demoContext = await page.context().browser().newContext();
  try {
    const personal = await demoContext.newPage();
    const writer = await demoContext.newPage();
    await personal.goto(base + "#workspace");
    await personal.locator("#sample-top").click();
    await personal.locator("#inspection-note").fill("进入演示前保存的备注");
    await personal.locator("#save").click();
    await personal.locator("#inspection-note").fill("进入演示前尚未保存的草稿");
    await personal.locator('[data-view="demo"]').click();
    await personal.locator('[data-demo-go="workspace"]').first().click();
    const demoBefore = await personal.evaluate(() => sessionStorage.getItem("fieldlens.demo.session.v1"));
    await writer.goto(base + "#history");
    await writer.locator("[data-details]").click();
    await writer.locator("#record-notes").fill("演示期间另一标签页的新意见");
    await writer.locator("#save-review").click();
    ok(await personal.locator("#workspace-conflict").isHidden(), "personal record changes do not show conflicts in the demo workspace");
    ok(await personal.evaluate(() => sessionStorage.getItem("fieldlens.demo.session.v1")) === demoBefore, "external personal updates do not change demo records");
    await personal.locator("#demo-exit").click();
    await personal.locator("#workspace-conflict").waitFor({ state: "visible" });
    ok(await personal.locator("#save").isDisabled(), "returning from demo cannot overwrite personal updates missed while away");
    ok(await personal.locator("#inspection-note").inputValue() === "进入演示前尚未保存的草稿", "returning from demo preserves the personal draft");
    ok(await personal.evaluate(() => JSON.parse(localStorage.getItem("fieldlens.history"))[0].notes) === "演示期间另一标签页的新意见", "newer personal data stays intact");
    personal.once("dialog", dialog => dialog.accept());
    await personal.locator("#reload-workspace-record").click();
    ok(await personal.locator("#inspection-note").inputValue() === "演示期间另一标签页的新意见", "returning from demo can explicitly reread the latest notes");
  } finally { await demoContext.close(); }

  const backupContext = await page.context().browser().newContext();
  try {
    const editor = await backupContext.newPage();
    const importer = await backupContext.newPage();
    await editor.goto(base + "#workspace");
    await editor.locator("#sample-top").click();
    await editor.locator("#save").click();
    const original = await editor.evaluate(() => JSON.parse(localStorage.getItem("fieldlens.history"))[0]);
    const replacement = {
      ...original,
      detections: [{ ...original.detections[0], label: "备份恢复的不同检测区域" }],
      notes: "备份恢复的新备注",
    };
    await importer.goto(base + "#history");
    await importer.locator("#backup-file").setInputFiles({
      name: "replacement-fixture.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ application: "禾镜 FieldLens", schemaVersion: 1, records: [replacement] })),
    });
    await importer.locator("[data-import]").selectOption("replace");
    await importer.locator("#backup-confirm").click();
    await importer.locator("[data-details]").click();
    await importer.locator('[data-region-status="0"]').selectOption("keep");
    await importer.locator('[data-region-note="0"]').fill("针对备份区域的新复核意见");
    await importer.locator("#save-review").click();
    await editor.locator("#workspace-conflict").waitFor({ state: "visible" });
    ok(await editor.locator("#save").isDisabled(), "a replaced detection cannot be overwritten by the old workspace result");
    ok(await editor.locator("#reload-workspace-record").isHidden(), "changed detection data cannot be resolved by rereading only notes");
    const download = editor.waitForEvent("download");
    await editor.locator("#export").click();
    const stream = await (await download).createReadStream();
    let content = ""; for await (const chunk of stream) content += chunk.toString();
    const draft = JSON.parse(content);
    ok(JSON.stringify(draft.detections) === JSON.stringify(original.detections), "export retains the visible old detection result");
    ok(draft.regionReviews.length === 0, "old result export does not borrow reviews for incompatible new detections");
    await editor.locator("#inspection-note").fill("仍属于旧结果的草稿");
    ok(await editor.locator("#save").isDisabled(), "editing notes cannot unlock an incompatible detection result");
    await editor.locator("#sample-top").click();
    await editor.locator("#save").click();
    const saved = await editor.evaluate(() => JSON.parse(localStorage.getItem("fieldlens.history")));
    ok(saved.length === 2, "new detection can be saved separately after a backup replacement");
    ok(saved.find(record => record.id === original.id).detections[0].label === "备份恢复的不同检测区域", "new detection preserves the replaced record");
  } finally { await backupContext.close(); }

  const variantContext = await page.context().browser().newContext();
  try {
    const editor = await variantContext.newPage();
    await editor.goto(base + "#workspace");
    await editor.locator("#sample-top").click();
    await editor.locator("#save").click();
    const original = await editor.evaluate(() => JSON.parse(localStorage.getItem("fieldlens.history"))[0]);
    const threshold = async (value) => editor.locator("#threshold").evaluate((input, next) => {
      input.value = String(next);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
    await threshold(60);
    await editor.locator("#save").click();
    await editor.locator('[data-view="history"]').click();
    const replacement = { ...original, detections: [{ ...original.detections[0], label: "另一个阈值版本恢复的区域" }], notes: "阈值版本恢复备注" };
    await editor.locator("#backup-file").setInputFiles({
      name: "threshold-variant-fixture.json", mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ application: "禾镜 FieldLens", schemaVersion: 1, records: [replacement] })),
    });
    await editor.locator("[data-import]").selectOption("replace");
    await editor.locator("#backup-confirm").click();
    await editor.locator('[data-view="workspace"]').click();
    ok(await editor.locator("#workspace-conflict").isHidden(), "changing another threshold variant does not block the unaffected current result");
    await threshold(50);
    await editor.locator("#workspace-conflict").waitFor({ state: "visible" });
    ok(await editor.locator("#save").isDisabled(), "switching back to a replaced threshold variant cannot overwrite the import");
    ok(await editor.locator("#reload-workspace-record").isHidden(), "variant replacement cannot be resolved by notes-only reload");
    await editor.locator("#inspection-note").fill("旧阈值结果的未保存草稿");
    ok(await editor.locator("#save").isDisabled(), "editing the stale variant retains protection");
    ok(await editor.evaluate(id => JSON.parse(localStorage.getItem("fieldlens.history")).find(record => record.id === id).detections[0].label, original.id) === "另一个阈值版本恢复的区域", "same-tab import remains intact after threshold navigation");
  } finally { await variantContext.close(); }
  return "PASS: workspace cross-tab update/deletion guard, draft export, reread confirmation, route persistence, demo-return conflict protection, backup detection and threshold-variant replacement isolation and new-result recovery";
}
