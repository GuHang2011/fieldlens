import "./admin.css";
import "./features.css";
import "./practical.css";
import "./inspection.css";
import "./ui-refinement.css";
import "./access-screen.css";
import "./appearance.css";
import "./presentation.css";
import "./camera-skins.css";
import "./demo.css";
import "./helper.css";
import { renderHelper } from "./helper-view.js";
import { createDemoSession } from "./demo-session.js";
import { renderDemoCenter } from "./demo-view.js";
import { createCamera } from "./camera.js";
import {
  initializeAppearance,
  themeControl,
  bindThemeControls,
} from "./appearance.js";
import { createAccess, apiFetch } from "./access.js";
import { renderDashboard } from "./dashboard.js";
import { createOnboarding } from "./onboarding.js";
import { newSample, sampleFields, readSample } from "./record-fields.js";
import { renderHistoryPage } from "./history-view.js";
import {
  downloadJSON,
  downloadCSV,
  downloadAnnotatedImage,
} from "./exports.js";
import {
  DEMO_DETECTIONS,
  visibleDetections,
  validateResult,
  loadHistory,
  normalizeSample,
  matchesTask,
  HISTORY_LIMIT,
} from "./domain.js";

const icons = {
  scan: '<rect x="5" y="5" width="14" height="14" rx="3"/><path d="M2 8V2h6m8 0h6v6M2 16v6h6m8 0h6v-6M8 12h8"/>',
  leaf: '<path d="M5 19C-1 6 10 2 21 3c1 12-7 20-16 16Zm0 0L15 9"/>',
  history: '<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7m2-5v6l4 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  download: '<path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  cross: '<path d="m6 6 12 12M6 18 18 6"/>',
  target:
    '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.leaf}</svg>`;
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const apiEnabled =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_API === "true";
const access = createAccess(apiEnabled);
const demoSession = createDemoSession();
let demoActive =
  !apiEnabled && new URLSearchParams(location.search).get("demo") === "1";
let personalWorkspace, personalObjectUrl;
let demoScreenPreferences = { source: "demo", days: 7, distance: "standard" };
const recordStorage = () => (demoActive ? demoSession.storage : access.storage);
initializeAppearance();
let disposeView = () => {};
const onboarding = createOnboarding({
  navigate: (view) => {
    const editor = document.querySelector("#record-dialog");
    if (editor?.open && editor.dataset.dirty === "true") {
      if (!confirm("有未保存的修改，确定离开吗？")) return false;
      editor.close();
    }
    location.hash = view;
    return true;
  },
});
function initialHistory() {
  try {
    return loadHistory(recordStorage());
  } catch {
    return [];
  }
}
const state = {
  view: "workspace",
  mode: apiEnabled ? "model" : "demo",
  threshold: 0.5,
  boxes: true,
  detections: [],
  file: null,
  image: "",
  name: "",
  history: [],
  busy: false,
  status: "checking",
  model: "",
  error: "",
  completed: false,
  selected: -1,
  zoom: 1,
  loading: false,
  width: null,
  height: null,
  notes: "",
  sample: newSample(),
  resultId: "",
  resultAt: "",
  elapsedMs: null,
};
let objectUrl;
let selectionToken = 0;
let activeRequest;
const app = document.querySelector("#app");
const camera = createCamera({ onUsePhoto: (file) => acceptFile(file) });

function shell() {
  app.innerHTML = `<aside class="sidebar">
    <a class="brand" href="#workspace" aria-label="禾镜首页"><img src="./favicon.svg" alt=""/><span>禾镜 <b>FieldLens</b><small>作物视觉巡检</small></span></a>
    <nav aria-label="主导航">
      <div class="nav-caption">检测管理</div>
      <button data-view="workspace">${icon("scan")}<span>图像检测</span></button>
      <button data-view="history">${icon("history")}<span>检测记录</span></button>
      <button data-view="dashboard">${icon("target")}<span>数据大屏</span></button>
      <button data-view="assistant">${icon("info")}<span>AI 助手</span></button>
      <div class="nav-caption">使用帮助</div>
      <button data-view="demo">${icon("leaf")}<span>在线演示</span></button>
      <button data-view="guide">${icon("target")}<span>运行指南</span></button>
      <button data-view="about">${icon("info")}<span>项目说明</span></button>
    </nav>
    <a class="source-link" href="https://github.com/GuHang2011/fieldlens" target="_blank" rel="noopener">GitHub 仓库 ${icon("arrow")}</a>
    <div class="sidebar-footer">FieldLens <span>v1.8.0</span></div>
  </aside>
  <div class="main-shell"><header class="topbar"><div class="breadcrumb" aria-label="当前位置"><span id="breadcrumb-group">检测管理</span><span aria-hidden="true">/</span><strong id="breadcrumb">图像检测</strong></div><div class="topbar-actions">${themeControl("ui-theme")}<button class="text-button" id="onboarding-open">操作引导</button>${demoActive ? '<span class="account-label">演示访客 · 免登录</span>' : `<a class="account-label" href="#login">${escape(access.label())}</a>${access.user ? '<button class="text-button" id="logout">退出</button>' : '<a class="text-button" href="#login">登录</a>'}`} <span class="local-badge">${apiEnabled ? "本地运行" : "在线演示"}</span></div></header><main id="main"></main><footer class="page-footer">禾镜 FieldLens · 作物病害检测系统</footer></div>
  <div id="toast" role="status" class="toast" hidden></div>`;
  if (demoActive) {
    app
      .querySelector(".topbar")
      .insertAdjacentHTML(
        "afterend",
        `<aside class="demo-session-banner" aria-label="当前演示空间"><div><strong>独立演示空间 · 预置案例为演示数据</strong><p id="demo-storage-status">${demoSession.status()}</p></div><a class="text-button" href="#demo">演示中心</a><button class="text-button" id="demo-exit">退出演示</button></aside>`,
      );
    document.querySelector("#demo-exit").onclick = () => exitDemo();
  }
  app.querySelectorAll("[data-view]").forEach(
    (button) =>
      (button.onclick = () => {
        location.hash = button.dataset.view;
      }),
  );
  bindThemeControls(app);
  document.querySelector("#onboarding-open").onclick = () => onboarding.open();
  document.querySelector("#logout")?.addEventListener("click", async () => {
    if (!confirm("退出当前账号？未保存的输入将丢失，已保存记录仍留在本机。"))
      return;
    try {
      await access.logout();
    } catch (error) {
      toast(error.message);
    }
  });
  render();
}

function render() {
  disposeView();
  disposeView = () => {};
  if (
    access.enabled &&
    !access.user &&
    !["login", "guide", "about", "demo"].includes(state.view)
  )
    state.view = "login";
  if (state.view !== "workspace") camera.close();
  document.body.classList.toggle("login-view", state.view === "login");
  document.body.classList.toggle("dashboard-view", state.view === "dashboard");
  app.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.view);
    if (button.dataset.view === state.view)
      button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  document.querySelector("#breadcrumb").textContent = {
    workspace: "图像检测",
    history: "检测记录",
    about: "项目说明",
    guide: "运行指南",
    dashboard: "数据大屏",
    login: "用户登录",
    demo: "在线演示",
    assistant: "AI 助手",
  }[state.view];
  document.querySelector("#breadcrumb-group").textContent = [
    "workspace",
    "history",
    "dashboard",
    "assistant",
  ].includes(state.view)
    ? "检测管理"
    : "使用帮助";
  const main = document.querySelector("#main");
  if (state.view === "workspace") renderWorkspace(main);
  else if (state.view === "history") renderHistory(main);
  else if (state.view === "assistant")
    disposeView = renderHelper(main, {
      getRecords: () => state.history,
      apiEnabled,
      scopeLabel: demoActive ? "演示空间" : "本机记录",
    });
  else if (state.view === "dashboard")
    disposeView = renderDashboard(main, {
      getRecords: () => state.history,
      toast,
      preferences: demoActive
        ? {
            read: () => demoScreenPreferences,
            save: (value) => {
              demoScreenPreferences = value;
            },
          }
        : undefined,
      scopeLabel: demoActive ? "当前演示空间" : "当前浏览器记录",
    });
  else if (state.view === "demo")
    renderDemoCenter(main, {
      active: demoActive,
      available: !apiEnabled,
      count: state.history.length,
      enter: enterDemo,
      reset: resetDemo,
      share: shareDemo,
    });
  else if (state.view === "login") access.renderLogin(main);
  else if (state.view === "guide") renderGuide(main);
  else renderAbout(main);
}

