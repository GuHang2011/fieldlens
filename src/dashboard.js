import {
  themeControl,
  bindThemeControls,
  readScreenPreferences,
  saveScreenPreferences,
} from "./appearance.js";
import { localDay, matchesTask } from "./domain.js";
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

export function summarizeRecords(
  records,
  { source = "all", days = 7, now = new Date() } = {},
) {
  const dates = Array.from({ length: days }, (_, index) => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - days + index + 1);
    return localDay(d);
  });
  const filtered = records.filter(
    (r) =>
      (source === "all" || r.mode === source) &&
      dates.includes(localDay(new Date(r.date))),
  );
  const labels = new Map(),
    plots = new Map();
  for (const record of filtered) {
    for (const detection of record.detections)
      labels.set(detection.label, (labels.get(detection.label) || 0) + 1);
    const plot = record.sample?.plot || "未填写地块";
    plots.set(plot, (plots.get(plot) || 0) + 1);
  }
  const rank = (map) =>
    [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return {
    records: filtered,
    total: filtered.length,
    model: filtered.filter((r) => r.mode === "model").length,
    demo: filtered.filter((r) => r.mode === "demo").length,
    regions: filtered.reduce((sum, r) => sum + r.detections.length, 0),
    pending: filtered.filter((r) => !r.reviewed).length,
    tasks: filtered.filter((r) => matchesTask(r.followUp, "pending")),
    overdue: filtered.filter((r) =>
      matchesTask(r.followUp, "overdue", localDay(now)),
    ).length,
    timeline: dates.map((date) => ({
      date,
      demo: filtered.filter(
        (r) => r.mode === "demo" && localDay(new Date(r.date)) === date,
      ).length,
      model: filtered.filter(
        (r) => r.mode === "model" && localDay(new Date(r.date)) === date,
      ).length,
    })),
    labels: rank(labels),
    plots: rank(plots),
  };
}

