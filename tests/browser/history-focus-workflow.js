async (page) => {
  const failures = [], errors = [];
  const check = (value, message) => { if (!value) failures.push(message); };
  const base = "http://127.0.0.1:4176/";
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base + "#workspace");
  await page.locator("#sample-top").click();
  await page.locator("#inspection-note").fill("原有待复核备注");
  await page.locator("#save").click();
  await page.locator('[data-view="history"]').click();
  const id = await page.locator("[data-details]").getAttribute("data-details");
  const other = await page.context().newPage();
  let revision = 0;
  const updateElsewhere = async () => {
    const note = `另一标签页的复核意见 ${++revision}`;
    await other.locator("[data-details]").click();
    await other.locator("#record-notes").fill(note);
    await other.locator("#save-review").click();
    await page.waitForFunction((text) => document.querySelector(".record-comment")?.textContent === text, note);
  };
  try {
    await other.goto(base + "#history");
    for (const action of ["details", "json", "delete", "select-record"]) {
      const control = page.locator(`[data-${action}="${id}"]`);
      await control.focus();
      await updateElsewhere();
      const retained = await control.evaluate((el) => document.activeElement === el);
      check(retained, `cross-tab update retains ${action} focus on the same record`);
      if (action === "details") {
        await page.keyboard.press("Enter");
        const opened = await page.waitForFunction(() => document.querySelector("#record-dialog").open, null, { timeout: 1000 }).then(() => true, () => false);
        check(opened, "Enter still opens the focused record after synchronization");
        if (opened) await page.keyboard.press("Escape");
      } else if (retained && action === "json") {
        const download = page.waitForEvent("download");
        await page.keyboard.press("Enter");
        const stream = await (await download).createReadStream();
        let text = "";
        for await (const chunk of stream) text += chunk.toString();
        check(JSON.parse(text).id === id, "Enter exports the same focused record after synchronization");
      } else if (retained && action === "delete") {
        let asked = false;
        page.once("dialog", async (dialog) => { asked = true; await dialog.dismiss(); });
        await page.keyboard.press("Enter");
        check(asked, "Enter reaches deletion confirmation after synchronization");
      } else if (retained && action === "select-record") {
        await page.keyboard.press("Space");
        check(await control.isChecked(), "Space selects the same focused record after synchronization");
      }
    }
    await page.locator("#record-query").fill("示例");
    await page.locator("#record-query").focus();
    await updateElsewhere();
    check(await page.locator("#record-query").evaluate((el) => document.activeElement === el && el.value === "示例"), "record synchronization does not steal search focus or change its value");
    await page.locator("[data-details]").click();
    await page.locator("#record-notes").focus();
    await updateElsewhere();
    check(await page.locator("#record-notes").evaluate((el) => document.activeElement === el), "record synchronization preserves focus inside the open detail dialog");
    await page.keyboard.press("Escape");
    await page.locator("[data-details]").focus();
    other.once("dialog", (dialog) => dialog.accept());
    await other.locator("[data-delete]").click();
    await page.waitForFunction(() => !document.querySelector("[data-details]"));
    check(await page.locator("#record-query").evaluate((el) => document.activeElement === el), "deleting the focused record moves focus to the search field");
    await page.keyboard.type("继续查询");
    check((await page.locator("#record-query").inputValue()).includes("继续查询"), "keyboard search remains usable after the focused record disappears");
  } finally { await other.close(); }

  for (const withRecord of [false, true]) {
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(base + "#workspace");
      if (withRecord && !(await page.evaluate(() => JSON.parse(localStorage.getItem("fieldlens.history") || "[]").length))) {
        await page.locator("#sample-top").click();
        await page.locator("#save").click();
      }
      await page.locator('[data-view="assistant"]').click();
      await page.locator("#helper-tab-records").click();
      const generate = withRecord ? "#helper-review" : "#helper-overview";
      await page.locator(generate).click();
      await page.locator("#helper-clear").focus();
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => document.querySelector("#helper-local-answer").hidden);
      check(await page.locator(generate).evaluate((el) => document.activeElement === el), `clearing helper output restores an available generation action at ${width}/${withRecord}`);
      await page.keyboard.press("Enter");
      check(await page.locator("#helper-local-answer").isVisible(), `Enter generates another helper result after clearing at ${width}/${withRecord}`);
    }
  }
  check(!errors.length, errors.join("; "));
  if (failures.length) throw Error(failures.join("\n"));
  return "PASS: cross-tab history synchronization retains details/JSON/delete/checkbox focus and keyboard actions, preserves search/dialog focus, recovers after record deletion, and helper clear restores a usable action with and without records at three widths";
}
