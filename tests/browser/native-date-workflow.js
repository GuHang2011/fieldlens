async (page) => {
  const ok = (value, message) => { if (!value) throw Error(message); };
  const base = "http://127.0.0.1:4176/";
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem("fieldlens.history") || "[]"));
  // A partly erased native date field keeps visible segments but exposes an
  // empty value. This must be distinguished from deliberately clearing it.
  const partialDate = async (input, value) => {
    await input.fill(value);
    await input.focus();
    await input.press("ArrowLeft");
    await input.press("Backspace");
    ok(await input.evaluate((element) => element.value === "" && element.validity.badInput), "native partial date fixture must have badInput with an empty value");
  };
  await page.goto(base + "#workspace");
  await page.locator("#sample-top").click();
  await page.locator("#save").click();
  const template = (await stored())[0];
  await page.locator('[data-view="history"]').click();
  await page.locator("[data-details]").click();
  await page.locator('[data-detail-tab="sample"]').click();
  const collected = page.locator('[data-sample="collectedAt"]');
  await partialDate(collected, "2026-11-16T09:30");
  await page.locator("#save-review").click();
  ok(await page.locator("#record-dialog").evaluate((element) => element.open), "partial collection time must keep the detail editor open");
  ok((await page.locator("#detail-error").textContent()).includes("采集时间"), "collection error identifies the incomplete field");
  ok((await stored())[0].sample.collectedAt === template.sample.collectedAt, "invalid collection time cannot erase the saved date");
  ok(await collected.evaluate((element) => element.validity.badInput), "failed save retains partial native input");
  await collected.fill("2026-11-16T09:30");
  await page.locator('[data-detail-tab="followup"]').click();
  await page.locator("#followup-enabled").check();
  await page.locator("#followup-reason").fill("重新拍摄叶背");
  await partialDate(page.locator("#followup-date"), "2026-11-20");
  await page.locator("#save-review").click();
  ok(await page.locator("#record-dialog").evaluate((element) => element.open), "partial follow-up date must keep the editor open");
  ok((await page.locator("#detail-error").textContent()).includes("复查日期"), "follow-up error identifies the incomplete field");
  ok((await stored())[0].followUp === null, "invalid date cannot save an undated follow-up");
  await page.locator("#followup-date").fill("");
  await page.locator('[data-detail-tab="sample"]').click();
  await collected.fill("");
  ok(await collected.evaluate((element) => !element.validity.badInput), "deliberate clearing is valid");
  await page.locator("#save-review").click();
  ok(await page.locator("#record-dialog").isHidden(), "deliberately empty optional dates can be saved");
  const cleared = (await stored())[0];
  ok(cleared.sample.collectedAt === "" && cleared.followUp.dueDate === "", "explicit date clearing persists");

  const queue = [1, 2].map((number) => ({
    ...template,
    id: `native-date-${number}`,
    sample: { ...template.sample, code: `NATIVE-${number}`, collectedAt: "2026-11-16T01:30:00.000Z" },
    followUp: { reason: "检查变化", status: "pending", dueDate: "2026-11-20", note: "", linkedRecordId: "" },
  }));
  await page.evaluate((items) => localStorage.setItem("fieldlens.history", JSON.stringify(items)), queue);
  await page.reload();
  await page.locator("#start-review-queue").click();
  await page.locator('[data-detail-tab="sample"]').click();
  await partialDate(page.locator('[data-sample="collectedAt"]'), "2026-11-16T09:30");
  await page.locator("#save-next-review").click();
  ok(await page.locator("#detail-code").inputValue() === "NATIVE-1", "partial collection time cannot advance the queue");
  ok((await stored())[0].sample.collectedAt === queue[0].sample.collectedAt, "queue failure preserves saved collection time");
  await page.locator('[data-sample="collectedAt"]').fill("");
  await page.locator('[data-detail-tab="followup"]').click();
  await partialDate(page.locator("#followup-date"), "2026-11-20");
  await page.locator("#save-next-review").click();
  ok(await page.locator("#detail-code").inputValue() === "NATIVE-1", "partial follow-up date cannot advance the queue");
  ok((await stored())[0].followUp.dueDate === "2026-11-20", "queue failure preserves the saved due date");
  await page.locator("#followup-date").fill("2026-11-21");
  await page.locator("#save-next-review").click();
  ok(await page.locator("#detail-code").inputValue() === "NATIVE-2", "correcting the date permits saving and advancing");
  ok((await stored())[0].sample.collectedAt === "" && (await stored())[0].followUp.dueDate === "2026-11-21", "successful retry saves only corrected values");
  await page.locator("#close-detail").click();

  const workspaceContext = await page.context().browser().newContext();
  try {
    const workspace = await workspaceContext.newPage();
    workspace.on("pageerror", (error) => errors.push(error.message));
    const downloads = [];
    workspace.on("download", (download) => downloads.push(download));
    await workspace.goto(base + "#workspace");
    await workspace.locator("#sample-top").click();
    await workspace.locator(".sample-details > summary").click();
    await partialDate(workspace.locator('[data-sample="collectedAt"]'), "2026-11-16T09:30");
    if (!(await workspace.locator("#save").isDisabled())) await workspace.locator("#save").click();
    ok(await workspace.evaluate(() => JSON.parse(localStorage.getItem("fieldlens.history") || "[]").length === 0), "workspace cannot save stale state while the visible collection field is invalid");
    for (const selector of ["#export", "#export-csv", "#export-image"])
      await workspace.locator(selector).click();
    await workspace.waitForTimeout(200);
    ok(downloads.length === 0, "invalid collection input blocks JSON, CSV and annotated image downloads");
    await workspace.locator('[data-sample="collectedAt"]').fill("2026-11-16T10:00");
    const downloaded = workspace.waitForEvent("download");
    await workspace.locator("#export").click();
    const stream = await (await downloaded).createReadStream();
    let contents = "";
    for await (const chunk of stream) contents += chunk.toString();
    const correctedTime = await workspace.evaluate(() => new Date("2026-11-16T10:00").toISOString());
    ok(JSON.parse(contents).sample.collectedAt === correctedTime && downloads.length === 1, "corrected JSON exports the visible date without any stale download");
    await workspace.locator("#save").click();
    ok(await workspace.evaluate(() => JSON.parse(localStorage.getItem("fieldlens.history") || "[]").length === 1), "corrected workspace input can be saved");
    ok(await workspace.evaluate(() => JSON.parse(localStorage.getItem("fieldlens.history"))[0].sample.collectedAt === new Date("2026-11-16T10:00").toISOString()), "workspace saves the corrected visible date");
    await workspace.locator('[data-sample="collectedAt"]').fill("");
    await workspace.locator("#save").click();
    ok(await workspace.evaluate(() => JSON.parse(localStorage.getItem("fieldlens.history"))[0].sample.collectedAt === ""), "workspace also permits intentional date clearing");
  } finally { await workspaceContext.close(); }
  ok(!errors.length, errors.join("; "));
  return "PASS: native partial collection/follow-up dates reject saving, retain drafts and persisted dates, stop review queue advancement, block stale workspace exports, allow explicit clearing and recover after correction in details and workspace";
}
