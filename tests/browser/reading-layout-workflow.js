async (page) => {
  const ok = (value, message) => { if (!value) throw Error(message); };
  const base = "http://127.0.0.1:4176/?demo=1";
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "#history");
  const note = await page.locator(".record-comment").first().textContent();
  ok(await page.locator("#record-mode").isHidden(), "mobile keeps search first");
  const recordTop = (await page.locator("#records-table tbody tr").first().boundingBox()).y;
  ok(recordTop < 844, "first record begins within the initial mobile viewport");

  await page.locator("#record-filter-toggle").click();
  await page.locator("#record-review").selectOption("pending");
  ok((await page.locator("#records-scope").textContent()).includes("8"), "review filter changes the actual record scope");
  await page.locator("[data-select-record]").first().check();
  await page.locator("#record-filter-toggle").click();
  ok(await page.locator("#record-review").isHidden(), "filters collapse after use");
  ok((await page.locator("#active-filters").textContent()).includes("待复核"), "active filters remain visible when controls collapse");
  ok((await page.locator("#filter-count").textContent()).includes("1"), "collapsed controls show active filter count");
  await page.setViewportSize({ width: 1440, height: 960 });
  ok(await page.locator("#record-review").isVisible(), "desktop exposes filter controls after resizing");
  ok(await page.locator("#record-review").inputValue() === "pending", "resizing preserves filters");
  ok(await page.locator("[data-select-record]").first().isChecked(), "resizing preserves selected records");
  await page.locator("#reset-filters").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("[data-details]").first().click();
  ok(await page.locator("#record-notes").inputValue() === note, "full notes remain editable in record details");
  await page.locator("#close-detail").click();
  await page.waitForFunction(() => document.activeElement?.matches("[data-details]"));

  await page.locator("#navigation-toggle").focus();
  await page.keyboard.press("Space");
  ok(await page.locator('[data-view="guide"]').isVisible(), "secondary navigation is keyboard accessible");
  await page.locator('[data-view="guide"]').focus();
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.querySelector("#navigation-toggle").getAttribute("aria-expanded") === "false");
  ok(await page.locator("#navigation-toggle").evaluate((el) => el === document.activeElement), "Escape returns focus to the menu button");
  ok(await page.locator('[data-view="guide"]').isHidden(), "Escape closes the menu");
  await page.locator("#navigation-toggle").click();
  await page.locator('[data-view="about"]').click();
  await page.getByRole("heading", { name: "项目说明", exact: true }).waitFor();
  ok(await page.locator("h1").textContent() === "项目说明", "secondary navigation opens the requested page");
  ok(await page.locator("#navigation-toggle").getAttribute("aria-expanded") === "false", "navigation collapses after choosing a page");
  await page.locator(".brand").click();
  await page.locator("#home-title").waitFor();
  ok(await page.locator(".sidebar").isHidden(), "mobile home uses only its own navigation");

  let checks = 0;
  for (const theme of ["classic", "field", "dark", "sand"]) {
    for (const width of [320, 390, 768, 1440, 1920]) {
      await page.setViewportSize({ width, height: 960 });
      await page.goto(base + `&layout=${theme}-${width}#history`);
      await page.locator("#ui-theme").selectOption(theme);
      if (width <= 650) {
        await page.locator("#navigation-toggle").click();
        await page.locator("#record-filter-toggle").click();
      }
      await page.locator(".advanced-filters summary").click();
      ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `expanded controls fit ${theme}/${width}`);
      await page.locator("#filter-from").fill("2026-11-12");
      await page.locator("#filter-to").fill("2026-11-11");
      ok(await page.locator("#filter-error").isVisible(), "date validation remains visible");
      await page.locator("#reset-filters").click();
      ok(await page.locator("#records-table tbody tr").count() === 8, "reset restores the first page");
      checks++;
    }
  }
  const denied = await page.context().browser().newContext();
  try {
    await denied.addInitScript(() => { Storage.prototype.setItem = () => { throw Error("blocked"); }; });
    const p = await denied.newPage();
    await p.goto(base + "#history");
    ok(await p.locator("#demo-storage-status").isVisible(), "storage failure is shown without expanding the banner");
    ok((await p.locator("#demo-storage-status").textContent()).includes("刷新可能丢失"), "storage warning explains the consequence");
  } finally { await denied.close(); }
  ok(!errors.length, errors.join("; "));
  return `PASS: mobile first-record visibility, filter/selection persistence across resize, full notes, keyboard navigation, home header, storage warning and ${checks} expanded layout cases`;
}
