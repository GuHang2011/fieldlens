async (page) => {
  const failures = [], errors = [];
  const check = (value, message) => { if (!value) failures.push(message); };
  const base = "http://127.0.0.1:4176/";
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install();
  await page.setViewportSize({ width: 1440, height: 1000 });

  // Exercise the actual refresh timer, then activate the retained link by keyboard.
  for (const [url, selector, destination] of [
    ["?demo=1#dashboard", ".screen-tasks h2 a", "#history?task=pending"],
    ["#dashboard", ".screen-empty-banner a", "#workspace"],
  ]) {
    await page.goto(base + url);
    await page.locator(selector).focus();
    await page.clock.runFor(30001);
    check(await page.locator(selector).evaluate((el) => el === document.activeElement), `automatic refresh preserves ${selector} focus`);
    await page.keyboard.press("Enter");
    const activated = await page.waitForURL((value) => value.hash === destination, { timeout: 1000 }).then(() => true, () => false);
    check(activated, `Enter activates ${selector} after automatic refresh`);
  }
  await page.goto(base + "?demo=1#dashboard");
  await page.locator(".trend-values summary").focus();
  await page.keyboard.press("Enter");
  await page.clock.runFor(30001);
  check(await page.locator(".trend-values summary").evaluate((el) => el === document.activeElement), "daily details retain keyboard focus");
  check(await page.locator(".trend-values").evaluate((el) => el.open), "daily details retain their expanded state");
  await page.keyboard.press("Enter");
  check(await page.locator(".trend-values").evaluate((el) => !el.open), "daily details remain keyboard operable after refresh");

  let layouts = 0;
  for (const theme of ["classic", "field", "dark", "sand"]) {
    for (const [width, height] of [[320, 568], [390, 844], [844, 390]]) {
      await page.setViewportSize({ width, height });
      await page.goto(base + "?demo=1#workspace");
      await page.locator("#ui-theme").selectOption(theme);
      await page.locator("[data-skin-open]").click();
      const overlaps = await page.locator(".skin-card").evaluateAll((cards) => cards.flatMap((card) => {
        const radio = card.querySelector("input");
        const bounds = radio.getBoundingClientRect();
        const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
        const collisions = [];
        let node;
        while ((node = walker.nextNode())) {
          if (!node.textContent.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          if ([...range.getClientRects()].some((rect) => bounds.left < rect.right && bounds.right > rect.left && bounds.top < rect.bottom && bounds.bottom > rect.top)) collisions.push(radio.value);
        }
        return collisions;
      }));
      check(!overlaps.length, `skin radio does not overlap text at ${theme}/${width}: ${overlaps.join(", ")}`);
      await page.locator(`[data-skin-choice][value="${theme}"]`).check();
      check(await page.evaluate((value) => document.documentElement.dataset.uiTheme === value, theme), `skin selection works at ${theme}/${width}`);
      await page.keyboard.press("Escape");
      await page.locator("#onboarding-open").click();
      for (let step = 1; step <= 6; step++) {
        const layout = await page.locator(".onboarding-dialog").evaluate((dialog) => {
          const bounds = dialog.getBoundingClientRect();
          return {
            fits: bounds.x >= 0 && bounds.y >= 0 && bounds.right <= innerWidth && bounds.bottom <= innerHeight && dialog.scrollWidth <= dialog.clientWidth,
            fonts: ["#guide-close", "#guide-locate"].map((selector) => parseFloat(getComputedStyle(dialog.querySelector(selector)).fontSize)),
            pageFits: document.documentElement.scrollWidth <= innerWidth,
          };
        });
        check(layout.fits && layout.pageFits, `guide fits ${theme}/${width} step ${step}`);
        check(layout.fonts.every((size) => size >= 14), `guide action text is readable at ${theme}/${width} step ${step}`);
        await page.locator("#guide-next").click();
        layouts++;
      }
      check(await page.locator(".onboarding-dialog").count() === 0, `guide can complete at ${theme}/${width}`);
    }
  }
  check(!errors.length, errors.join("; "));
  if (failures.length) throw Error(failures.join("\n"));
  return `PASS: automatic dashboard refresh preserves task/empty-state link focus and Enter actions, daily-details focus/state, skin radio text separation and selection, ${layouts} guide layouts across four themes with readable actions`;
}