function primaryAction() {
  if (state.loading) return { label: "图片读取中…", disabled: true };
  if (state.busy) return { label: "检测中…", disabled: true };
  if (state.mode === "demo")
    return {
      label: state.image ? "运行示例检测" : "加载示例并查看",
      disabled: false,
    };
  if (!apiEnabled) return { label: "本地运行后可检测", disabled: true };
  if (!state.file) return { label: "请先选择图片", disabled: true };
  if (state.status !== "ready")
    return { label: "请先连接模型服务", disabled: true };
  return { label: "开始检测", disabled: false };
}

function renderWorkspace(main) {
  const pending = state.history.filter((r) =>
    matchesTask(r.followUp, "pending"),
  ).length;
  const due = state.history.filter(
    (r) =>
      matchesTask(r.followUp, "today") || matchesTask(r.followUp, "overdue"),
  ).length;
  const action = primaryAction();
  main.innerHTML = `<section class="page-heading"><div><h1>图像检测</h1><p>上传作物图片，设置检测参数并查看结果。</p></div><button class="button outlined" id="sample-top" ${state.busy ? "disabled" : ""}>加载示例</button></section>
  ${!apiEnabled ? `<div class="capability-banner"><div><strong>在线演示</strong><span>示例为预设标注；自己的图片需连接本地 YOLO 检测。</span></div><div class="page-actions"><a class="button outlined" href="#demo">完整交互演示</a><a class="text-button" href="#guide">本地运行指南</a></div></div>` : ""}
  ${!onboarding.completed() ? '<div class="guide-welcome"><span>第一次使用？跟着步骤完成检测与复核。</span><button class="text-button" id="start-guide">开始引导 →</button></div>' : ""}
  <div class="workspace-task-summary"><span>待复查 <strong>${pending}</strong> 条 · 今日及逾期 <strong>${due}</strong> 条</span><a class="text-button" href="#history?task=pending">查看复查待办</a></div>
  <div class="workspace-grid"><section class="panel image-panel"><div class="panel-heading"><div><h2><span class="step-index">01</span> 检测图片</h2>${state.image ? `<span class="badge">${state.mode === "demo" ? "演示图片" : "已载入"}</span>` : ""}</div><label class="box-switch"><input type="checkbox" id="show-boxes" ${state.boxes ? "checked" : ""}/> 显示检测框</label></div>
  <div class="image-stage ${state.image ? "has-image" : "is-empty"}" id="dropzone">${state.image ? `<div class="image-wrap"><img id="specimen" src="${escape(state.image)}" alt="${escape(state.name)}"/><svg id="box-layer" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-label="检测区域标注"></svg></div><div class="image-corner">${state.mode === "demo" ? "演示图片 · 预设标注" : "图片预览"}</div>` : `<button class="empty-upload" id="empty-upload" ${state.busy ? "disabled" : ""}>${icon("upload")}<strong>将图片拖到此处，或<span>点击上传</span></strong><span class="upload-hint">支持 JPG、PNG、WebP，单张不超过 10 MB</span></button>`}<div class="scan-line" ${state.busy ? "" : "hidden"}></div></div>
  ${state.image ? `<div class="viewer-controls" aria-label="图片查看工具"><button class="button outlined" id="zoom-out" aria-label="缩小图片" ${state.zoom <= 0.5 ? "disabled" : ""}>−</button><output id="zoom-value">${Math.round(state.zoom * 100)}%</output><button class="button outlined" id="zoom-in" aria-label="放大图片" ${state.zoom >= 3 ? "disabled" : ""}>+</button><button class="text-button" id="zoom-fit">适应窗口</button><span>${state.width || "—"} × ${state.height || "—"} 像素</span><button class="text-button danger" id="reset-image" ${state.busy ? "disabled" : ""}>清除图片</button></div>` : ""}
  <div class="image-toolbar"><span id="file-name" title="${escape(state.name)}">${escape(state.name || "未选择图片")}</span><button class="button outlined" id="camera-open" ${state.busy || state.loading ? "disabled" : ""}>摄像头拍照</button><button class="button outlined" id="upload" ${state.busy ? "disabled" : ""}>${icon("upload")} ${state.image ? "更换图片" : "选择图片"}</button><input id="file-input" type="file" accept="image/jpeg,image/png,image/webp" hidden/></div>
  <details class="sample-details"><summary>样本信息 <span>编号、地块、批次与采集时间</span></summary>${sampleFields(state.sample, "workspace", state.history)}</details>
  <div class="demo-note">${icon("info")}<span>${state.mode === "demo" ? "示例标注为预设数据，不代表模型识别结果。" : apiEnabled ? "图片在点击检测后发送至本地服务。" : "在线版支持预览图片和查看示例；真实检测请在本地运行。"}</span></div></section>
  <aside class="inspector"><section class="panel settings"><div class="panel-heading"><h2><span class="step-index">02</span> 检测参数</h2></div><div class="settings-body"><label class="field-label" for="mode">检测方式</label><select id="mode" ${state.busy ? "disabled" : ""}><option value="demo" ${state.mode === "demo" ? "selected" : ""}>示例演示</option><option value="model" ${state.mode === "model" ? "selected" : ""}>YOLO 模型检测</option></select><div class="connection ${state.status === "ready" ? "connected" : ""}"><span class="status-dot"></span><span>${serviceLabel()}</span><button id="refresh-status" ${!apiEnabled || state.busy ? "hidden" : ""} aria-label="重新检查服务" title="重新检查服务">↻</button></div>
  <div class="range-heading"><label for="threshold">置信度阈值</label><output id="threshold-output">${Math.round(state.threshold * 100)}%</output></div><input id="threshold" type="range" min="10" max="99" value="${Math.round(state.threshold * 100)}" ${state.busy ? "disabled" : ""}/><div class="range-labels"><span>10%</span><span>99%</span></div><p class="field-help">低于阈值的结果不显示。模型检测调整参数后需重新运行。</p><button class="button primary" id="detect" ${action.disabled ? "disabled" : ""}>${icon("scan")} ${action.label}</button>${state.busy ? '<button class="text-button" id="cancel-detection">取消等待</button>' : state.mode === "model" && state.status !== "ready" ? '<a class="setup-link" href="#guide">查看环境配置与模型接入步骤</a>' : ""}<p class="error" id="error" role="alert" ${state.error ? "" : "hidden"}>${escape(state.error)}</p></div></section>
  <section class="panel results"><div class="panel-heading"><h2><span class="step-index">03</span> 检测结果</h2><span class="badge" id="result-count"></span></div><div id="results-summary" class="results-summary" hidden></div><div id="results-body"></div><div class="record-draft"><label for="inspection-note">记录备注（可选）</label><textarea id="inspection-note" maxlength="1000" rows="2" placeholder="采集地点、样本编号或待复核事项">${escape(state.notes)}</textarea></div><div class="results-footer export-options"><button id="export-image" class="button outlined">导出标注图</button><button id="export-csv" class="button outlined">CSV</button><button id="export" class="button outlined">${icon("download")} 导出 JSON</button><button id="save" class="button primary">保存记录</button></div></section></aside></div>
  <p class="workspace-note">检测结果仅供参考，请结合实际情况复核。</p>`;
  main
    .querySelector("#start-guide")
    ?.addEventListener("click", () => onboarding.open());
  main.querySelectorAll("[data-sample]").forEach(
    (input) =>
      (input.oninput = () => {
        try {
          state.sample = readSample(main, state.sample);
          renderResults();
        } catch (error) {
          toast(error.message);
        }
      }),
  );
  document.querySelector("#sample-top").onclick = useSample;
  document.querySelector("#camera-open").onclick = (event) =>
    camera.open(event.currentTarget);
  document.querySelector("#upload").onclick = () =>
    document.querySelector("#file-input").click();
  document.querySelector("#file-input").onchange = (event) =>
    acceptFile(event.target.files[0]);
  const emptyUpload = document.querySelector("#empty-upload");
  if (emptyUpload)
    emptyUpload.onclick = () => document.querySelector("#file-input").click();
  const dropzone = document.querySelector("#dropzone");
  dropzone.ondragover = (event) => {
    event.preventDefault();
    dropzone.classList.add("dragging");
  };
  dropzone.ondragleave = () => dropzone.classList.remove("dragging");
  dropzone.ondrop = (event) => {
    event.preventDefault();
    dropzone.classList.remove("dragging");
    if (!state.busy) acceptFile(event.dataTransfer.files[0]);
  };
  document.querySelector("#show-boxes").onchange = (event) => {
    state.boxes = event.target.checked;
    renderResults();
  };
  const threshold = document.querySelector("#threshold");
  threshold.style.setProperty(
    "--progress",
    `${((state.threshold * 100 - 10) / 89) * 100}%`,
  );
  threshold.oninput = (event) => {
    state.threshold = Number(event.target.value) / 100;
    threshold.style.setProperty(
      "--progress",
      `${((Number(event.target.value) - 10) / 89) * 100}%`,
    );
    document.querySelector("#threshold-output").textContent =
      `${event.target.value}%`;
    if (state.mode === "model") {
      state.completed = false;
      state.detections = [];
    }
    renderResults();
  };
  document.querySelector("#mode").onchange = (event) => {
    if (event.target.value === "demo") useSample();
    else {
      state.mode = "model";
      state.detections = [];
      state.completed = false;
      state.error = "";
      render();
    }
  };
  document.querySelector("#refresh-status").onclick = checkService;
  document.querySelector("#detect").onclick = detect;
  document.querySelector("#export").onclick = () =>
    downloadReport(currentRecord());
  document.querySelector("#save").onclick = saveRecord;
  document.querySelector("#inspection-note").oninput = (event) => {
    state.notes = event.target.value;
    renderResults();
  };
  document.querySelector("#export-csv").onclick = () =>
    downloadCSV([currentRecord()]);
  document.querySelector("#export-image").onclick = async () => {
    const button = document.querySelector("#export-image");
    button.disabled = true;
    try {
      await downloadAnnotatedImage(state.image, currentRecord());
      toast("标注图片已导出");
    } catch (error) {
      toast(error.message || "图片导出失败，请重试");
    } finally {
      if (state.view === "workspace") renderResults();
    }
  };
  if (state.image) {
    const updateZoom = (value) => {
      state.zoom = Math.min(3, Math.max(0.5, value));
      fitImage();
      document.querySelector("#zoom-value").textContent =
        `${Math.round(state.zoom * 100)}%`;
      document.querySelector("#zoom-out").disabled = state.zoom <= 0.5;
      document.querySelector("#zoom-in").disabled = state.zoom >= 3;
    };
    document.querySelector("#zoom-in").onclick = () =>
      updateZoom(state.zoom + 0.25);
    document.querySelector("#zoom-out").onclick = () =>
      updateZoom(state.zoom - 0.25);
    document.querySelector("#zoom-fit").onclick = () => {
      updateZoom(1);
      dropzone.scrollTo(0, 0);
    };
    document.querySelector("#reset-image").onclick = clearImage;
  }
  const cancel = document.querySelector("#cancel-detection");
  if (cancel)
    cancel.onclick = () => {
      activeRequest?.abort();
    };

  const specimen = document.querySelector("#specimen");
  if (specimen) {
    specimen.onload = fitImage;
    if (specimen.complete) fitImage();
  }
  renderResults();
}

