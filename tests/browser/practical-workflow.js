async (page) => {
  const ok = (v, m) => {
    if (!v) throw Error(m);
  };
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const base = "http://127.0.0.1:4176/";
  await page.goto(base);
  await page.evaluate(() => localStorage.removeItem("fieldlens.history"));
  await page.reload();
  await page.evaluate(() => {
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      if (blob.type === "application/json") window.lastJSON = blob.text();
      return create(blob);
    };
  });
  await page
    .getByRole("button", { name: "加载示例并查看", exact: true })
    .click();
  await page.locator(".sample-details summary").click();
  await page.locator("#workspace-code").fill("A-001");
  await page.locator("#workspace-crop").fill("番茄");
  await page.locator("#workspace-plot").fill("A区温室");
  await page.locator("#workspace-batch").fill("11月巡检");
  await page.locator('[data-sample="collectedAt"]').fill("2026-11-01T09:00");
  await page.locator("#save").click();
  ok(await page.locator("#save").isDisabled(), "sample dedup");
  await page.locator("#workspace-plot").fill("B区温室");
  await page.locator("#save").click();
  ok(
    (await page.evaluate(
      () => JSON.parse(localStorage.getItem("fieldlens.history")).length,
    )) === 1,
    "metadata update no duplicate",
  );
  await page.getByRole("button", { name: "检测记录", exact: true }).click();
  await page.locator(".advanced-filters summary").click();
  await page.locator("#filter-plot").selectOption("B区温室");
  await page.locator("#filter-batch").selectOption("11月巡检");
  await page.locator("#filter-from").fill("2026-11-01");
  await page.locator("#filter-to").fill("2026-11-01");
  ok(
    (await page.locator("[data-details]").count()) === 1,
    "combined metadata date filter",
  );
  await page.locator("#filter-to").fill("2026-10-01");
  ok(await page.locator("#filter-error").isVisible(), "date validation");
  await page.locator("#reset-filters").click();
  await page.locator("[data-details]").click();
  await page.locator("#followup-enabled").check();
  await page.locator("#save-review").click();
  ok(await page.locator("#detail-error").isVisible(), "reason required");
  await page.locator("#followup-reason").fill("需要补拍");
  const today = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  await page.locator("#followup-date").fill(today);
  await page.locator("#record-reviewed").check();
  await page.locator("#save-review").click();
  await page.locator('[data-task="today"]').click();
  ok(
    (await page.locator("[data-details]").count()) === 1,
    "reviewed still due",
  );
  await page.locator("#backup-export").click();
  const backup = await page.evaluate(async () =>
    JSON.parse(await window.lastJSON),
  );
  ok(
    backup.schemaVersion === 1 &&
      backup.records[0].sample.code === "A-001" &&
      backup.records[0].followUp.status === "pending",
    "complete backup",
  );
  const upload = async (data) =>
    page
      .locator("#backup-file")
      .setInputFiles({
        name: "backup.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(data)),
      });
  await upload(backup);
  await page.locator("#backup-dialog").waitFor({ state: "visible" });
  ok(
    await page.locator("#backup-confirm").isDisabled(),
    "duplicate import disabled",
  );
  await page.locator("#backup-close").click();
  const imported = {
    ...backup,
    records: [
      { ...backup.records[0], notes: "导入的复核备注" },
      {
        ...backup.records[0],
        id: "new-import",
        sample: { ...backup.records[0].sample, code: "B-002" },
        followUp: null,
      },
      { id: "bad", mode: "invalid" },
    ],
  };
  await upload(imported);
  await page.locator("#backup-dialog").waitFor({ state: "visible" });
  ok(
    (await page.locator('[data-import="0"]').inputValue()) === "skip",
    "conflict defaults to keep",
  );
  await page.locator(".conflict-details summary").click();
  ok(
    (await page.locator(".conflict-details .comparison-body").count()) === 2,
    "conflict review",
  );
  await page.locator('[data-import="0"]').selectOption("replace");
  await page.locator("#backup-confirm").click();
  ok(
    (await page.evaluate(
      () => JSON.parse(localStorage.getItem("fieldlens.history")).length,
    )) === 2,
    "valid entries imported",
  );
  await page.locator('[data-task="all"]').click();
  await page
    .locator("[data-details]")
    .filter({ hasText: "详情" })
    .first()
    .click();
  await page.locator("#close-detail").click();
  await page.locator("#record-query").fill("A-001");
  await page.locator("[data-details]").click();
  await page.locator("#followup-status").selectOption("done");
  await page.locator("#followup-link").selectOption("new-import");
  await page.locator("#followup-note").fill("已补拍，参见关联记录");
  await page.locator("#save-review").click();
  await page.locator('[data-task="today"]').click();
  ok(
    (await page.locator("[data-details]").count()) === 0,
    "completed task leaves today list",
  );
  await page.locator("#reset-filters").click();
  await page.reload();
  ok(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("fieldlens.history")).some(
        (r) =>
          r.followUp?.linkedRecordId === "new-import" &&
          r.followUp.status === "done",
      ),
    ),
    "task persists",
  );
  // Failed storage preserves form and data; closing dirty form requires a decision.
  await page.locator("#record-query").fill("A-001");
  await page.locator("[data-details]").click();
  await page.locator("#record-notes").fill("未保存输入");
  await page.evaluate(() => {
    window.savedSet = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw Error("quota");
    };
  });
  await page.locator("#save-review").click();
  ok(
    await page.locator("#detail-error").isVisible(),
    "storage error visible in modal",
  );
  await page.evaluate(() => {
    Storage.prototype.setItem = window.savedSet;
    window.confirm = () => false;
  });
  await page.locator("#close-detail").click();
  ok(
    await page.locator("#record-dialog").evaluate((d) => d.open),
    "cancel discard retains editor",
  );
  await page.evaluate(() => (location.hash = "guide"));
  await page.waitForFunction(() => location.hash === "#history");
  ok(
    (await page.locator("#record-notes").inputValue()) === "未保存输入",
    "route cancellation preserves input",
  );
  await page.evaluate(() => (window.confirm = () => true));
  await page.locator("#close-detail").click();
  // Full capacity: no eviction and import fails atomically.
  await page.evaluate(() => {
    const r = JSON.parse(localStorage.getItem("fieldlens.history"))[0];
    localStorage.setItem(
      "fieldlens.history",
      JSON.stringify(
        Array.from({ length: 30 }, (_, i) => ({ ...r, id: "capacity-" + i })),
      ),
    );
  });
  await page.reload();
  await upload(imported);
  await page.locator("#backup-dialog").waitFor({ state: "visible" });
  ok(
    (await page.locator("#backup-confirm").isDisabled()) &&
      (await page.locator("#backup-error").isVisible()),
    "overcapacity import blocked",
  );
  await page.locator("#backup-close").click();
  await page.getByRole("button", { name: "图像检测", exact: true }).click();
  await page
    .getByRole("button", { name: "加载示例并查看", exact: true })
    .click();
  await page.locator("#save").click();
  ok(
    (await page.evaluate(
      () => JSON.parse(localStorage.getItem("fieldlens.history")).length,
    )) === 30,
    "capacity preserved",
  );
  ok(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("fieldlens.history")).some(
        (r) => r.id === "capacity-29",
      ),
    ),
    "oldest retained",
  );
  ok(
    !(await page.locator("#export").isDisabled()) &&
      !(await page.locator("#save").isDisabled()),
    "unsaved result retained",
  );
  await page.getByRole("link", { name: "查看复查待办" }).click();
  ok(
    (await page
      .locator('[data-task="pending"]')
      .getAttribute("aria-pressed")) === "true",
    "workspace task shortcut",
  );
  await page.locator("#reset-filters").click();
  for (const hash of ["#workspace", "#history", "#guide", "#about"]) {
    await page.goto(base + hash);
    for (const width of [360, 390, 768, 1440, 1920, 2560]) {
      await page.setViewportSize({ width, height: 1000 });
      ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        hash + " overflow " + width,
      );
    }
  }
  ok(!errors.length, errors.join(";"));
  await page.evaluate(() => sessionStorage.setItem("practical-test", "passed"));
  return "PASS: sample/date filters, task lifecycle, backup preview/duplicate/conflict/invalid, atomic capacity protection, storage failure, discard confirmation and 24 responsive layouts";
};
