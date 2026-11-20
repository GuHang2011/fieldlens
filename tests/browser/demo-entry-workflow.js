async (page) => {
  const base = "http://127.0.0.1:4176/";
  const failures = [], errors = [];
  const check = (value, message) => { if (!value) failures.push(message); };
  const browser = page.context().browser();
  const assistantLink = (p) => p.getByRole("link", { name: "体验复核助手：操作答疑与记录整理 →" });
  const navigate = async (p, route) => {
    const link = p.locator(`[data-view="${route}"]`);
    if (!(await link.isVisible())) await p.locator("#navigation-toggle").click();
    await link.click();
  };
  for (const width of [390, 1440]) {
    for (const personal of [false, true]) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 } });
      const p = await context.newPage();
      p.on("pageerror", (error) => errors.push(error.message));
      try {
        await p.goto(base + "#workspace");
        if (personal) {
          await p.locator("#sample-top").click();
          await p.locator("#inspection-note").fill("个人样本的已保存备注");
          await p.locator("#save").click();
          await p.locator("#inspection-note").fill("叶背需补拍，个人草稿保留");
        }
        const saved = await p.evaluate(() => localStorage.getItem("fieldlens.history"));
        await navigate(p, "demo");
        await assistantLink(p).click();
        await p.locator("#helper-tab-records").click();
        const active = new URL(p.url()).searchParams.get("demo") === "1";
        check(active, `assistant demo entry activates the demo space at ${width}/${personal}`);
        check(await p.locator(".demo-session-banner").isVisible(), `assistant demo entry identifies the demo scope at ${width}/${personal}`);
        check(await p.locator("#helper-record option").count() === 12, `assistant demo entry provides twelve preset records at ${width}/${personal}`);
        check(await p.locator("#helper-record option").evaluateAll((options) => options.every((option) => option.value.startsWith("demo-case-"))), `assistant demo entry does not expose personal records at ${width}/${personal}`);
        check(!(await p.locator("#helper-review").isDisabled()), `assistant demo checklist is available at ${width}/${personal}`);
        if (!(await p.locator("#helper-review").isDisabled())) {
          await p.locator("#helper-review").click();
          check(await p.locator("#helper-local-answer").isVisible(), `assistant demo checklist can be generated at ${width}/${personal}`);
        }
        check(await p.evaluate(() => localStorage.getItem("fieldlens.history")) === saved, `entering assistant demo preserves personal storage at ${width}/${personal}`);
        if (active) {
          await p.locator("#demo-exit").click();
          check(!new URL(p.url()).searchParams.has("demo"), `assistant demo exit restores personal scope at ${width}/${personal}`);
          if (personal) check(await p.locator("#inspection-note").inputValue() === "叶背需补拍，个人草稿保留", `assistant demo round trip restores the personal draft at ${width}`);
        }
      } finally { await context.close(); }
    }

    const activeContext = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 } });
    const active = await activeContext.newPage();
    active.on("pageerror", (error) => errors.push(error.message));
    try {
      await active.goto(base + "?demo=1#history");
      await active.locator('[data-details="demo-case-01"]').click();
      await active.locator("#record-notes").fill("已完成本次演示复核，保留修改");
      await active.locator("#record-reviewed").check();
      await active.locator("#save-review").click();
      const modified = await active.evaluate(() => sessionStorage.getItem("fieldlens.demo.session.v1"));
      await navigate(active, "demo");
      await assistantLink(active).focus();
      await active.keyboard.press("Enter");
      await active.locator("#helper-tab-records").click();
      check(await active.locator("#helper-record option").count() === 12, `active assistant demo retains twelve records at ${width}`);
      check(await active.evaluate(() => sessionStorage.getItem("fieldlens.demo.session.v1")) === modified, `reentering assistant demo keeps existing demo edits at ${width}`);
      await active.locator("#helper-record").selectOption("demo-case-01");
      await active.locator("#helper-review").click();
      check((await active.locator("#helper-local-text").textContent()).includes("整条记录：已人工查看"), `assistant reads the edited demo record at ${width}`);
    } finally { await activeContext.close(); }

    const guideContext = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 } });
    const guide = await guideContext.newPage();
    guide.on("pageerror", (error) => errors.push(error.message));
    try {
      await guide.goto(base + "#workspace");
      await guide.locator("#start-guide").click();
      await guide.keyboard.press("Escape");
      check(await guide.locator("#start-guide").evaluate((el) => document.activeElement === el), `guide returns to its connected opener at ${width}`);
      await guide.keyboard.press("Enter");
      for (let step = 0; step < 3; step++) await guide.locator("#guide-next").click();
      await guide.locator("#guide-locate").click();
      await guide.waitForURL((url) => url.hash === "#history");
      await guide.waitForFunction(() => document.querySelector(".history-panel")?.classList.contains("guide-highlight"));
      await guide.locator("#guide-close").click();
      check(await guide.locator("#onboarding-open").evaluate((el) => document.activeElement === el), `guide falls back when its original opener was replaced at ${width}`);
      check(await guide.locator(".guide-highlight").count() === 0, `closing guide clears the target highlight at ${width}`);

      await guide.locator("#onboarding-open").click();
      await guide.keyboard.press("Escape");
      check(await guide.locator("#onboarding-open").evaluate((el) => document.activeElement === el), `header guide opener still receives focus at ${width}`);

      await navigate(guide, "workspace");
      await guide.locator("#start-guide").click();
      for (let step = 0; step < 6; step++) await guide.locator("#guide-next").click();
      check(await guide.locator("#start-guide").count() === 0, `completion removes the welcome prompt at ${width}`);
      check(await guide.locator("#onboarding-open").evaluate((el) => document.activeElement === el), `completed guide focuses an element that survives welcome removal at ${width}`);
      await guide.keyboard.press("Enter");
      const replayed = await guide.locator(".onboarding-dialog").isVisible();
      check(replayed, `Enter reopens guidance after completion at ${width}`);
      if (replayed) await guide.keyboard.press("Escape");
      check(await guide.evaluate(() => localStorage.getItem("fieldlens.guide.v1")) === "done", `guide completion remains persisted at ${width}`);
    } finally { await guideContext.close(); }
  }
  check(!errors.length, errors.join("; "));
  if (failures.length) throw Error(failures.join("\n"));
  return "PASS: first-use assistant demo entry, personal storage/draft isolation and active demo preservation at 390/1440, plus guide focus restoration for connected/replaced/removed-on-completion openers and keyboard replay";
}
