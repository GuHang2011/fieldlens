async (page) => {
  const ok = (v, m) => {
    if (!v) throw Error(m);
  };
  const base = "http://127.0.0.1:4176/";
  const key = "fieldlens.demo.session.v1";
  const errors = [],
    requests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      requests.push(request.url());
  });
  const records = () =>
    page.evaluate((k) => JSON.parse(sessionStorage.getItem(k)), key);
  await page.goto(base + "#workspace");
  await page.locator("#sample-top").click();
  await page.locator("#inspection-note").fill("个人记录保留");
  await page.locator("#save").click();
  const personal = await page.evaluate(() =>
    localStorage.getItem("fieldlens.history"),
  );
  await page
    .locator("#file-input")
    .setInputFiles({
      name: "personal-photo.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jz9sAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  await page.waitForFunction(
    () =>
      document.querySelector("#file-name")?.textContent ===
      "personal-photo.png",
  );
  await page.locator("#inspection-note").fill("未保存的个人草稿");
  await page.locator('[data-view="demo"]').click();
  ok(
    (await page.evaluate((k) => sessionStorage.getItem(k), key)) === null,
    "opening center does not seed data",
  );
  await page.locator('[data-demo-go="workspace"]').first().click();
  ok(
    new URL(page.url()).searchParams.get("demo") === "1",
    "shareable demo location",
  );
  ok(
    await page.locator(".demo-session-banner").isVisible(),
    "scope is visible",
  );
  ok((await records()).length === 12, "twelve cases");
  ok(
    (await records()).every((r) => r.mode === "demo"),
    "preset provenance",
  );
  await page.locator("#save").click();
  ok((await records()).length === 13, "sample saved to demo only");
  await page.locator('[data-view="history"]').click();
  await page.locator('[data-details="demo-case-01"]').click();
  await page.locator('[data-region-status="0"]').selectOption("reject");
  await page.locator('[data-region-note="0"]').fill("演示复核修改");
  await page.locator("#save-review").click();
  ok(
    (await records()).find((r) => r.id === "demo-case-01").regionReviews[0]
      .note === "演示复核修改",
    "review saved",
  );
  await page.locator('[data-task="today"]').click();
  ok((await page.locator("[data-details]").count()) === 1, "today task works");
  await page.locator("#report-records").click();
  const report = page.getByRole("dialog", { name: "巡检报告预览" });
  ok((await report.locator(".report-record").count()) === 1, "filtered report");
  ok((await report.innerText()).includes("演示"), "report provenance");
  await report.locator("[data-close]").click();
  await page.locator("#reset-filters").click();
  await page.locator("#compare-records").click();
  const compare = page.getByRole("dialog", { name: "两次记录对比" });
  ok((await compare.innerText()).includes("预设演示"), "comparison warning");
  await compare.locator("[data-close]").click();
  await page.locator('[data-view="dashboard"]').click();
  ok(
    (await page.locator(".screen-legend.demo").innerText()).includes("13"),
    "dashboard uses demo records",
  );
  ok(
    (await page.locator("#screen-source").inputValue()) === "demo",
    "demo ignores personal dashboard filters",
  );
  await page.locator("#screen-distance").selectOption("hall");
  await page.locator("#screen-focus").click();
  ok(
    await page.locator(".demo-session-banner").isHidden(),
    "presentation hides scope banner",
  );
  await page.keyboard.press("Escape");
  await page.locator('[data-view="demo"]').click();
  for (const theme of ["classic", "field", "dark", "sand"]) {
    await page.locator("#ui-theme").selectOption(theme);
    for (const route of ["demo", "workspace", "history", "dashboard"]) {
      await page.locator(`[data-view="${route}"]`).click();
      for (const width of [360, 390, 768, 1440, 1920]) {
        await page.setViewportSize({ width, height: 900 });
        ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          "demo layout " + theme + " " + route + " " + width,
        );
      }
    }
  }
  await page.locator('[data-view="demo"]').click();
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text) => (window.sharedDemo = text) },
    }),
  );
  await page.locator("#demo-share").click();
  ok(
    (await page.evaluate(() => window.sharedDemo)) ===
      "https://guhang2011.github.io/fieldlens/?demo=1#demo",
    "clean demo link contains no data",
  );
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator("#demo-reset").click();
  ok((await records()).length === 13, "reset cancellation keeps edits");
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#demo-reset").click();
  ok((await records()).length === 12, "reset restores cases");
  ok(
    (await page.evaluate(() => localStorage.getItem("fieldlens.history"))) ===
      personal,
    "personal record bytes unchanged",
  );
  await page.locator("#demo-exit").click();
  ok(
    (await page.locator(".demo-session-banner").count()) === 0,
    "exit leaves demo scope",
  );
  ok(
    (await page.locator("#inspection-note").inputValue()) ===
      "未保存的个人草稿",
    "personal workspace draft restored",
  );
  await page.locator("#specimen").evaluate((el) => el.decode());
  ok(
    await page.locator("#specimen").evaluate((el) => el.naturalWidth === 1),
    "personal blob is not revoked by demo use",
  );
  await page.goBack();
  await page.locator(".demo-session-banner").waitFor();
  ok(
    new URL(page.url()).searchParams.get("demo") === "1",
    "back restores demo scope",
  );
  await page.goForward();
  await page.waitForFunction(
    () => !document.querySelector(".demo-session-banner"),
  );
  ok(
    (await page.evaluate(() => localStorage.getItem("fieldlens.history"))) ===
      personal,
    "history navigation preserves personal data",
  );

  await page.goto(base + "?demo=1#history");
  await page.locator('[data-details="demo-case-01"]').click();
  await page.locator("#record-notes").fill("刷新保留演示修改");
  await page.locator("#save-review").click();
  await page.reload();
  ok(
    (await records()).find((r) => r.id === "demo-case-01").notes ===
      "刷新保留演示修改",
    "demo refresh retains saved edits",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#clear").click();
  await page.reload();
  ok((await records()).length === 0, "empty stays empty after refresh");
  await page.locator("#demo-exit").click();
  await page.locator('[data-view="history"]').click();
  await page.locator("#records-total").waitFor();
  ok(
    (await page.locator("[data-details]").count()) === 1,
    "personal records restored after direct demo visit",
  );
  ok(!requests.length, "public demo never calls auth, model or AI services");

  const isolated = await page.context().browser().newContext();
  try {
    const p = await isolated.newPage();
    await p.addInitScript(() => {
      Object.defineProperty(window, "sessionStorage", {
        get() {
          throw Error("session storage denied");
        },
      });
    });
    await p.goto(base + "?demo=1#demo");
    ok(
      (await p.locator("#demo-storage-status").innerText()).includes(
        "刷新可能丢失",
      ),
      "denied storage is visible",
    );
    await p.locator('[data-demo-go="workspace"]').first().click();
    await p.locator("#save").click();
    await p.locator('[data-view="dashboard"]').click();
    ok(
      (await p.locator(".screen-legend.demo").innerText()).includes("13"),
      "memory-only demo remains usable",
    );
  } finally {
    await isolated.close();
  }
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ json: { enabled: true, user: null } }),
  );
  await page.route("**/api/health", (route) =>
    route.fulfill({ status: 401, json: { error: "sign in" } }),
  );
  await page.goto("http://127.0.0.1:5176/?demo=1#demo");
  ok(
    (await page.locator(".demo-session-banner").count()) === 0,
    "demo query cannot enable guest workspace on API deployment",
  );
  ok(
    await page.locator("[data-demo-go]").first().isDisabled(),
    "local demo buttons disabled",
  );
  await page.locator('[data-view="workspace"]').click();
  await page.locator("#login-form").waitFor();
  ok(
    await page.locator("#login-submit").isEnabled(),
    "real deployment still requires account",
  );
  ok(!errors.length, errors.join(";"));
  return "PASS: isolated twelve-case demo, personal records and image/draft retention, save/review/filter/report/compare/dashboard, reset/cancel, 80 theme/route layouts, share URL, refresh/empty persistence, history navigation, denied storage and API auth boundary";
}
