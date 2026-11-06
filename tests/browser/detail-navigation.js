async (page) => {
  const context = await page
    .context()
    .browser()
    .newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await context.newPage();
  const ok = (value, message) => {
    if (!value) throw Error(message);
  };
  const errors = [];
  p.on("pageerror", (error) => errors.push(error.message));
  try {
    await p.goto("http://127.0.0.1:4176/#workspace");
    await p.locator("#sample-top").click();
    await p.locator("#save").click();
    await p.getByRole("button", { name: "检测记录", exact: true }).click();
    await p.locator("[data-details]").click();
    const dialog = p.locator("#record-dialog");
    const tab = (name) => p.locator(`[data-detail-tab="${name}"]`);
    await tab("review").focus();
    for (const [key, selected] of [
      ["ArrowRight", "sample"],
      ["End", "ai"],
      ["ArrowRight", "review"],
      ["ArrowLeft", "ai"],
      ["Home", "review"],
    ]) {
      await p.keyboard.press(key);
      ok(
        await tab(selected).evaluate(
          (el) =>
            el === document.activeElement &&
            el.getAttribute("aria-selected") === "true",
        ),
        key + " activates and focuses " + selected,
      );
      ok(
        (await dialog.locator('[role="tabpanel"]:visible').count()) === 1,
        "one panel visible",
      );
    }
    ok(
      (await dialog.getAttribute("data-dirty")) === "false",
      "navigation does not dirty form",
    );
    await p.locator("#record-notes").fill("切换分区后继续保留");
    await p.locator('[data-region-note="0"]').fill("区域说明草稿");
    await tab("sample").click();
    await p.locator("#detail-code").fill("UI-017");
    await tab("followup").click();
    await p.locator("#followup-enabled").check();
    await tab("ai").click();
    await p.locator("#save-review").click();
    ok(
      (await tab("followup").getAttribute("aria-selected")) === "true",
      "validation opens offending panel",
    );
    ok(
      await p.locator("#detail-error").isVisible(),
      "validation message visible",
    );
    await p.locator("#followup-reason").fill("补拍叶背");
    await tab("review").click();
    ok(
      (await p.locator("#record-notes").inputValue()) === "切换分区后继续保留",
      "review draft survives tab change",
    );
    ok(
      (await p.locator('[data-region-note="0"]').inputValue()) ===
        "区域说明草稿",
      "region draft survives tab change",
    );
    for (const viewport of [
      { width: 360, height: 640 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1920, height: 1080 },
    ]) {
      await p.setViewportSize(viewport);
      for (const name of ["review", "sample", "followup", "ai"]) {
        await tab(name).click();
        const geometry = await dialog.evaluate((el) => {
          const footer = el
            .querySelector(".detail-footer")
            .getBoundingClientRect();
          const header = el
            .querySelector(".panel-heading")
            .getBoundingClientRect();
          const body = el.querySelector(".detail-scroll");
          body.scrollTop = body.scrollHeight;
          return {
            top: header.top,
            bottom: footer.bottom,
            visibleBody: body.clientHeight,
            overflow: body.scrollWidth > body.clientWidth + 1,
            outerOverflow: document.documentElement.scrollWidth > innerWidth,
          };
        });
        ok(
          geometry.top >= 0 &&
            geometry.bottom <= viewport.height &&
            geometry.visibleBody >= 120 &&
            !geometry.overflow &&
            !geometry.outerOverflow,
          name + " layout " + JSON.stringify({ viewport, geometry }),
        );
      }
    }
    await p.locator("#save-review").click();
    await p.locator("[data-details]").click();
    await tab("sample").click();
    ok(
      (await p.locator("#detail-code").inputValue()) === "UI-017",
      "sample persisted",
    );
    await tab("followup").click();
    ok(
      (await p.locator("#followup-reason").inputValue()) === "补拍叶背",
      "followup persisted",
    );
    await tab("review").click();
    ok(
      (await p.locator("#record-notes").inputValue()) === "切换分区后继续保留",
      "review persisted",
    );
    ok(!errors.length, errors.join("; "));
    return "PASS: keyboard tabs, clean navigation, draft retention, validation routing, cross-panel save and 16 dialog layouts (360x640 to 1920x1080).";
  } finally {
    await context.close();
  }
}