function fitImage() {
  const img = document.querySelector("#specimen");
  const stage = document.querySelector("#dropzone");
  if (!img || !stage || !img.naturalWidth) return;
  const scale =
    Math.min(
      stage.clientWidth / img.naturalWidth,
      stage.clientHeight / img.naturalHeight,
    ) * state.zoom;
  img.parentElement.style.width = `${img.naturalWidth * scale}px`;
  img.parentElement.style.height = `${img.naturalHeight * scale}px`;
}

function serviceLabel() {
  if (!apiEnabled) return "在线演示，未连接模型服务";
  return {
    checking: "正在检查本地服务",
    offline: "本地服务未连接",
    missing: "服务在线 · 尚未配置模型",
    ready: `YOLO 已就绪 · ${escape(state.model)}`,
  }[state.status];
}

function renderResults() {
  if (state.view !== "workspace") return;
  const focusedResult = document.activeElement?.dataset.result;
  const items = visibleDetections(state.detections, state.threshold);
  document.querySelector("#result-count").textContent = state.completed
    ? `${items.length} 个区域`
    : "等待检测";
  const boxLayer = document.querySelector("#box-layer");
  if (boxLayer)
    boxLayer.innerHTML = !state.boxes
      ? ""
      : items
          .map((item, i) => {
            const [x1, y1, x2, y2] = item.box.map((v) => v * 1000);
            return `<g class="detection-box ${state.selected === i ? "selected" : ""}"><rect x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}"/><text x="${x1 + 9}" y="${Math.max(24, y1 - 12)}">${i + 1} / ${Math.round(item.confidence * 100)}%</text></g>`;
          })
          .join("");
  document.querySelector("#results-body").innerHTML = items.length
    ? `<div class="result-table-heading"><span>序号</span><span>类别</span><span>置信度</span></div><div class="result-list">${items.map((item, i) => `<button class="result-row ${state.selected === i ? "selected" : ""}" data-result="${i}" aria-pressed="${state.selected === i}"><span class="result-number">${i + 1}</span><span class="result-label">${escape(item.label)}</span><strong>${(item.confidence * 100).toFixed(1)}%</strong></button>`).join("")}</div><p class="result-help">点击结果行可高亮对应区域。</p>`
    : `<div class="empty-results">${icon("scan")}<strong>${state.completed ? "当前阈值下未检出区域" : "暂无检测结果"}</strong><p>${state.completed ? "未检出不代表健康，请结合实际复核。" : "上传图片后开始检测，或加载示例。"}</p></div>`;
  document.querySelectorAll("[data-result]").forEach(
    (button) =>
      (button.onclick = () => {
        state.selected = Number(button.dataset.result);
        renderResults();
      }),
  );
  if (focusedResult !== undefined) {
    [...document.querySelectorAll("[data-result]")]
      .find((button) => button.dataset.result === focusedResult)
      ?.focus({ preventScroll: true });
  }
  document.querySelector("#export").disabled = !state.completed || state.busy;
  const saved = state.resultId
    ? state.history.find((r) => r.id === currentRecord().id)
    : null;
  document.querySelector("#save").disabled =
    !state.completed || state.busy || !!(saved && sameWorkspaceFields(saved));
  document.querySelector("#save").textContent = saved
    ? sameWorkspaceFields(saved)
      ? "已保存"
      : "更新记录"
    : "保存记录";
  document.querySelector("#export-csv").disabled =
    !state.completed || state.busy;
  document.querySelector("#export-image").disabled =
    !state.completed || state.busy || !state.image;
  const summary = document.querySelector("#results-summary");
  summary.hidden = !state.completed;
  summary.textContent = state.completed
    ? `${new Set(items.map((item) => item.label)).size} 类 · ${items.length} 个区域${items.length ? ` · 最高置信度 ${(Math.max(...items.map((d) => d.confidence)) * 100).toFixed(1)}%` : ""}${state.mode === "model" && Number.isFinite(state.elapsedMs) ? ` · 推理 ${state.elapsedMs} ms` : ""}`
    : "";
}

