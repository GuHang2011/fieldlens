async (page) => {
  const ok = (v, m) => {
    if (!v) throw Error(m);
  };
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install();
  const base = "http://127.0.0.1:4176/";
  await page.goto(base);
  await page.locator("#sample-top").click();
  await page.locator("#inspection-note").fill("主题切换保留草稿");
  for (const theme of ["field", "dark", "classic"]) {
    await page.locator("#ui-theme").selectOption(theme);
    ok(
      (await page.locator("#inspection-note").inputValue()) ===
        "主题切换保留草稿",
      "theme preserves draft",
    );
    ok(
      (await page.locator("#specimen").count()) === 1,
      "theme preserves image",
    );
  }
  await page.locator("#save").click();
  await page.locator("#ui-theme").selectOption("dark");
  await page.reload();
  ok(
    (await page.locator("#ui-theme").inputValue()) === "dark",
    "theme persists",
  );
  for (const theme of ["classic", "field", "dark"]) {
    await page.locator("#ui-theme").selectOption(theme);
    for (const route of [
      "workspace",
      "history",
      "login",
      "guide",
      "about",
      "dashboard",
    ]) {
      await page.goto(base + "#" + route);
      for (const width of [360, 768, 1920]) {
        await page.setViewportSize({ width, height: 1080 });
        ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          "overflow " + theme + " " + route + " " + width,
        );
      }
    }
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(base + "#dashboard");
  const size = () =>
    page
      .locator(".screen-stats strong")
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const standard = await size();
  await page.locator("#screen-distance").selectOption("far");
  const far = await size();
  await page.locator("#screen-distance").selectOption("hall");
  const hall = await size();
  ok(far > standard * 1.2 && hall > far * 1.2, "readable distance scaling");
  await page.locator("#screen-source").selectOption("model");
  await page.locator("#screen-days").selectOption("30");
  await page.reload();
  ok(
    (await page.locator("#screen-distance").inputValue()) === "hall",
    "distance persists",
  );
  ok(
    (await page.locator("#screen-source").inputValue()) === "model" &&
      (await page.locator("#screen-days").inputValue()) === "30",
    "filter preferences persist",
  );
  ok(
    await page.locator(".screen-empty-banner").isVisible(),
    "no fabricated dashboard data",
  );
  await page.locator("#screen-source").selectOption("all");
  await page.locator(".trend-values summary").click();
  await page.locator("#screen-refresh").click();
  ok(
    await page.locator(".trend-values").evaluate((el) => el.open),
    "refresh preserves expanded details",
  );
  await page.locator(".trend-values summary").click();
  await page.locator("#screen-focus").click();
  ok(
    (await page.locator(".sidebar").isHidden()) &&
      (await page.locator(".topbar").isHidden()),
    "presentation hides application chrome",
  );
  ok(
    (await page.locator(".screen-trend").isVisible()) &&
      (await page.locator(".screen-tasks").isHidden()),
    "overview slide",
  );
  await page.locator('[data-screen-slide="followup"]').click();
  ok(
    (await page.locator(".screen-tasks").isVisible()) &&
      (await page.locator(".screen-trend").isHidden()),
    "followup slide",
  );
  await page.locator("#screen-rotate").click();
  await page.clock.fastForward(15001);
  ok(await page.locator(".screen-trend").isVisible(), "automatic rotation");
  await page.locator("#screen-rotate").click();
  await page.clock.fastForward(30001);
  ok(await page.locator(".screen-trend").isVisible(), "paused rotation");
  await page.locator("#screen-settings-toggle").click();
  await page.locator("#screen-theme").selectOption("field");
  ok(
    (await page.locator("#ui-theme").inputValue()) === "field",
    "both theme controls synchronized",
  );
  for (const width of [360, 390, 768, 1440, 1920, 2560, 3840]) {
    await page.setViewportSize({ width, height: width === 3840 ? 2160 : 1080 });
    ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "hall overflow " + width,
    );
    ok(
      await page.locator("#screen-focus").isVisible(),
      "exit remains available " + width,
    );
  }
  await page.locator("#screen-settings-toggle").click();
  const liveUpdate = await page.context().newPage();
  await liveUpdate.goto(base);
  await liveUpdate.locator("#sample-top").click();
  await liveUpdate.locator("#save").click();
  await page.waitForFunction(() =>
    document.querySelector(".screen-legend.demo")?.textContent.includes("2"),
  );
  ok(
    (await page.locator("#screen-board").getAttribute("data-distance")) ===
      "hall" &&
      (await page.locator("#screen-focus").getAttribute("aria-pressed")) ===
        "true",
    "new records preserve presentation and settings",
  );
  await liveUpdate.close();
  await page.locator("#screen-fullscreen").click();
  ok(
    await page.evaluate(() => !!document.fullscreenElement),
    "native fullscreen",
  );
  await page.locator("#screen-fullscreen").click();
  await page.waitForFunction(
    () => !document.body.classList.contains("screen-presenting"),
  );
  ok(
    await page.locator(".sidebar").isVisible(),
    "native fullscreen exit also restores application",
  );
  await page.locator("#screen-focus").click();
  await page.keyboard.press("Escape");
  ok(await page.locator(".sidebar").isVisible(), "escape restores navigation");
  ok(
    (await page.locator("#screen-rotate").getAttribute("aria-pressed")) ===
      "false",
    "exit pauses rotation",
  );
  await page.locator("#screen-focus").click();
  await page.locator('[data-screen-slide="followup"]').click();
  await page.getByRole("link", { name: "查看全部 →" }).click();
  ok(
    await page.locator(".sidebar").isVisible(),
    "route cleanup restores shell",
  );
  await page.goto(base + "#history");
  await page.locator("[data-details]").first().click();
  await page.locator("#record-notes").fill("跨标签主题切换保留详情草稿");
  const other = await page.context().newPage();
  await other.goto(base);
  await other.locator("#ui-theme").selectOption("dark");
  await page.waitForFunction(
    () => document.documentElement.dataset.uiTheme === "dark",
  );
  ok(
    (await page.locator("#record-notes").inputValue()) ===
      "跨标签主题切换保留详情草稿",
    "storage event does not rerender dirty editor",
  );
  await other.close();
  await page.locator("#save-review").click();
  await page.locator("#report-records").click();
  ok(
    (await page
      .locator(".report-paper")
      .evaluate((el) => getComputedStyle(el).backgroundColor)) ===
      "rgb(255, 255, 255)",
    "report preview stays white",
  );
  await page.emulateMedia({ media: "print" });
  ok(
    (await page
      .locator(".report-paper")
      .evaluate((el) => getComputedStyle(el).color)) === "rgb(48, 49, 51)",
    "print text stays dark",
  );
  await page.emulateMedia({ media: "screen" });
  const isolated = await page.context().browser().newContext();
  try {
    await isolated.addInitScript(() => {
      Storage.prototype.getItem = () => {
        throw new Error("storage disabled");
      };
      Storage.prototype.setItem = () => {
        throw new Error("storage disabled");
      };
    });
    const p = await isolated.newPage();
    await p.goto(base + "#dashboard");
    await p.locator("#ui-theme").selectOption("dark");
    await p.locator("#screen-distance").selectOption("far");
    ok(
      (await p.locator("#screen-board").getAttribute("data-distance")) ===
        "far",
      "controls still work when storage is disabled",
    );
  } finally {
    await isolated.close();
  }
  ok(!errors.length, errors.join(";"));
  return "PASS: three themes, draft retention, persistence, 54 route layouts, distance scaling, 7 presentation widths including 4K, slide rotation/pause, fullscreen/Escape/route cleanup, cross-tab theme sync, white print report and denied storage";
}
