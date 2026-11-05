async (page) => {
  const ok = (v, m) => {
    if (!v) throw Error(m);
  };
  const errors = [],
    calls = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/")) calls.push(r.url());
  });
  const base = "http://127.0.0.1:4176/";
  await page.goto(base + "#assistant");
  await page.locator("#helper-tab-records").click();
  ok(
    await page.locator("#helper-review").isDisabled(),
    "empty record checklist disabled",
  );
  await page.locator("#helper-overview").click();
  ok(
    (await page.locator("#helper-local-text").innerText()).includes(
      "当前范围没有记录",
    ),
    "honest empty overview",
  );
  await page.locator("#helper-tab-help").click();
  await page.locator("#helper-query").fill("怎样打开摄像头？");
  await page.locator("#helper-help-form button").click();
  ok(
    (await page.locator("#helper-help-results").innerText()).includes(
      "允许浏览器权限",
    ),
    "camera help",
  );
  await page.locator("#helper-query").fill("明天带伞吗");
  await page.locator("#helper-help-form button").click();
  ok(
    (await page.locator("#helper-help-status").innerText()).includes("未找到"),
    "unknown question fallback",
  );
  await page.locator('[data-help-topic="ai"]').click();
  ok(
    (await page.locator("#helper-help-results").innerText()).includes("服务端"),
    "configuration help",
  );
  await page.goto(base + "?demo=1#assistant");
  const before = await page.evaluate(() =>
    sessionStorage.getItem("fieldlens.demo.session.v1"),
  );
  const records = JSON.parse(before);
  await page.locator("#helper-tab-records").click();
  await page.locator("#helper-review").click();
  ok(
    (await page.locator("#helper-local-text").innerText()).includes("待确认 1"),
    "record checklist uses selected snapshot",
  );
  ok(
    (await page.locator("#helper-local-text").innerText()).includes(
      "未调用 AI",
    ),
    "rule output labeled",
  );
  const download = page.waitForEvent("download");
  await page.locator("#helper-export").click();
  const file = await download;
  ok(
    file.suggestedFilename() === "fieldlens-local-checklist.txt",
    "local export",
  );
  const { readFile } = await import("node:fs/promises");
  ok(
    (await readFile(await file.path(), "utf8")).includes("未调用 AI"),
    "export includes source",
  );
  await page.locator("#helper-record").selectOption("demo-case-11");
  ok(
    await page.locator("#helper-local-answer").isHidden(),
    "selection clears stale output",
  );
  await page.locator("#helper-review").click();
  ok(
    (await page.locator("#helper-local-text").innerText()).includes(
      "不能据此判断样本健康",
    ),
    "zero detections not health",
  );
  await page.locator("#helper-overview").click();
  ok(
    (await page.locator("#helper-local-text").innerText()).includes(
      "预设演示 12 条",
    ),
    "overview scope",
  );
  await page.locator("#helper-tab-platform").click();
  ok(
    (await page.locator("#ai-check").isDisabled()) &&
      (await page.locator("#ai-send").isDisabled()),
    "static cannot call AI",
  );
  ok(
    (await page.locator("#ai-payload").textContent()).includes("非模型推理"),
    "visible payload provenance",
  );
  for (const theme of ["classic", "field", "dark", "sand"]) {
    await page.locator("#ui-theme").selectOption(theme);
    for (const tab of ["help", "records", "platform"]) {
      await page.locator("#helper-tab-" + tab).click();
      for (const width of [360, 390, 768, 1440, 1920]) {
        await page.setViewportSize({ width, height: 900 });
        ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          "helper layout " + theme + " " + tab + " " + width,
        );
      }
    }
  }
  await page.locator("#helper-tab-help").focus();
  await page.keyboard.press("ArrowRight");
  ok(
    (await page
      .locator("#helper-tab-records")
      .getAttribute("aria-selected")) === "true",
    "keyboard tabs",
  );
  ok(
    (await page.evaluate(() =>
      sessionStorage.getItem("fieldlens.demo.session.v1"),
    )) === before,
    "assistant never edits records",
  );
  ok(!calls.length, "all public helper functions remain offline");

  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ json: { enabled: false, user: null } }),
  );
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { ready: false } }),
  );
  let statusMode = "normal",
    statusRelease,
    statusDone,
    answerMode = "normal",
    answerRelease,
    answerDone,
    payload;
  await page.route("**/api/assistant/status", async (route) => {
    if (statusMode === "deferred") {
      await new Promise((resolve) => (statusRelease = resolve));
      await route
        .fulfill({
          json: { configured: true, provider: "late-status", model: "stale" },
        })
        .catch(() => {});
      statusDone();
    } else
      await route.fulfill({
        json: {
          configured: statusMode !== "missing",
          provider: "test.invalid",
          model: "test-model",
        },
      });
  });
  await page.route("**/api/assistant", async (route) => {
    payload = route.request().postDataJSON();
    if (answerMode === "deferred") {
      await new Promise((resolve) => (answerRelease = resolve));
      await route
        .fulfill({
          json: {
            text: "STALE ANSWER",
            model: "late",
            provider: "test.invalid",
          },
        })
        .catch(() => {});
      answerDone();
    } else if (answerMode === "error")
      await route.fulfill({
        status: 429,
        json: { error: "模拟限流，请稍后重试" },
      });
    else if (answerMode === "invalid")
      await route.fulfill({
        json: { text: "", model: "test-model", provider: "test.invalid" },
      });
    else
      await route.fulfill({
        json: {
          text: '<img src=x onerror="window.injected=true">\n模拟平台复核建议',
          model: "test-model",
          provider: "test.invalid",
        },
      });
  });
  await page.goto("http://127.0.0.1:5176/#assistant");
  await page.evaluate(
    (r) => localStorage.setItem("fieldlens.history", JSON.stringify(r)),
    records,
  );
  await page.reload();
  await page.locator("#helper-tab-platform").click();
  const original = await page.evaluate(() =>
    localStorage.getItem("fieldlens.history"),
  );
  await page.locator("#ai-check").click();
  await page.waitForFunction(
    () => !document.querySelector("#ai-send").disabled,
  );
  await page.locator("#ai-question").fill("");
  await page.locator("#ai-send").click();
  ok(
    (await page.locator("#ai-error").innerText()).includes("请填写"),
    "empty question rejected",
  );
  await page.locator("#ai-question").fill("请整理复核事项");
  await page.locator("#ai-send").click();
  await page.locator("#ai-answer").waitFor({ state: "visible" });
  ok(
    payload.question === "请整理复核事项" &&
      payload.context.source.includes("预设"),
    "compatible API contract",
  );
  for (const value of [
    records[0].id,
    records[0].name,
    records[0].sample.plot,
    records[0].sample.code,
  ])
    ok(!JSON.stringify(payload).includes(value), "metadata excluded " + value);
  ok(
    (await page.locator("#ai-text img").count()) === 0 &&
      !(await page.evaluate(() => window.injected)),
    "response rendered as text",
  );
  const aiDownload = page.waitForEvent("download");
  await page.locator("#ai-export").click();
  const aiFile = await aiDownload;
  ok(
    (await readFile(await aiFile.path(), "utf8")).includes("未经人工确认"),
    "AI export attribution",
  );
  answerMode = "error";
  await page.locator("#ai-send").click();
  await page.waitForFunction(() =>
    document.querySelector("#ai-error").textContent.includes("限流"),
  );
  answerMode = "invalid";
  await page.locator("#ai-send").click();
  await page.waitForFunction(() =>
    document.querySelector("#ai-error").textContent.includes("有效文字"),
  );
  for (const action of ["cancel", "select", "refresh", "leave"]) {
    answerMode = "deferred";
    const done = new Promise((resolve) => (answerDone = resolve));
    await page.locator("#ai-check").click();
    await page.waitForFunction(
      () => !document.querySelector("#ai-send").disabled,
    );
    const requested = page.waitForRequest("**/api/assistant");
    await page.locator("#ai-send").click();
    await requested;
    if (action === "cancel") await page.locator("#ai-cancel").click();
    if (action === "select")
      await page.locator("#helper-record").selectOption("demo-case-02");
    if (action === "refresh") await page.locator("#helper-refresh").click();
    if (action === "leave")
      await page.locator('[data-view="workspace"]').click();
    answerRelease();
    await done;
    if (action === "leave") {
      await page.locator('[data-view="assistant"]').click();
      await page.locator("#helper-tab-platform").click();
    }
    await page.waitForFunction(
      () =>
        !document.querySelector("#ai-send")?.textContent.includes("正在整理"),
    );
    ok(
      await page.locator("#ai-answer").isHidden(),
      "stale answer discarded after " + action,
    );
  }
  statusMode = "deferred";
  const statusFinished = new Promise((resolve) => (statusDone = resolve));
  const checking = page.waitForRequest("**/api/assistant/status");
  await page.locator("#ai-check").click();
  await checking;
  await page.locator("#helper-record").selectOption("demo-case-03");
  statusRelease();
  await statusFinished;
  ok(
    (await page.locator("#ai-status").innerText()).includes("尚未检查"),
    "stale configuration discarded",
  );
  statusMode = "missing";
  await page.locator("#ai-check").click();
  await page.waitForFunction(
    () => !document.querySelector("#ai-check").disabled,
  );
  ok(
    await page.locator("#ai-send").isDisabled(),
    "unconfigured send stays disabled",
  );
  ok(
    (await page.evaluate(() => localStorage.getItem("fieldlens.history"))) ===
      original,
    "real adapter never mutates records",
  );
  const other = await page.context().newPage();
  try {
    await other.goto("http://127.0.0.1:5176/");
    await other.evaluate(() => {
      const r = JSON.parse(localStorage.getItem("fieldlens.history"));
      r[0].notes = "external change";
      localStorage.setItem("fieldlens.history", JSON.stringify(r));
    });
    await page.waitForFunction(() =>
      document
        .querySelector("#helper-snapshot-note")
        .textContent.includes("其他页面更新"),
    );
  } finally {
    await other.close();
  }
  await page.locator("#helper-refresh").click();
  ok(
    !(await page.locator("#helper-snapshot-note").innerText()).includes(
      "其他页面更新",
    ),
    "explicit refresh reads new snapshot",
  );
  await page.unroute("**/api/auth/session");
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ json: { enabled: true, user: null } }),
  );
  await page.reload();
  await page.locator("#login-form").waitFor();
  ok(
    (await page.locator("#helper-record").count()) === 0,
    "helper respects authenticated deployment",
  );
  ok(!errors.length, errors.join(";"));
  return "PASS: offline help/search/fallback, checklist/overview/export, 60 theme layouts, keyboard tabs, demo isolation, platform config and payload, safe text rendering, errors, cancel/switch/refresh/route disposal, stale status cleanup and cross-tab snapshot warning";
}