function useSample() {
  if (state.busy) return;
  selectionToken++;
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
  Object.assign(state, {
    mode: "demo",
    file: null,
    image: "./specimen.svg",
    name: "示例图片.svg",
    zoom: 1,
    loading: false,
    width: 1000,
    height: 680,
    notes: "",
    sample: newSample(),
    elapsedMs: null,
    resultId: crypto.randomUUID(),
    resultAt: new Date().toISOString(),
    detections: [...DEMO_DETECTIONS],
    completed: true,
    error: "",
    selected: -1,
  });
  render();
}

function clearImage(renderView = true) {
  if (state.busy) return;
  selectionToken++;
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
  Object.assign(state, {
    image: "",
    file: null,
    name: "",
    width: null,
    height: null,
    notes: "",
    sample: newSample(),
    detections: [],
    completed: false,
    loading: false,
    zoom: 1,
    resultId: "",
    resultAt: "",
    error: "",
    elapsedMs: null,
  });
  if (renderView) render();
}

function demoLocation(active, view) {
  const url = new URL(location.href);
  if (active) url.searchParams.set("demo", "1");
  else url.searchParams.delete("demo");
  url.hash = view;
  history.replaceState(null, "", url);
  previousUrl = location.pathname + location.search + location.hash;
  state.view = view;
}

