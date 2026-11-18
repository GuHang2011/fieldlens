async (page) => {
  const ok = (value, message) => { if (!value) throw Error(message); };
  const base = "http://127.0.0.1:4176/";
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base + "#workspace");
  await page.locator("#sample-top").click();
  await page.locator("#save").click();
  await page.evaluate(() => {
    const template = JSON.parse(localStorage.getItem("fieldlens.history"))[0];
    const detections = Array.from({ length: 300 }, () => ({ label: "叶斑区域", confidence: 0.9, box: [0.1, 0.1, 0.5, 0.5] }));
    const signature = JSON.stringify([detections[0].label, detections[0].confidence, detections[0].box]);
    const regionReviews = detections.map((_, index) => ({ key: `${signature}#${index}`, status: "keep", note: "叶".repeat(300) }));
    const records = Array.from({ length: 20 }, (_, index) => ({
      ...template, id: `large-backup-${index}`, name: `large-${index}.png`,
      detections, regionReviews, sample: { ...template.sample, code: `LARGE-${index}` },
    }));
    localStorage.setItem("fieldlens.history", JSON.stringify(records));
  });
  await page.goto(base + "#history");
  await page.reload();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("fieldlens.history")));
  const pending = page.waitForEvent("download");
  await page.locator("#backup-export").click();
  const stream = await (await pending).createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);
  ok(buffer.length > 5 * 1024 * 1024, "the app's own backup exceeds the former 5 MB limit");
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#clear").click();
  ok(await page.locator("[data-details]").count() === 0, "restore begins with an empty workspace");
  await page.locator("#backup-file").setInputFiles({ name: "own-large-backup.json", mimeType: "application/json", buffer });
  await page.locator("#backup-dialog").waitFor({ state: "visible" });
  ok(await page.locator("#backup-dialog").evaluate((element) => element.open), "the app accepts its own large exported backup");
  ok(!(await page.locator("#backup-confirm").isDisabled()), "valid large restore can be confirmed");
  ok((await page.locator("#backup-count").textContent()).includes("20 / 30"), "large restore still respects the record capacity");
  await page.locator("#backup-confirm").click();
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem("fieldlens.history")));
  ok(restored.length === before.length && restored.every((record, index) => record.id === before[index].id), "restore preserves count and saved order");
  ok(restored.every((record) => record.regionReviews.length === 300 && record.regionReviews.every((review) => review.note === "叶".repeat(300))), "restore retains all regional review notes");
  ok(!errors.length, errors.join("; "));
  return "PASS: real exported backup larger than 5 MB restores all 20 records and 6000 regional notes in order, with the 30-record capacity retained";
}