export function renderDashboard(
  main,
  { getRecords, toast, preferences, scopeLabel = "当前浏览器记录" },
) {
  let { source, days, distance } = preferences
    ? preferences.read()
    : readScreenPreferences();
  let presenting = false,
    slide = "overview",
    rotating = false;
  let rotationTimer;
  const remember = () =>
    (preferences ? preferences.save : saveScreenPreferences)({
      source,
      days,
      distance,
    });
  main.innerHTML = `<section class="screen-board" id="screen-board" data-distance="${distance}" data-slide="overview">
    <header class="screen-header"><div><span class="screen-kicker">FIELDLENS · 巡检概览</span><h1>作物巡检数据大屏</h1><p>${esc(scopeLabel)} · 按记录创建时间统计</p></div>
    <div class="screen-actions"><button class="button outlined" id="screen-settings-toggle" aria-controls="screen-settings" aria-expanded="true">收起设置</button><button class="button outlined" id="screen-focus" aria-pressed="false">专注展示</button><button class="button primary" id="screen-fullscreen">全屏展示</button></div></header>
    <div class="screen-controls" id="screen-settings"><label>来源<select id="screen-source"><option value="all">全部来源</option><option value="model">模型记录</option><option value="demo">演示记录</option></select></label><label>时间范围<select id="screen-days"><option value="7">近 7 天</option><option value="30">近 30 天</option></select></label><label>观看视距<select id="screen-distance"><option value="standard">标准 · 桌面</option><option value="far">远距 · 投屏</option><option value="hall">超远 · 会场</option></select></label>${themeControl("screen-theme")}<button class="button outlined" id="screen-refresh">刷新数据</button><span class="screen-setting-note">按观看环境调节字号，设置保存在本机。</span></div>
    <div class="screen-context"><span id="screen-scope"></span><nav class="presentation-nav" aria-label="展示分屏" hidden><button class="button outlined" data-screen-slide="overview" aria-pressed="true">1 / 概览趋势</button><button class="button outlined" data-screen-slide="followup" aria-pressed="false">2 / 地块复查</button><button class="button outlined" id="screen-rotate" aria-pressed="false">开启轮播</button><span>15 秒切换 · Esc 退出展示</span></nav></div>
    <div id="screen-content"></div><footer class="screen-footer"><span>区域数量用于工作量统计，不代表患病率或严重程度。</span><span id="screen-updated" role="status"></span></footer></section>`;
  bindThemeControls(main);
  const bars = (items, unit) =>
    items.length
      ? `<ul class="screen-rank">${items
          .slice(0, 6)
          .map(
            ([label, count]) =>
              `<li><div><span title="${esc(label)}">${esc(label)}</span><strong>${count} ${unit}</strong></div><div class="screen-track"><i style="width:${Math.round((count / items[0][1]) * 100)}%"></i></div></li>`,
          )
          .join("")}</ul>`
      : '<p class="screen-empty">当前范围暂无数据</p>';
  const update = () => {
    if (!main.isConnected || !main.querySelector("#screen-content")) return;
    const expanded = main.querySelector(".trend-values")?.open;
    const refocusSummary =
      document.activeElement === main.querySelector(".trend-values summary");
    const data = summarizeRecords(getRecords(), { source, days });
    const max = Math.max(1, ...data.timeline.map((d) => d.demo + d.model));
    main.querySelector("#screen-content").innerHTML =
      `<div class="screen-provenance"><span class="screen-legend model">模型记录 ${data.model} 条</span><span class="screen-legend demo">演示记录 ${data.demo} 条</span><span>${data.demo ? "含预设演示数据，不能用于评价模型精度。" : "以当前筛选范围为准。"}</span></div><div class="screen-stats">${[
        ["巡检记录", data.total, "条"],
        ["待人工复核", data.pending, "条"],
        ["检测区域", data.regions, "个"],
        ["待复查 / 逾期", `${data.tasks.length} / ${data.overdue}`, "条"],
      ]
        .map(
          ([label, value, unit]) =>
            `<section><span>${label}</span><strong>${value}<small>${unit}</small></strong></section>`,
        )
        .join(
          "",
        )}</div>${!data.total ? '<div class="screen-empty-banner">当前范围没有记录。先完成检测并保存，或调整来源和日期范围。<a href="#workspace">前往图像检测 →</a></div>' : ""}<div class="screen-grid"><section class="screen-panel screen-trend"><h2>每日巡检记录 <small>${days} 天</small></h2><div class="trend-chart" role="img" aria-label="每日记录趋势，蓝色为模型记录，金色为演示记录"><div class="trend-bars">${data.timeline.map((d, i) => `<div class="trend-day"><span class="trend-count">${d.demo + d.model || ""}</span><div class="trend-stack" title="${d.date}：模型 ${d.model}，演示 ${d.demo}"><i class="bar-demo" style="height:${(d.demo / max) * 100}%"></i><i class="bar-model" style="height:${(d.model / max) * 100}%"></i></div><span>${days === 7 || i % 5 === 0 || i === days - 1 ? d.date.slice(5) : ""}</span></div>`).join("")}</div></div><details class="trend-values" ${expanded ? "open" : ""}><summary>查看每日明细</summary><table><thead><tr><th>日期</th><th>模型记录</th><th>演示记录</th></tr></thead><tbody>${data.timeline.map((d) => `<tr><td>${d.date}</td><td>${d.model}</td><td>${d.demo}</td></tr>`).join("")}</tbody></table></details></section><section class="screen-panel screen-labels"><h2>区域类别 <small>按检测区域计数</small></h2>${bars(data.labels, "个")}</section><section class="screen-panel screen-plots"><h2>地块巡检 <small>按记录计数</small></h2>${bars(data.plots, "条")}</section><section class="screen-panel screen-tasks"><h2>复查待办 <a href="#history?task=pending">查看全部 →</a></h2>${
        data.tasks.length
          ? `<ul>${data.tasks
              .slice(0, 5)
              .map(
                (r) =>
                  `<li><div><strong>${esc(r.sample?.code || r.name)}</strong><p>${esc(r.followUp.reason)}</p></div><span class="${matchesTask(r.followUp, "overdue") ? "screen-overdue" : ""}">${esc(r.followUp.dueDate || "未设日期")}</span></li>`,
              )
              .join("")}</ul>`
          : '<p class="screen-empty">当前范围没有待复查任务</p>'
      }</section></div>`;
    if (refocusSummary)
      main
        .querySelector(".trend-values summary")
        ?.focus({ preventScroll: true });
    main.querySelector("#screen-scope").textContent =
      `${{ all: "全部来源", model: "模型记录", demo: "演示记录" }[source]} · 近 ${days} 天 · ${{ standard: "标准视距", far: "远距投屏", hall: "超远会场" }[distance]}`;
    main.querySelector("#screen-updated").textContent =
      `更新于 ${new Date().toLocaleTimeString("zh-CN")} · 30 秒自动刷新`;
  };
  main.querySelector("#screen-source").onchange = (e) => {
    source = e.target.value;
    remember();
    update();
  };
  main.querySelector("#screen-days").onchange = (e) => {
    days = Number(e.target.value);
    remember();
    update();
  };
  main.querySelector("#screen-refresh").onclick = update;
  const board = main.querySelector("#screen-board"),
    button = main.querySelector("#screen-fullscreen");
  let wasFullscreen = false;
  const fullscreenChange = () => {
    button.textContent = document.fullscreenElement ? "退出全屏" : "全屏展示";
    const isFullscreen = document.fullscreenElement === board;
    if (wasFullscreen && !isFullscreen && presenting) setPresentation(false);
    wasFullscreen = isFullscreen;
  };
  button.onclick = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await board.requestFullscreen();
    } catch {
      toast("当前浏览器不支持全屏，可使用浏览器的全屏功能。");
    }
  };
  const settings = main.querySelector("#screen-settings");
  const settingsButton = main.querySelector("#screen-settings-toggle");
  const focusButton = main.querySelector("#screen-focus");
  const slideNav = main.querySelector(".presentation-nav");
  const rotateButton = main.querySelector("#screen-rotate");
  const showSettings = (visible) => {
    settings.hidden = !visible;
    settingsButton.textContent = visible ? "收起设置" : "显示设置";
    settingsButton.setAttribute("aria-expanded", String(visible));
  };
  const selectSlide = (value) => {
    slide = value;
    board.dataset.slide = slide;
    slideNav
      .querySelectorAll("[data-screen-slide]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.screenSlide === slide)),
      );
  };
  const setRotation = (value) => {
    rotating = value;
    clearInterval(rotationTimer);
    if (rotating)
      rotationTimer = setInterval(() => {
        if (
          presenting &&
          settings.hidden &&
          !document.hidden &&
          !main
            .querySelector("#screen-content")
            .contains(document.activeElement)
        ) {
          selectSlide(slide === "overview" ? "followup" : "overview");
        }
      }, 15000);
    rotateButton.setAttribute("aria-pressed", String(rotating));
    rotateButton.textContent = rotating ? "暂停轮播" : "开启轮播";
  };
  const setPresentation = (value) => {
    presenting = value;
    board.classList.toggle("is-presenting", presenting);
    document.body.classList.toggle("screen-presenting", presenting);
    focusButton.textContent = presenting ? "退出展示" : "专注展示";
    focusButton.setAttribute("aria-pressed", String(presenting));
    slideNav.hidden = !presenting;
    showSettings(!presenting);
    if (!presenting) {
      setRotation(false);
      if (document.fullscreenElement === board)
        document.exitFullscreen().catch(() => {});
    }
    focusButton.focus({ preventScroll: true });
    board.scrollIntoView({ block: "start", behavior: "instant" });
  };
  main.querySelector("#screen-source").value = source;
  main.querySelector("#screen-days").value = String(days);
  main.querySelector("#screen-distance").value = distance;
  main.querySelector("#screen-distance").onchange = (event) => {
    distance = event.target.value;
    board.dataset.distance = distance;
    remember();
    update();
  };
  settingsButton.onclick = () => showSettings(settings.hidden);
  focusButton.onclick = () => setPresentation(!presenting);
  slideNav.querySelectorAll("[data-screen-slide]").forEach(
    (b) =>
      (b.onclick = () => {
        setRotation(false);
        selectSlide(b.dataset.screenSlide);
      }),
  );
  rotateButton.onclick = () => setRotation(!rotating);
  const escapePresentation = (event) => {
    if (
      event.key === "Escape" &&
      presenting &&
      !document.querySelector("dialog[open]")
    )
      setPresentation(false);
  };
  document.addEventListener("keydown", escapePresentation);
  document.addEventListener("fullscreenchange", fullscreenChange);
  window.addEventListener("fieldlens:records-changed", update);
  const timer = setInterval(update, 30000);
  update();
  return () => {
    clearInterval(timer);
    clearInterval(rotationTimer);
    document.body.classList.remove("screen-presenting");
    document.removeEventListener("keydown", escapePresentation);
    document.removeEventListener("fullscreenchange", fullscreenChange);
    window.removeEventListener("fieldlens:records-changed", update);
    if (document.fullscreenElement === board)
      document.exitFullscreen().catch(() => {});
  };
}
