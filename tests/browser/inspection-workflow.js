async (page) => {
  const context = await page.context().browser().newContext();
  const p = await context.newPage();
  const ok = (value, name) => {
    if (!value) throw Error(name);
  };
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  try {
    await p.goto("http://127.0.0.1:4176/");
    await p
      .getByRole("button", { name: "加载示例并查看", exact: true })
      .click();
    await p.locator(".sample-details summary").click();
    await p.locator("#workspace-code").fill("A-001");
    await p.locator("#workspace-plot").fill("一号温室");
    await p.locator("#save").click();
    await p.getByRole("button", { name: "检测记录", exact: true }).click();
    await p.locator("[data-details]").click();
    await p.locator('[data-region-status="0"]').selectOption("reject");
    await p.locator('[data-region-note="0"]').fill("边缘模糊，待补拍核对");
    await p.locator('[data-region-status="1"]').selectOption("keep");
    await p.locator("#save-review").click();
    let records = await p.evaluate(() =>
      JSON.parse(localStorage.getItem("fieldlens.history")),
    );
    ok(
      records[0].regionReviews.length === 2 &&
        records[0].detections.length === 3,
      "separate manual review",
    );
    await p.getByRole("button", { name: "图像检测", exact: true }).click();
    await p.locator("#inspection-note").fill("更新整图备注");
    await p.locator("#save").click();
    records = await p.evaluate(() =>
      JSON.parse(localStorage.getItem("fieldlens.history")),
    );
    ok(
      records.length === 1 && records[0].regionReviews.length === 2,
      "workspace update preserves reviews",
    );
    await p.getByRole("button", { name: "检测记录", exact: true }).click();
    await p.locator("[data-details]").click();
    await p.locator('[data-detail-tab="ai"]').click();

    ok(
      (await p.locator("#ai-check").isDisabled()) &&
        (await p.locator("#ai-send").isDisabled()),
      "static AI guard",
    );
    await p.locator("#close-detail").click();
    // Simulated second record tests mismatch labeling, not model accuracy.
    const second = {
      ...records[0],
      id: "second-test",
      date: "2026-11-04T01:00:00Z",
      mode: "model",
      model: "test-model",
      threshold: 0.7,
      regionReviews: [],
      sample: { ...records[0].sample, code: "B-002" },
    };
    await p
      .locator("#backup-file")
      .setInputFiles({
        name: "record.json",
        mimeType: "application/json",
        buffer: Buffer.from(
          JSON.stringify({
            application: "禾镜 FieldLens",
            schemaVersion: 1,
            records: [second],
          }),
        ),
      });
    await p.locator("#backup-confirm").click();
    await p.locator("#compare-records").click();
    const compare = p.getByRole("dialog", { name: "两次记录对比" });
    ok(
      (await compare.locator(".region-map svg").first().boundingBox()).height >
        100,
      "region map readable height",
    );
    ok((await compare.innerText()).includes("阈值不同"), "comparison warning");
    await p.locator("#compare-b").selectOption("second-test");
    ok(
      (await p.locator("#compare-content").innerText()).includes(
        "请选择两条不同",
      ),
      "same record validation",
    );
    await p.locator("#compare-b").selectOption(records[0].id);
    for (const width of [360, 390, 768, 1440, 1920, 2560]) {
      await p.setViewportSize({ width, height: 1000 });
      ok(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "comparison viewport " + width,
      );
    }
    await p.setViewportSize({ width: 1440, height: 1050 });
    await p.screenshot({
      path: "../output/playwright/inspection-comparison.png",
    });
    await compare.locator("[data-close]").click();
    await p.locator("#report-records").click();
    const report = p.getByRole("dialog", { name: "巡检报告预览" });
    ok(
      (await report.locator(".report-record").count()) === 2,
      "report selected records",
    );
    ok(
      (await report.locator(".report-group").count()) === 2,
      "report provenance groups",
    );
    await p.locator("#report-institution").fill("作物视觉实践课");
    for (const width of [360, 390, 768, 1440, 1920, 2560]) {
      await p.setViewportSize({ width, height: 1000 });
      ok(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "report viewport " + width,
      );
    }
    await p.emulateMedia({ media: "print" });
    ok(
      (await p
        .locator("#app")
        .evaluate((el) => getComputedStyle(el).display)) === "none",
      "print navigation hidden",
    );
    ok(await p.locator(".report-paper").isVisible(), "report printable");
    await p.pdf({
      path: "../output/playwright/inspection-report.pdf",
      format: "A4",
      preferCSSPageSize: true,
      printBackground: true,
    });
    await p.emulateMedia({ media: "screen" });
    await p.setViewportSize({ width: 1440, height: 1050 });
    await p.screenshot({ path: "../output/playwright/inspection-report.png" });
    await report.locator("[data-close]").click();
    await p.locator("#record-mode").selectOption("demo");
    await p.locator("#report-records").click();
    ok(
      (await p.locator(".report-record").count()) === 1,
      "filtered report excludes model",
    );
    await p.locator(".report-dialog [data-close]").click();
    // Development API UI with explicit fixtures, never calls a real provider.
    await p.route("**/api/health", (route) =>
      route.fulfill({ json: { ready: false, model: null } }),
    );
    await p.route("**/api/assistant/status", (route) =>
      route.fulfill({
        json: {
          configured: true,
          provider: "test.invalid",
          model: "mock-model",
        },
      }),
    );
    let sent,
      attempts = 0;
    await p.route("**/api/assistant", async (route) => {
      attempts++;
      sent = route.request().postDataJSON();
      if (attempts === 1)
        await route.fulfill({
          status: 429,
          json: { error: "平台限流，请稍后重试" },
        });
      else if (attempts === 2)
        await route.fulfill({
          json: {
            text: '<img src=x onerror="window.injected=true">\n模拟复核建议',
            model: "mock-model",
            provider: "test.invalid",
          },
        });
      else {
        await new Promise((resolve) => setTimeout(resolve, 600));
        await route
          .fulfill({
            json: {
              text: "过期回答",
              model: "mock-model",
              provider: "test.invalid",
            },
          })
          .catch(() => {});
      }
    });
    await p.goto("http://127.0.0.1:5176/");
    await p.evaluate(
      (r) => localStorage.setItem("fieldlens.history", JSON.stringify(r)),
      records,
    );
    await p.goto("http://127.0.0.1:5176/#history");
    await p.reload();
    await p.locator("[data-details]").click();
    await p.locator('[data-detail-tab="ai"]').click();

    await p.locator("#ai-check").click();
    await p.waitForFunction(() => !document.querySelector("#ai-send").disabled);
    await p.locator("#ai-send").click();
    await p.waitForFunction(() => !document.querySelector("#ai-error").hidden);
    ok(
      (await p.locator("#ai-error").innerText()).includes("限流"),
      "AI failure visible",
    );
    await p.locator("#ai-send").click();
    await p.locator("#ai-answer").waitFor({ state: "visible" });
    ok(!JSON.stringify(sent).includes("一号温室"), "AI metadata excluded");
    ok(sent.context.detections[0].review === "疑似误检", "AI manual context");
    ok(
      (await p.locator("#ai-text img").count()) === 0 &&
        !(await p.evaluate(() => window.injected)),
      "AI plain text rendering",
    );
    ok(
      (await p.locator("#record-dialog").getAttribute("data-dirty")) ===
        "false",
      "AI does not change records",
    );
    const download = p.waitForEvent("download");
    await p.locator("#ai-export").click();
    ok((await download).suggestedFilename().endsWith(".txt"), "AI text export");
    await p.locator("#ai-send").click();
    await p.locator("#ai-cancel").click();
    await p.waitForFunction(() =>
      document.querySelector("#ai-error").textContent.includes("取消"),
    );
    ok(
      !(await p.locator("#ai-answer").isVisible()),
      "cancel leaves no stale answer",
    );
    await p.locator("#ai-send").click();
    await p.locator("#close-detail").click();
    await p.locator("[data-details]").click();
    await p.locator('[data-detail-tab="ai"]').click();

    await p.waitForTimeout(800);
    ok(
      !(await p.locator("#ai-answer").isVisible()) &&
        (await p.locator("#ai-send").isDisabled()),
      "closed dialog request cannot update new editor",
    );
    for (const width of [360, 390, 768, 1440, 1920, 2560]) {
      await p.setViewportSize({ width, height: 1000 });
      ok(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "review viewport " + width,
      );
    }
    await p.setViewportSize({ width: 1440, height: 1050 });
    await p.screenshot({ path: "../output/playwright/inspection-review.png" });
    ok(!errors.length, errors.join(";"));
    return "PASS: region review persistence, workspace preservation, comparison warnings, filtered printable report/PDF, static AI guard, mocked AI success/failure/cancel/close isolation and 18 responsive layouts";
  } finally {
    await context.close();
  }
}
