async (page) => {
  const ok = (v, m) => {
    if (!v) throw Error(m);
  };
  await page.goto("http://127.0.0.1:4176/");
  await page.locator("#sample-top").click();
  await page.locator("#inspection-note").fill("换肤保留的巡检草稿");
  await page.locator("[data-skin-open]").click();
  for (const skin of ["sand", "dark", "field", "classic"]) {
    await page.locator(`[data-skin-choice][value="${skin}"]`).check();
    ok(
      (await page.evaluate(() => document.documentElement.dataset.uiTheme)) ===
        skin,
      "skin " + skin,
    );
    ok(
      (await page.locator("#inspection-note").inputValue()) ===
        "换肤保留的巡检草稿",
      "draft retained",
    );
  }
  await page.locator('[data-skin-choice][value="system"]').check();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForFunction(
    () => document.documentElement.dataset.uiTheme === "dark",
  );
  await page.emulateMedia({ colorScheme: "light" });
  await page.waitForFunction(
    () => document.documentElement.dataset.uiTheme === "classic",
  );
  ok(
    (await page.locator("#ui-theme").inputValue()) === "system",
    "system choice remains selected",
  );
  await page.locator("#skin-done").click();
  await page.reload();
  ok(
    (await page.locator("#ui-theme").inputValue()) === "system",
    "system preference persists",
  );
  await page.locator("[data-skin-open]").click();
  await page.locator("#skin-reset").click();
  ok(
    await page.locator('[data-skin-choice][value="classic"]').isChecked(),
    "restore default",
  );
  await page.keyboard.press("Escape");
  ok(
    (await page.locator(".skin-dialog").count()) === 0,
    "Escape closes chooser",
  );
  for (const skin of ["sand", "dark"]) {
    await page.locator("#ui-theme").selectOption(skin);
    for (const route of [
      "workspace",
      "history",
      "dashboard",
      "login",
      "guide",
      "about",
    ]) {
      await page.goto("http://127.0.0.1:4176/#" + route);
      for (const width of [360, 390, 768, 1920]) {
        await page.setViewportSize({ width, height: 900 });
        ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          "overflow " + skin + " " + route + " " + width,
        );
      }
    }
  }
  await page.goto("http://127.0.0.1:4176/#dashboard");
  await page.locator("#screen-fullscreen").click();
  await page.locator("#screen-settings [data-skin-open]").click();
  ok(
    await page.locator(".skin-dialog").isVisible(),
    "chooser inside native fullscreen",
  );
  await page.locator('[data-skin-choice][value="sand"]').check();
  await page.locator("#skin-close").click();
  await page.locator("#screen-fullscreen").click();
  await page.goto("http://127.0.0.1:4176/#workspace");
  await page.locator("[data-skin-open]").click();
  for (const width of [360, 390, 768, 1920]) {
    await page.setViewportSize({ width, height: 640 });
    const box = await page.locator(".skin-dialog").boundingBox();
    ok(
      box.x >= 0 &&
        box.width <= width &&
        box.y >= 0 &&
        box.y + box.height <= 640,
      "chooser fits " + width,
    );
    ok(await page.locator("#skin-done").isVisible(), "done remains accessible");
  }
  await page.locator("#skin-close").click();
  return "PASS: skin previews, four palettes, follow-system media changes, persistence, reset, preserved drafts, 48 page layouts, 4 chooser sizes and fullscreen chooser";
}
