async (page) => {
  const ok = (value, message) => {
    if (!value) throw Error(message);
  };
  const base = "http://127.0.0.1:4176/";
  const errors = [],
    failed = [],
    apiCalls = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 400) failed.push(r.url());
  });
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/")) apiCalls.push(r.url());
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + "?v=1.3.1");
  await page.locator("#home-title").waitFor();
  ok(
    await page.locator(".sidebar").isHidden(),
    "home has independent navigation",
  );
  ok(
    (await page.locator("h1:visible").count()) === 1,
    "single visible page title",
  );
  ok(
    (await page.evaluate(() =>
      sessionStorage.getItem("fieldlens.demo.session.v1"),
    )) === null,
    "home does not seed demo records",
  );
  await page.locator("#home-explore").click();
  await page.locator("#home-features").scrollIntoViewIfNeeded();
  ok(
    (await page.locator("#home-features").isVisible()) &&
      !new URL(page.url()).hash,
    "feature navigation retains home route",
  );
  await page.locator(".home-nav-action").click();
  await page.locator("#sample-top").click();
  await page.locator("#inspection-note").fill("保留这份未保存的记录");
  await page.locator(".brand").click();
  await page.locator(".home-nav-action").click();
  ok(
    (await page.locator("#inspection-note").inputValue()) ===
      "保留这份未保存的记录",
    "home round trip preserves workspace draft",
  );
  await page.locator(".brand").click();
  await page.locator(".home-button").click();
  ok(
    new URL(page.url()).searchParams.get("demo") === "1",
    "primary action enters independent demo",
  );
  ok(
    await page.locator("#specimen").isVisible(),
    "primary action opens a sample",
  );
  ok(
    !(await page.locator(".capability-banner").count()),
    "demo workspace avoids duplicate notice",
  );
  ok(
    await page.locator(".demo-session-banner").isVisible(),
    "demo provenance remains visible",
  );
  await page.locator("#demo-exit").click();
  ok(
    (await page.locator("#inspection-note").inputValue()) ===
      "保留这份未保存的记录",
    "exiting demo restores personal draft",
  );
  const routes = [
    "home",
    "workspace",
    "history",
    "dashboard",
    "assistant",
    "demo",
    "login",
    "guide",
    "about",
  ];
  let checks = 0;
  for (const theme of ["classic", "field", "dark", "sand"]) {
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const route of routes) {
        await page.goto(base + "?demo=1#" + route);
        await page.locator("#main :is(h1,h2):visible").first().waitFor();
        await page
          .locator(route === "home" ? "#home-theme" : "#ui-theme")
          .selectOption(theme);
        await page.evaluate(() =>
          Promise.all(
            document
              .getAnimations()
              .filter((a) => a.effect?.getTiming().iterations !== Infinity)
              .map((a) => a.finished.catch(() => {})),
          ),
        );
        await page
          .locator("#main :is(h1,h2):visible")
          .first()
          .scrollIntoViewIfNeeded();
        ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `no overflow: ${route}/${theme}/${width}`,
        );
        ok(
          (await page.evaluate(
            () => document.documentElement.dataset.uiTheme,
          )) === theme,
          `theme: ${route}`,
        );
        if (route === "assistant" && theme === "dark") {
          ok(
            await page
              .locator(".helper-quick .button")
              .first()
              .evaluate(
                (el) =>
                  getComputedStyle(el).backgroundColor === "rgb(44, 44, 46)",
              ),
            "dark helper button surface",
          );
        }
        const typeSelectors =
          route === "home"
            ? [".home-intro", ".home-button", ".home-nav-action"]
            : route === "assistant"
              ? [
                  ".helper-tabs button",
                  ".helper-quick .button",
                  "#helper-query",
                  ".field-label",
                ]
              : route === "history"
                ? [
                    "#records-table td",
                    ".record-actions .text-button",
                    ".history-filters label",
                    ".record-toolbar .button",
                  ]
                : route === "workspace"
                  ? [".field-label", ".empty-upload strong", ".button"]
                  : [];
        for (const selector of typeSelectors) {
          for (const element of await page
            .locator(selector + ":visible")
            .all()) {
            ok(
              await element.evaluate(
                (el) => parseFloat(getComputedStyle(el).fontSize) >= 14,
              ),
              `type size: ${route}/${selector}/${width}`,
            );
          }
        }
        if (route === "history") {
          const colors = await page
            .locator(".record-stats strong")
            .evaluateAll((els) => els.map((el) => getComputedStyle(el).color));
          ok(
            new Set(colors).size === 4,
            "stats have distinct information, warning, success and demo accents",
          );
        }
        if (route === "home") {
          for (const img of await page.locator(".home-page img").all()) {
            await img.scrollIntoViewIfNeeded();
            await img.evaluate((el) => el.decode());
            ok(
              await img.evaluate((el) => el.naturalWidth > 0),
              "home asset is available",
            );
          }
        }
        checks++;
      }
    }
  }
  await page.goto(base + "#home");
  await page.locator("#home-theme").selectOption("dark");
  await page.reload();
  await page.locator("#home-title").waitFor();
  ok(
    (await page.locator("#home-theme").inputValue()) === "dark",
    "home theme persists",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator("#home-explore").click();
  ok(
    await page.locator("#home-features").isVisible(),
    "reduced motion navigation",
  );
  await page.goto(base + "#workspace");
  await page.locator("[data-skin-open]").first().click();
  await page.locator('[data-skin-choice][value="classic"]').check();
  await page.locator("#skin-done").click();
  ok(!errors.length, errors.join(";"));
  ok(!failed.length, "failed resources: " + failed.join(";"));
  ok(!apiCalls.length, "static UI makes no API calls");
  return `PASS: home entries, draft/demo isolation, ${checks} theme/layout cases, readable type sizes, distinct semantic colors, assets, reduced motion and skin controls`;
}