function enterDemo(view) {
  if (apiEnabled) return;
  if (state.busy || state.loading)
    return toast("请等待当前操作完成后进入演示。");
  camera.close();
  if (!demoActive) {
    personalWorkspace = { ...state };
    personalObjectUrl = objectUrl;
    objectUrl = null;
    demoActive = true;
    demoSession.initialize();
    clearImage(false);
    state.history = initialHistory();
    state.mode = "demo";
    state.threshold = 0.5;
    state.boxes = true;
  }
  demoLocation(true, view);
  shell();
  if (view === "workspace" && !state.image) useSample();
}

function exitDemo(view = "workspace") {
  if (state.busy || state.loading)
    return toast("请等待当前操作完成后退出演示。");
  camera.close();
  clearImage(false);
  demoActive = false;
  if (personalWorkspace) Object.assign(state, personalWorkspace);
  objectUrl = personalObjectUrl || null;
  personalWorkspace = null;
  personalObjectUrl = null;
  state.history = initialHistory();
  demoLocation(false, view);
  shell();
  toast("已退出演示，回到本机工作区。");
}

function resetDemo() {
  if (
    !demoActive ||
    !confirm(
      "重置当前演示空间？演示修改将被 12 条初始案例替换，本机个人记录不受影响。",
    )
  )
    return;
  if (state.busy || state.loading) return toast("请等待当前操作完成后重置。");
  clearImage(false);
  demoSession.reset();
  demoScreenPreferences = { source: "demo", days: 7, distance: "standard" };
  state.history = initialHistory();
  shell();
  toast("已恢复 12 条演示案例。");
}

