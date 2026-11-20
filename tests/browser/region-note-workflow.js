async (page) => {
  const ok = (value, message) => { if (!value) throw Error(message); };
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:4176/#history");
  const detection = { label: "叶斑区域", confidence: 0.9, box: [0.1, 0.1, 0.6, 0.7] };
  const note = '第一行 <核对> & "说明"\n' + "ABC".repeat(65) + "\n最后一行：等待补拍";
  const record = {
    id: "multiline-review", name: "review.png", date: "2026-11-20T01:00:00.000Z",
    mode: "model", model: "review-fixture", threshold: 0.5, detections: [detection],
    regionReviews: [{ key: JSON.stringify([detection.label, detection.confidence, detection.box]) + "#0", status: "keep", note }],
  };
  await page.locator("#backup-file").setInputFiles({
    name: "multiline-review.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ application: "禾镜 FieldLens", schemaVersion: 1, records: [record] })),
  });
  await page.locator("#backup-confirm").click();
  await page.locator("[data-details]").click();
  const editor = page.locator('[data-region-note="0"]');
  ok(await editor.inputValue() === note, "opening a valid backup must preserve all regional note line breaks");
  for (const theme of ["classic", "field", "dark", "sand"]) {
    await page.evaluate((value) => { document.documentElement.dataset.uiTheme = value; }, theme);
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const layout = await editor.evaluate((element) => {
        const box = element.getBoundingClientRect(), dialog = element.closest("dialog");
        const style = getComputedStyle(element);
        return {
          withinViewport: box.left >= 0 && box.right <= innerWidth + 1,
          wraps: element.scrollWidth <= element.clientWidth + 1,
          noPageOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
          noDialogOverflow: dialog.scrollWidth <= dialog.clientWidth + 1,
          fontSize: Number.parseFloat(style.fontSize), height: box.height,
        };
      });
      ok(layout.withinViewport && layout.wraps && layout.noPageOverflow && layout.noDialogOverflow, `${theme} ${width}px preserves a readable multiline layout`);
      ok(layout.fontSize >= 14 && layout.height >= 60, `${theme} ${width}px provides readable text and two visible lines`);
    }
  }
  await page.locator("#save-review").click();
  const storedNote = () => page.evaluate(() => JSON.parse(localStorage.getItem("fieldlens.history"))[0].regionReviews[0].note);
  ok(await storedNote() === note, "saving without editing must preserve imported note line breaks");
  await page.reload();
  await page.locator("[data-details]").click();
  ok(await editor.inputValue() === note, "reload and reopening preserve the multiline note");
  await editor.fill("叶".repeat(299));
  await editor.press("End");
  await editor.press("Enter");
  await editor.press("a");
  ok((await editor.inputValue()).length === 300 && (await editor.inputValue()).endsWith("\n"), "typed line breaks count toward the existing 300-character limit");
  const edited = note + "\n人工补充：需要复查";
  await editor.fill(note);
  await editor.press("Control+End");
  await editor.press("Enter");
  await editor.pressSequentially("人工补充：需要复查");
  ok(await editor.inputValue() === edited, "users can add another line without losing earlier notes");
  await page.locator("#save-review").click();
  const pending = page.waitForEvent("download");
  await page.locator("#backup-export").click();
  const stream = await (await pending).createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const exported = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  ok(exported.records[0].regionReviews[0].note === edited, "actual backup download preserves imported and newly typed lines");
  ok(!errors.length, errors.join("; "));
  return "PASS: multiline regional notes survive import, open/save without edits, reload, keyboard editing and actual backup export; 300-character limit and 12 theme/viewport layouts remain intact";
}
