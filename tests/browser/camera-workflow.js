async (page) => {
  const { pathToFileURL } = await import("node:url");
  const { resolve } = await import("node:path");
  const { installCameraFixture } = await import(
    pathToFileURL(resolve("tests/browser/camera-fixture.js")).href
  );
  await installCameraFixture(page);
  const ok = (v, m) => {
    if (!v) throw Error(m);
  };
  const errors = [],
    apiRequests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/"))
      apiRequests.push(r.url());
  });
  const stopped = () =>
    page.evaluate(() =>
      cameraTest.streams.every((s) =>
        s.getTracks().every((t) => t.readyState === "ended"),
      ),
    );
  const ready = () =>
    page.waitForFunction(
      () => !document.querySelector("#camera-shutter")?.disabled,
    );
  await page.goto("http://127.0.0.1:4176/#workspace");
  ok(
    (await page.evaluate(() => cameraTest.requests.length)) === 0,
    "no camera request during boot",
  );
  await page.locator("#sample-top").click();
  await page.locator("#camera-open").click();
  await ready();
  ok(
    await page
      .locator("#camera-video")
      .evaluate((el) => el.videoWidth === 3200),
    "real video element renders synthetic stream",
  );
  await page.locator("#camera-device").selectOption("front-test");
  await ready();
  ok(
    await page.evaluate(
      () => cameraTest.streams[0].getTracks()[0].readyState === "ended",
    ),
    "device switch releases old camera",
  );
  await page.locator("#camera-shutter").click();
  await page.locator("#camera-use").waitFor({ state: "visible" });
  await page.locator("#camera-photo").evaluate((el) => el.decode());
  ok(await stopped(), "capture releases camera");
  ok(
    await page
      .locator("#camera-photo")
      .evaluate((el) => el.naturalWidth === 2560 && el.naturalHeight === 1440),
    "photo is bounded and keeps aspect ratio",
  );
  await page.locator("#camera-retake").click();
  await ready();
  await page.locator("#camera-shutter").click();
  await page.locator("#camera-use").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#file-name")
      ?.textContent.startsWith("fieldlens-photo-"),
  );
  ok(
    (await page.locator("#mode").inputValue()) === "model",
    "capture never reuses demo detections",
  );
  ok(
    await page.locator("#save").isDisabled(),
    "unprocessed camera image is not saved as detection",
  );
  ok(
    (await page.locator("#box-layer g").count()) === 0,
    "old demo boxes cleared",
  );
  ok(apiRequests.length === 0, "static capture never uploads automatically");
  ok(
    await page.evaluate(() =>
      cameraTest.requests.every((r) => r.audio === false),
    ),
    "audio never requested",
  );

  await page.locator("#camera-open").click();
  await ready();
  await page.keyboard.press("Escape");
  ok(await stopped(), "Escape releases media");
  const filename = await page.locator("#file-name").innerText();
  await page.evaluate(() => (cameraTest.mode = "deferred"));
  await page.locator("#camera-open").click();
  const streamCount = await page.evaluate(() => cameraTest.streams.length);
  await page.locator("#camera-close").click();
  await page.evaluate(() => cameraTest.pending.shift()());
  await page.waitForFunction(
    (count) =>
      cameraTest.streams.length === count + 1 &&
      cameraTest.streams.at(-1).getTracks()[0].readyState === "ended",
    streamCount,
  );
  ok(
    (await page.locator("#camera-video").count()) === 0 &&
      (await page.locator("#file-name").innerText()) === filename,
    "late permission response does not resurrect a closed dialog or replace image",
  );

  for (const [mode, word] of [
    ["denied", "权限"],
    ["missing", "没有找到"],
    ["busy", "占用"],
  ]) {
    await page.evaluate((value) => (cameraTest.mode = value), mode);
    await page.locator("#camera-open").click();
    await page.waitForFunction(
      (text) =>
        document.querySelector("#camera-status")?.textContent.includes(text),
      word,
    );
    ok(
      await page.locator("#camera-shutter").isDisabled(),
      "no shutter on " + mode,
    );
    await page.locator("#camera-close").click();
  }
  await page.evaluate(() => (cameraTest.mode = "normal"));
  await page.locator("#camera-open").click();
  await ready();
  await page.evaluate(() => {
    const t = cameraTest.streams.at(-1).getTracks()[0];
    t.stop();
    t.dispatchEvent(new Event("ended"));
  });
  await page.waitForFunction(() =>
    document.querySelector("#camera-status")?.textContent.includes("断开"),
  );
  await page.locator("#camera-retry").click();
  await ready();
  await page.evaluate(() => (cameraTest.blobFailure = true));
  await page.locator("#camera-shutter").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#camera-status")
      ?.textContent.includes("照片生成失败"),
  );
  ok(await stopped(), "failed encoding releases media");
  await page.evaluate(() => (cameraTest.blobFailure = false));
  await page.locator("#camera-retry").click();
  await ready();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    delete document.hidden;
  });
  ok(
    (await page.locator("#camera-video").count()) === 0 && (await stopped()),
    "backgrounding closes active capture",
  );
  await page.locator("#camera-open").click();
  await ready();
  await page.evaluate(() => (location.hash = "history"));
  await page.waitForFunction(() => !document.querySelector(".camera-dialog"));
  ok(await stopped(), "navigation releases media");

  await page.goto("http://127.0.0.1:4176/#workspace");
  for (const theme of ["classic", "sand", "dark"]) {
    await page.locator("#ui-theme").selectOption(theme);
    await page.locator("#camera-open").click();
    await ready();
    for (const width of [360, 390, 768, 1920]) {
      await page.setViewportSize({ width, height: 640 });
      const box = await page.locator(".camera-dialog").boundingBox();
      ok(
        box.x >= 0 &&
          box.width <= width &&
          box.y >= 0 &&
          box.y + box.height <= 640,
        "camera fits " + theme + " " + width,
      );
      ok(
        await page
          .locator(".camera-body")
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
        "camera body fits " + width,
      );
      const shutter = await page.locator("#camera-shutter").boundingBox();
      ok(shutter.y + shutter.height <= 640, "shutter stays on screen");
    }
    await page.locator("#camera-shutter").click();
    await page.locator("#camera-use").waitFor({ state: "visible" });
    ok(await stopped(), "responsive review stops media");
    await page.locator("#camera-close").click();
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator("#camera-open").click();
  await ready();
  const chooserEvent = page.waitForEvent("filechooser");
  await page.locator("#camera-fallback").click();
  const chooser = await chooserEvent;
  ok(await stopped(), "native picker releases preview");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    delete document.hidden;
  });
  ok(
    (await page.locator(".camera-dialog").count()) === 1,
    "native camera return target survives backgrounding",
  );
  await chooser.setFiles({
    name: "system-camera.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jz9sAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page.waitForFunction(
    () =>
      document.querySelector("#file-name")?.textContent === "system-camera.png",
  );
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = undefined;
  });
  await page.locator("#camera-open").click();
  ok(
    (await page.locator("#camera-status").innerText()).includes("HTTPS"),
    "unsupported environment has fallback",
  );
  await page
    .locator("#camera-native-file")
    .setInputFiles({
      name: "fallback.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jz9sAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  await page.waitForFunction(
    () => document.querySelector("#file-name")?.textContent === "fallback.png",
  );

  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ json: { enabled: false, user: null } }),
  );
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { ready: true, model: "camera-test-model" } }),
  );
  let upload;
  await page.route("**/api/detect", (route) => {
    upload = route.request().postDataBuffer();
    return route.fulfill({
      json: {
        detections: [],
        model: "camera-test-model",
        elapsed_ms: 4,
        width: 2560,
        height: 1440,
      },
    });
  });
  await page.goto("http://127.0.0.1:5176/");
  await page.locator("#camera-open").click();
  await ready();
  await page.locator("#camera-shutter").click();
  await page.locator("#camera-use").click();
  await page.waitForFunction(
    () =>
      document.querySelector("#detect")?.textContent.includes("开始检测") &&
      !document.querySelector("#detect").disabled,
  );
  ok(!upload, "no upload before explicit detection");
  await page.locator("#detect").click();
  await page.waitForFunction(
    () => document.querySelector("#result-count")?.textContent === "0 个区域",
  );
  ok(
    upload?.includes(Buffer.from("image/jpeg")) &&
      upload?.includes(Buffer.from("fieldlens-photo-")),
    "confirmed JPEG reaches existing multipart inference API",
  );
  await page.locator("#save").click();
  ok(!errors.length, errors.join(";"));
  return "PASS: user-initiated synthetic camera stream, device switch, bounded JPEG, retake/use, no automatic upload or audio, no demo boxes, permission failures, stale response cleanup, disconnection, encoding failure, Escape/background/navigation cleanup, 12 camera layouts, native picker background return, file fallback and mocked YOLO request";
}