async function shareDemo() {
  const url = new URL("https://guhang2011.github.io/fieldlens/");
  url.searchParams.set("demo", "1");
  url.hash = "demo";
  try {
    await navigator.clipboard.writeText(url.href);
    toast("已复制演示链接，只分享入口，不包含你的修改或照片。");
  } catch {
    prompt("复制此链接即可打开在线演示，不包含你的修改或照片：", url.href);
  }
}

async function acceptFile(file) {
  if (!file || state.busy) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    return toast("请选择 JPG、PNG 或 WebP 图片");
  if (file.size > 10 * 1024 * 1024) return toast("图片不能超过 10 MB");
  const token = ++selectionToken;
  state.loading = true;
  render();
  const url = URL.createObjectURL(file);
  const probe = new Image();
  try {
    probe.src = url;
    await probe.decode();
    if (token !== selectionToken) {
      URL.revokeObjectURL(url);
      return;
    }
    if (probe.naturalWidth * probe.naturalHeight > 25000000)
      throw Error("图片分辨率过大，请缩小至 2500 万像素以内");
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = url;
    Object.assign(state, {
      file,
      image: url,
      name: file.name,
      mode: "model",
      detections: [],
      completed: false,
      error: "",
      selected: -1,
      zoom: 1,
      width: probe.naturalWidth,
      height: probe.naturalHeight,
      notes: "",
      sample: newSample(),
      resultId: "",
      resultAt: "",
      elapsedMs: null,
    });
  } catch (error) {
    URL.revokeObjectURL(url);
    if (token === selectionToken)
      toast(
        error.message.includes("分辨率")
          ? error.message
          : "图片无法读取，请选择有效的图像文件",
      );
  } finally {
    if (token === selectionToken) {
      state.loading = false;
      if (state.view === "workspace") render();
    }
  }
}

async function checkService() {
  if (state.busy) return;
  if (!apiEnabled) {
    state.status = "offline";
    return;
  }
  try {
    const response = await apiFetch("/api/health", {
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) throw new Error();
    const data = await response.json();
    state.status = data.ready ? "ready" : "missing";
    state.model = data.model || "自定义模型";
  } catch {
    state.status = "offline";
  }
  if (state.view === "workspace") render();
}

async function detect() {
  if (state.busy || state.loading) return;
  if (state.mode === "demo" && !state.image) {
    useSample();
    return;
  }
  if (state.mode === "model" && !apiEnabled) {
    state.error =
      "当前为静态展示版。请下载源码，在本地启动 YOLO 服务后检测自己的图片。";
    render();
    return;
  }
  if (state.mode === "model" && !state.file) {
    state.error = "请先选择一张本地图片，再运行 YOLO 检测。";
    render();
    return;
  }
  activeRequest = new AbortController();
  state.busy = true;
  state.error = "";
  state.detections = [];
  state.completed = false;
  render();
  try {
    if (state.mode === "demo") {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 650);
        activeRequest.signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new DOMException("已取消", "AbortError"));
          },
          { once: true },
        );
      });
      state.detections = [...DEMO_DETECTIONS];
    } else {
      const body = new FormData();
      body.append("image", state.file);
      body.append("confidence", String(state.threshold));
      const response = await apiFetch("/api/detect", {
        method: "POST",
        body,
        signal: AbortSignal.any([
          activeRequest.signal,
          AbortSignal.timeout(120000),
        ]),
      });
      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error("检测服务未连接，请按项目文档启动本地服务。");
      }
      if (!response.ok)
        throw new Error(data.error || "检测失败，请检查本地服务");
      state.detections = validateResult(data);
      state.elapsedMs =
        Number.isFinite(data.elapsed_ms) && data.elapsed_ms >= 0
          ? data.elapsed_ms
          : null;
    }
    state.completed = true;
    state.resultId = crypto.randomUUID();
    state.resultAt = new Date().toISOString();
    state.selected = -1;
    toast(
      state.mode === "demo"
        ? "示例已完成，标注为预设演示数据"
        : "检测完成，请复核结果",
    );
  } catch (error) {
    state.error =
      error.name === "AbortError"
        ? "已取消等待，可以重新开始。"
        : error.name === "TimeoutError"
          ? "检测超时，请检查模型和设备后重试。"
          : error.message === "Failed to fetch"
            ? "无法连接检测服务，请检查服务是否启动。"
            : error.message;
  } finally {
    state.busy = false;
    activeRequest = null;
    if (state.view === "workspace") render();
  }
}

function currentRecord() {
  const id = `${state.resultId}-${Math.round(state.threshold * 100)}`;
  const saved = state.history.find((record) => record.id === id);
  return {
    id,
    name: state.name,
    date: state.resultAt,
    width: state.width,
    height: state.height,
    notes: state.notes.trim(),
    sample: normalizeSample(state.sample),
    followUp: saved?.followUp ?? null,
    regionReviews: saved?.regionReviews ?? [],
    reviewed: saved?.reviewed ?? false,
    model: state.mode === "model" ? state.model : "",
    mode: state.mode,
    threshold: state.threshold,
    detections: visibleDetections(state.detections, state.threshold),
  };
}
function sameWorkspaceFields(record) {
  return (
    record.notes === state.notes.trim() &&
    JSON.stringify(normalizeSample(record.sample)) ===
      JSON.stringify(normalizeSample(state.sample))
  );
}
function persistRecords(records) {
  if (records.length > HISTORY_LIMIT) {
    toast("最多保存 30 条，请先导出备份并整理旧记录。当前结果仍可导出。");
    return false;
  }
  try {
    recordStorage().setItem("fieldlens.history", JSON.stringify(records));
    const demoStatus = document.querySelector("#demo-storage-status");
    if (demoStatus) demoStatus.textContent = demoSession.status();
    const id = `${state.resultId}-${Math.round(state.threshold * 100)}`;
    const previous = state.history.find((record) => record.id === id);
    const updated = records.find((record) => record.id === id);
    // Synchronize saved review edits without discarding a separate workspace draft.
    if (previous && updated && state.notes.trim() === previous.notes) {
      state.notes = updated.notes;
    }
    if (
      previous &&
      updated &&
      JSON.stringify(normalizeSample(state.sample)) ===
        JSON.stringify(normalizeSample(previous.sample))
    )
      state.sample = normalizeSample(updated.sample);
    state.history = records;
    return true;
  } catch {
    toast("浏览器存储不可用，请先导出报告保存结果");
    return false;
  }
}

