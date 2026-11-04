async (page) => {
  const ok = (v, m) => {
    if (!v) throw Error(m);
  };
  const context = await page
    .context()
    .browser()
    .newContext({ viewport: { width: 1440, height: 1050 } });
  const p = await context.newPage(),
    errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  try {
    await p.goto("http://127.0.0.1:4176/#login");
    ok(
      await p.locator("#login-submit").isDisabled(),
      "static site cannot pretend to authenticate",
    );
    await p.getByRole("link", { name: "进入演示工作台" }).click();
    await p.locator("#start-guide").click();
    ok(await p.locator(".onboarding-dialog").isVisible(), "guide open");
    await p.locator("#guide-locate").click();
    await p.locator("#guide-next").click();
    await p.locator("#guide-previous").click();
    await p.keyboard.press("Escape");
    ok(
      (await p.locator(".onboarding-dialog").count()) === 0,
      "escape closes guide",
    );
    await p.locator("#onboarding-open").click();
    for (let i = 0; i < 6; i++) await p.locator("#guide-next").click();
    ok(
      (await p.locator(".guide-welcome").count()) === 0,
      "completed welcome removed",
    );
    await p.reload();
    ok(
      (await p.locator(".guide-welcome").count()) === 0,
      "completion persists",
    );
    await p.locator("#onboarding-open").click();
    ok(await p.locator(".onboarding-dialog").isVisible(), "can replay");
    await p.locator("#guide-close").click();
    await p.getByRole("button", { name: "数据大屏", exact: true }).click();
    ok(await p.locator(".screen-empty-banner").isVisible(), "empty state");
    await p.getByRole("link", { name: "前往图像检测 →" }).click();
    await p.locator("#sample-top").click();
    await p.locator("#save").click();
    await p.getByRole("button", { name: "数据大屏", exact: true }).click();
    ok(
      (await p.locator(".screen-legend.demo").innerText()).includes("1"),
      "demo provenance",
    );
    await p.locator("#screen-source").selectOption("model");
    ok(await p.locator(".screen-empty-banner").isVisible(), "source filters");
    await p.locator("#screen-source").selectOption("all");
    await p.locator("#screen-days").selectOption("30");
    ok((await p.locator(".trend-day").count()) === 30, "30 day range");
    await p.locator("#screen-fullscreen").click();
    ok(
      await p.evaluate(() => !!document.fullscreenElement),
      "fullscreen entered",
    );
    await p.locator("#screen-fullscreen").click();
    ok(
      await p.evaluate(() => !document.fullscreenElement),
      "fullscreen exited",
    );
    for (const view of ["login", "dashboard", "workspace", "history"]) {
      await p.goto("http://127.0.0.1:4176/#" + view);
      for (const width of [360, 390, 768, 1440, 1920, 2560]) {
        await p.setViewportSize({ width, height: 1000 });
        ok(
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          "overflow " + view + " " + width,
        );
      }
    }
    await p.setViewportSize({ width: 1440, height: 1050 });
    await p.goto("http://127.0.0.1:5177/");
    await p.locator("#login-form").waitFor();
    await p.locator("#login-password").fill("visibility-check");
    await p.locator("#password-toggle").click();
    ok(
      (await p.locator("#login-password").getAttribute("type")) === "text",
      "show password",
    );
    await p.locator("#password-toggle").click();
    ok(
      (await p.locator("#login-password").getAttribute("type")) === "password",
      "hide password",
    );
    const unauthorized = await p.request.get(
      "http://127.0.0.1:5177/api/health",
    );
    ok(unauthorized.status() === 401, "server rejects anonymous requests");
    const login = async (name, password = "browser-test-password-2026") => {
      await p.locator("#login-username").fill(name);
      await p.locator("#login-password").fill(password);
      await p.locator("#login-submit").click();
    };
    await login("inspector-a", "wrong-password");
    await p.locator("#login-error").waitFor({ state: "visible" });
    ok(
      !(await p.locator(".account-label").innerText()).includes("过期"),
      "wrong login is not an expired session",
    );
    await login("inspector-a");
    await p.locator("#sample-top").waitFor();
    ok(
      (await p.locator(".account-label").innerText()).includes("巡检员 A"),
      "real login",
    );
    await p.locator("#sample-top").click();
    await p.locator("#save").click();
    await p.getByRole("button", { name: "检测记录", exact: true }).click();
    ok((await p.locator("[data-details]").count()) === 1, "account A record");
    p.on("dialog", (dialog) => dialog.accept());
    await p.locator("#logout").click();
    await p.locator("#login-form").waitFor();
    ok(
      (await p.request.get("http://127.0.0.1:5177/api/health")).status() ===
        401,
      "logout revokes server access",
    );
    await login("inspector-b");
    await p.locator("#sample-top").waitFor();
    await p.getByRole("button", { name: "检测记录", exact: true }).click();
    ok(
      (await p.locator("[data-details]").count()) === 0,
      "account B cannot see account A browser records",
    );
    await p.locator("#logout").click();
    await p.locator("#login-form").waitFor();
    await login("inspector-a");
    await p.locator("#sample-top").waitFor();
    await p.getByRole("button", { name: "检测记录", exact: true }).click();
    ok(
      (await p.locator("[data-details]").count()) === 1,
      "A records persist after switching",
    );
    await p.request.post("http://127.0.0.1:5177/api/auth/logout", {
      headers: { "X-FieldLens-Request": "1" },
    });
    await p.getByRole("button", { name: "图像检测", exact: true }).click();
    await p.locator("#refresh-status").click();
    await p.getByRole("link", { name: "会话已过期，请重新登录" }).waitFor();
    await p.locator(".account-label").click();
    await p.locator("#login-form").waitFor();
    await login("inspector-a");
    await p.locator("#sample-top").waitFor();
    const other = await context.newPage();
    await other.goto("http://127.0.0.1:5177/");
    await other.locator("#sample-top").waitFor();
    await p.locator("#logout").click();
    await p.locator("#login-form").waitFor();
    await other.locator("#login-form").waitFor();
    await other.close();
    ok(!errors.length, errors.join(";"));
    return "PASS: static login guard, real backend login/logout/401, expired-session recovery, cross-tab logout, password toggle, account record separation, guide close/replay/persistence, dashboard source/range/fullscreen/empty state and 24 responsive layouts";
  } finally {
    await context.close();
  }
}