function saveRecord() {
  if (!state.completed || state.busy) return;
  const current = currentRecord();
  const previous = state.history.find((r) => r.id === current.id);
  if (previous && sameWorkspaceFields(previous))
    return toast("这次检测已经保存");
  const record = previous
    ? { ...current, reviewed: previous.reviewed }
    : current;
  const next = [record, ...state.history.filter((r) => r.id !== record.id)];
  if (persistRecords(next)) {
    toast(previous ? "记录已更新" : "已保存到检测记录");
    renderResults();
  }
}
function downloadReport(record) {
  downloadJSON(record);
}
function renderHistory(main) {
  renderHistoryPage(main, {
    getRecords: () => state.history,
    apiEnabled,
    storageNote: demoActive
      ? "演示空间 · 最多 30 条 · 修改仅保留在当前标签页。备份不含原图；退出后返回本机记录。"
      : undefined,
    persist: persistRecords,
    toast,
    initialTask:
      new URLSearchParams(location.hash.split("?")[1] || "").get("task") ||
      "all",
  });
}

function renderGuide(main) {
  const windows = String.raw`python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r server/requirements-yolo.txt
$env:FIELDLENS_MODEL = 'D:\models\crop-detect.pt'
.\.venv\Scripts\python.exe -m server.app`;
  const unix = `python3 -m venv .venv\n.venv/bin/python -m pip install -r server/requirements-yolo.txt\nFIELDLENS_MODEL=/absolute/path/crop-detect.pt .venv/bin/python -m server.app`;
  main.innerHTML = `<section class="page-heading"><div><h1>运行指南</h1><p>在线体验与本地模型检测的使用方式。</p></div></section><section class="panel guide-panel"><div class="panel-heading"><h2>先选择使用方式</h2></div><div class="guide-body"><div class="guide-options"><div><h3>只体验操作</h3><p>加载示例后，可调节阈值、缩放图片、导出标注图，并在记录中填写复核备注。无需安装环境，示例结果为预设数据。</p><a class="button primary" href="#workspace">返回工作台</a></div><div><h3>识别自己的图片</h3><p>需要在电脑上运行前端和 Python 服务，并提供有授权的作物病害目标检测权重。在线静态页面不运行 YOLO。</p><a class="button outlined" href="https://github.com/GuHang2011/fieldlens" target="_blank" rel="noopener">下载项目源码</a></div></div><ol class="setup-steps"><li><h3>准备环境和模型</h3><p>Node.js 22.12+、Python 3.12。下载源码后进入项目目录，准备经授权的 YOLO 目标检测权重；普通 COCO 模型不能用于识别作物病害。</p></li><li><h3>启动模型服务</h3><p>将命令中的权重路径替换为实际路径。安装 YOLO 会下载 PyTorch 等依赖。</p><details open><summary>Windows PowerShell</summary><pre><code>${escape(windows)}</code></pre></details><details><summary>macOS / Linux</summary><pre><code>${escape(unix)}</code></pre></details></li><li><h3>另开终端启动前端</h3><pre><code>npm ci\nnpm run dev</code></pre><p>打开终端显示的地址。页面显示“YOLO 已就绪”后，上传图片并开始检测。</p></li></ol><div class="demo-note">${icon("info")}<span>提示未连接：检查 Python 服务是否在 5050 端口运行。提示未配置模型：检查 FIELDLENS_MODEL 路径并重启服务。推理失败：检查权重是否为目标检测模型及服务日志。</span></div><a class="text-button" href="https://github.com/GuHang2011/fieldlens/blob/main/docs/DEPLOYMENT.md" target="_blank" rel="noopener">查看完整部署文档</a></div></section><section class="panel guide-panel"><div class="panel-heading"><h2>接入 AI 平台</h2><span class="badge">可选功能</span></div><div class="guide-body"><p>兼容 Chat Completions 接口的文字模型，包括 DeepSeek 等。YOLO 继续负责检测；AI 根据记录文字整理复核要点和巡检摘要。</p><ol><li>在 Python 服务端设置 FIELDLENS_AI_BASE_URL、FIELDLENS_AI_MODEL 和 FIELDLENS_AI_API_KEY，重启服务。</li><li>打开“AI 助手 → 平台 AI”，选择记录并检查配置；详情中的 AI 辅助也可使用。</li><li>核对发送内容预览后提交问题，回答可另存为 TXT。</li></ol><p>密钥只放在服务端，不写入网页或备份。在线展示版不发送 AI 请求；未配置 AI 也能使用检测与记录功能。</p><a class="button outlined" href="https://github.com/GuHang2011/fieldlens/blob/main/docs/AI_PLATFORM.md" target="_blank" rel="noopener">查看 DeepSeek 与通用平台配置示例</a></div></section>`;
}

function renderAbout(main) {
  main.innerHTML = `<section class="page-heading"><div><h1>项目说明</h1><p>功能说明、运行方式与开源许可。</p></div></section>
  <section class="panel about-panel"><div class="panel-heading"><h2>禾镜 FieldLens</h2><span class="badge">v1.8.0</span></div><div class="about-body"><p>作物图像检测工具，支持图片缩放、YOLO 检测、逐区域人工复核、记录对比、巡检报告和通用 AI 辅助。</p><dl class="description-list"><dt>界面</dt><dd>参考 Element UI 的后台界面风格，提供浅色、青绿、深色、暖砂与跟随系统换肤，保留标准表单和结果列表。</dd><dt>在线演示</dt><dd>示例图片和标注均为预设数据。上传自己的图片可预览，真实识别需本地运行。</dd><dt>本地检测</dt><dd>启动 Python 服务并配置授权 YOLO 目标检测权重。支持的作物和病害类别取决于模型。</dd><dt>检测记录</dt><dd>最多保留 30 条，满额后停止新增；支持备份恢复、样本批次、复查待办、搜索筛选和单条删除；只存储在当前浏览器，不保存图片、不跨设备同步。</dd><dt>当前范围</dt><dd>单张图片检测。支持逐区域复核、两次记录数据对比、打印报告及通用 AI 平台辅助。支持管理员开通账号、巡检大屏及操作引导。独立 AI 助手提供操作答疑、本地复核清单、巡检概览与兼容平台问答。支持摄像头拍照后检测，暂不包含连续视频检测。</dd><dt>开源许可</dt><dd>AGPL-3.0-only。依赖和模型按各自许可使用；未打包参考项目授权不明的代码、数据和权重。</dd></dl><div class="about-links"><a class="button primary" href="https://github.com/GuHang2011/fieldlens" target="_blank" rel="noopener">查看源码</a><a class="button outlined" href="https://github.com/GuHang2011/fieldlens/blob/main/docs/DEPLOYMENT.md" target="_blank" rel="noopener">部署文档</a></div></div></section>`;
}

let toastTimer;
function toast(message) {
  const el = document.querySelector("#toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 4500);
}
let previousUrl = location.pathname + location.search + location.hash;
function route() {
  const editor = document.querySelector("#record-dialog");
  const nextUrl = location.pathname + location.search + location.hash;
  if (
    editor?.open &&
    editor.dataset.dirty === "true" &&
    nextUrl === previousUrl
  )
    return;
  if (
    editor?.open &&
    editor.dataset.dirty === "true" &&
    !confirm("有未保存的修改，确定离开吗？")
  ) {
    history.replaceState(null, "", previousUrl);
    return;
  }
  const nextView = [
    "workspace",
    "history",
    "about",
    "guide",
    "dashboard",
    "login",
    "demo",
    "assistant",
  ].includes(location.hash.slice(1).split("?")[0])
    ? location.hash.slice(1).split("?")[0]
    : "workspace";
  const requestedDemo =
    !apiEnabled && new URLSearchParams(location.search).get("demo") === "1";
  if (requestedDemo !== demoActive) {
    if (state.busy || state.loading) {
      history.replaceState(null, "", previousUrl);
      return toast("请等待当前操作完成后切换工作区。");
    }
    if (requestedDemo) enterDemo(nextView);
    else exitDemo(nextView);
    return;
  }
  previousUrl = nextUrl;
  state.view = nextView;
  if (document.querySelector("#main")) render();
}
window.addEventListener("hashchange", route);
window.addEventListener("popstate", () => {
  const requestedDemo =
    !apiEnabled && new URLSearchParams(location.search).get("demo") === "1";
  if (requestedDemo !== demoActive) route();
});
window.addEventListener("resize", fitImage);
window.addEventListener("beforeunload", (event) => {
  const editor = document.querySelector("#record-dialog");
  if (editor?.open && editor.dataset.dirty === "true") {
    event.preventDefault();
    event.returnValue = "";
  }
});
setInterval(() => {
  const summary = document.querySelector(".workspace-task-summary > span");
  if (summary)
    summary.textContent = `待复查 ${state.history.filter((r) => matchesTask(r.followUp, "pending")).length} 条 · 今日及逾期 ${state.history.filter((r) => matchesTask(r.followUp, "today") || matchesTask(r.followUp, "overdue")).length} 条`;
}, 30000);
window.addEventListener("fieldlens:login-required", () => {
  if (!access.user) return;
  access.expired = true;
  const label = document.querySelector(".account-label");
  if (label) label.textContent = "会话已过期，请重新登录";
});
window.addEventListener("fieldlens:guide-done", () =>
  document.querySelector(".guide-welcome")?.remove(),
);
window.addEventListener("storage", (event) => {
  if (event.key === "fieldlens.auth.changed") location.reload();
  if (!demoActive && event.key === access.historyKey()) {
    state.history = initialHistory();
    window.dispatchEvent(new Event("fieldlens:records-changed"));
  }
});
async function boot() {
  app.innerHTML = '<p class="boot-status" role="status">正在打开禾镜…</p>';
  await access.initialize();
  if (demoActive) demoSession.initialize();
  state.history = initialHistory();
  route();
  shell();
  checkService();
}
boot();
