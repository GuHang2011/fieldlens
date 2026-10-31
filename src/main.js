import "./admin.css";
import "./features.css";
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
function initialHistory() {
  try {
    return loadHistory(localStorage);
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
  history: initialHistory(),
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
  resultId: "",
  resultAt: "",
  elapsedMs: null,
};
let objectUrl;
let selectionToken = 0;
let activeRequest;
const app = document.querySelector("#app");

function shell() {
  app.innerHTML = `<aside class="sidebar">
    <a class="brand" href="#workspace" aria-label="禾镜首页"><img src="./favicon.svg" alt=""/><span>禾镜 <b>FieldLens</b></span></a>
    <nav aria-label="主导航">
      <div class="nav-caption">检测管理</div>
      <button data-view="workspace">${icon("scan")}<span>图像检测</span></button>
      <button data-view="history">${icon("history")}<span>检测记录</span></button>
      <div class="nav-caption">使用帮助</div>
      <button data-view="guide">${icon("target")}<span>运行指南</span></button>
      <button data-view="about">${icon("info")}<span>项目说明</span></button>
    </nav>
    <a class="source-link" href="https://github.com/GuHang2011/fieldlens" target="_blank" rel="noopener">GitHub 仓库 ${icon("arrow")}</a>
    <div class="sidebar-footer">FieldLens <span>v1.1</span></div>
  </aside>
  <div class="main-shell"><header class="topbar"><div class="breadcrumb" aria-label="当前位置"><span id="breadcrumb-group">检测管理</span><span aria-hidden="true">/</span><strong id="breadcrumb">图像检测</strong></div><span class="local-badge">${apiEnabled ? "本地运行" : "在线演示"}</span></header><main id="main"></main><footer class="page-footer">禾镜 FieldLens · 作物病害检测系统</footer></div>
  <div id="toast" role="status" class="toast" hidden></div>`;
  app.querySelectorAll("[data-view]").forEach(
    (button) =>
      (button.onclick = () => {
        location.hash = button.dataset.view;
      }),
  );
  render();
}

function render() {
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
  }[state.view];
  document.querySelector("#breadcrumb-group").textContent = [
    "workspace",
    "history",
  ].includes(state.view)
    ? "检测管理"
    : "使用帮助";
  const main = document.querySelector("#main");
  if (state.view === "workspace") renderWorkspace(main);
  else if (state.view === "history") renderHistory(main);
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
  const action = primaryAction();
  main.innerHTML = `<section class="page-heading"><div><h1>图像检测</h1><p>上传作物图片，设置检测参数并查看结果。</p></div><button class="button outlined" id="sample-top" ${state.busy ? "disabled" : ""}>加载示例</button></section>
  ${!apiEnabled ? `<div class="capability-banner"><div><strong>在线演示</strong><span>可体验示例、预览图片、整理记录和导出报告。自己的图片需要在本地连接 YOLO 模型后检测。</span></div><a class="button outlined" href="#guide">本地运行指南</a></div>` : ""}
  <div class="workspace-grid"><section class="panel image-panel"><div class="panel-heading"><div><h2>检测图片</h2>${state.image ? `<span class="badge">${state.mode === "demo" ? "演示图片" : "已上传"}</span>` : ""}</div><label class="box-switch"><input type="checkbox" id="show-boxes" ${state.boxes ? "checked" : ""}/> 显示检测框</label></div>
  <div class="image-stage ${state.image ? "has-image" : "is-empty"}" id="dropzone">${state.image ? `<div class="image-wrap"><img id="specimen" src="${escape(state.image)}" alt="${escape(state.name)}"/><svg id="box-layer" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-label="检测区域标注"></svg></div><div class="image-corner">${state.mode === "demo" ? "演示图片 · 预设标注" : "图片预览"}</div>` : `<button class="empty-upload" id="empty-upload" ${state.busy ? "disabled" : ""}>${icon("upload")}<strong>将图片拖到此处，或<span>点击上传</span></strong><span class="upload-hint">支持 JPG、PNG、WebP，单张不超过 10 MB</span></button>`}<div class="scan-line" ${state.busy ? "" : "hidden"}></div></div>
  ${state.image ? `<div class="viewer-controls" aria-label="图片查看工具"><button class="button outlined" id="zoom-out" aria-label="缩小图片" ${state.zoom <= 0.5 ? "disabled" : ""}>−</button><output id="zoom-value">${Math.round(state.zoom * 100)}%</output><button class="button outlined" id="zoom-in" aria-label="放大图片" ${state.zoom >= 3 ? "disabled" : ""}>+</button><button class="text-button" id="zoom-fit">适应窗口</button><span>${state.width || "—"} × ${state.height || "—"} 像素</span><button class="text-button danger" id="reset-image" ${state.busy ? "disabled" : ""}>清除图片</button></div>` : ""}
  <div class="image-toolbar"><span id="file-name" title="${escape(state.name)}">${escape(state.name || "未选择图片")}</span><button class="button outlined" id="upload" ${state.busy ? "disabled" : ""}>${icon("upload")} ${state.image ? "更换图片" : "选择图片"}</button><input id="file-input" type="file" accept="image/jpeg,image/png,image/webp" hidden/></div>
  <div class="demo-note">${icon("info")}<span>${state.mode === "demo" ? "示例标注为预设数据，不代表模型识别结果。" : apiEnabled ? "图片在点击检测后发送至本地服务。" : "在线版支持预览图片和查看示例；真实检测请在本地运行。"}</span></div></section>
  <aside class="inspector"><section class="panel settings"><div class="panel-heading"><h2>检测参数</h2></div><div class="settings-body"><label class="field-label" for="mode">检测方式</label><select id="mode" ${state.busy ? "disabled" : ""}><option value="demo" ${state.mode === "demo" ? "selected" : ""}>示例演示</option><option value="model" ${state.mode === "model" ? "selected" : ""}>YOLO 模型检测</option></select><div class="connection ${state.status === "ready" ? "connected" : ""}"><span class="status-dot"></span><span>${serviceLabel()}</span><button id="refresh-status" ${!apiEnabled || state.busy ? "hidden" : ""} aria-label="重新检查服务" title="重新检查服务">↻</button></div>
  <div class="range-heading"><label for="threshold">置信度阈值</label><output id="threshold-output">${Math.round(state.threshold * 100)}%</output></div><input id="threshold" type="range" min="10" max="99" value="${Math.round(state.threshold * 100)}" ${state.busy ? "disabled" : ""}/><div class="range-labels"><span>10%</span><span>99%</span></div><p class="field-help">低于阈值的结果不显示。模型检测调整参数后需重新运行。</p><button class="button primary" id="detect" ${action.disabled ? "disabled" : ""}>${icon("scan")} ${action.label}</button>${state.busy ? '<button class="text-button" id="cancel-detection">取消等待</button>' : state.mode === "model" && state.status !== "ready" ? '<a class="setup-link" href="#guide">查看环境配置与模型接入步骤</a>' : ""}<p class="error" id="error" role="alert" ${state.error ? "" : "hidden"}>${escape(state.error)}</p></div></section>
  <section class="panel results"><div class="panel-heading"><h2>检测结果</h2><span class="badge" id="result-count"></span></div><div id="results-summary" class="results-summary" hidden></div><div id="results-body"></div><div class="record-draft"><label for="inspection-note">记录备注（可选）</label><textarea id="inspection-note" maxlength="1000" rows="2" placeholder="采集地点、样本编号或待复核事项">${escape(state.notes)}</textarea></div><div class="results-footer export-options"><button id="export-image" class="button outlined">导出标注图</button><button id="export-csv" class="button outlined">CSV</button><button id="export" class="button outlined">${icon("download")} 导出 JSON</button><button id="save" class="button primary">保存记录</button></div></section></aside></div>
  <p class="workspace-note">检测结果仅供参考，请结合实际情况复核。</p>`;
  document.querySelector("#sample-top").onclick = useSample;
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
    ? `<div class="result-table-heading"><span>序号</span><span>类别</span><span>置信度</span></div><div class="result-list">${items.map((item, i) => `<button class="result-row ${state.selected === i ? "selected" : ""}" data-result="${i}"><span class="result-number">${i + 1}</span><span class="result-label">${escape(item.label)}</span><strong>${(item.confidence * 100).toFixed(1)}%</strong></button>`).join("")}</div><p class="result-help">点击结果行可高亮对应区域。</p>`
    : `<div class="empty-results">${icon("scan")}<strong>${state.completed ? "当前阈值下未检出区域" : "暂无检测结果"}</strong><p>${state.completed ? "未检出不代表健康，请结合实际复核。" : "上传图片后开始检测，或加载示例。"}</p></div>`;
  document.querySelectorAll("[data-result]").forEach(
    (button) =>
      (button.onclick = () => {
        state.selected = Number(button.dataset.result);
        renderResults();
      }),
  );
  document.querySelector("#export").disabled = !state.completed || state.busy;
  const saved = state.resultId
    ? state.history.find((r) => r.id === currentRecord().id)
    : null;
  document.querySelector("#save").disabled =
    !state.completed ||
    state.busy ||
    !!(saved && saved.notes === state.notes.trim());
  document.querySelector("#save").textContent = saved
    ? saved.notes === state.notes.trim()
      ? "已保存"
      : "更新备注"
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

function clearImage() {
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
    detections: [],
    completed: false,
    loading: false,
    zoom: 1,
    resultId: "",
    resultAt: "",
    error: "",
    elapsedMs: null,
  });
  render();
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
      render();
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
    const response = await fetch("/api/health", {
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
      const response = await fetch("/api/detect", {
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
    render();
  }
}

function currentRecord() {
  return {
    id: `${state.resultId}-${Math.round(state.threshold * 100)}`,
    name: state.name,
    date: state.resultAt,
    width: state.width,
    height: state.height,
    notes: state.notes.trim(),
    reviewed: false,
    model: state.mode === "model" ? state.model : "",
    mode: state.mode,
    threshold: state.threshold,
    detections: visibleDetections(state.detections, state.threshold),
  };
}
function persistRecords(records) {
  try {
    localStorage.setItem("fieldlens.history", JSON.stringify(records));
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
  if (previous && previous.notes === current.notes)
    return toast("这次检测已经保存");
  const record = previous
    ? { ...current, reviewed: previous.reviewed }
    : current;
  const next = [
    record,
    ...state.history.filter((r) => r.id !== record.id),
  ].slice(0, 30);
  const full = !previous && state.history.length >= 30;
  if (persistRecords(next)) {
    toast(
      previous
        ? "记录备注已更新"
        : full
          ? "已保存，已替换最早的一条记录（最多 30 条）"
          : "已保存到检测记录",
    );
    renderResults();
  }
}
function downloadReport(record) {
  downloadJSON(record);
}
function renderHistory(main) {
  renderHistoryPage(main, {
    getRecords: () => state.history,
    persist: persistRecords,
    toast,
  });
}

function renderGuide(main) {
  const windows = String.raw`python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r server/requirements-yolo.txt
$env:FIELDLENS_MODEL = 'D:\models\crop-detect.pt'
.\.venv\Scripts\python.exe -m server.app`;
  const unix = `python3 -m venv .venv\n.venv/bin/python -m pip install -r server/requirements-yolo.txt\nFIELDLENS_MODEL=/absolute/path/crop-detect.pt .venv/bin/python -m server.app`;
  main.innerHTML = `<section class="page-heading"><div><h1>运行指南</h1><p>在线体验与本地模型检测的使用方式。</p></div></section><section class="panel guide-panel"><div class="panel-heading"><h2>先选择使用方式</h2></div><div class="guide-body"><div class="guide-options"><div><h3>只体验操作</h3><p>加载示例后，可调节阈值、缩放图片、导出标注图，并在记录中填写复核备注。无需安装环境，示例结果为预设数据。</p><a class="button primary" href="#workspace">返回工作台</a></div><div><h3>识别自己的图片</h3><p>需要在电脑上运行前端和 Python 服务，并提供有授权的作物病害目标检测权重。在线静态页面不运行 YOLO。</p><a class="button outlined" href="https://github.com/GuHang2011/fieldlens" target="_blank" rel="noopener">下载项目源码</a></div></div><ol class="setup-steps"><li><h3>准备环境和模型</h3><p>Node.js 22.12+、Python 3.12。下载源码后进入项目目录，准备经授权的 YOLO 目标检测权重；普通 COCO 模型不能用于识别作物病害。</p></li><li><h3>启动模型服务</h3><p>将命令中的权重路径替换为实际路径。安装 YOLO 会下载 PyTorch 等依赖。</p><details open><summary>Windows PowerShell</summary><pre><code>${escape(windows)}</code></pre></details><details><summary>macOS / Linux</summary><pre><code>${escape(unix)}</code></pre></details></li><li><h3>另开终端启动前端</h3><pre><code>npm ci\nnpm run dev</code></pre><p>打开终端显示的地址。页面显示“YOLO 已就绪”后，上传图片并开始检测。</p></li></ol><div class="demo-note">${icon("info")}<span>提示未连接：检查 Python 服务是否在 5050 端口运行。提示未配置模型：检查 FIELDLENS_MODEL 路径并重启服务。推理失败：检查权重是否为目标检测模型及服务日志。</span></div><a class="text-button" href="https://github.com/GuHang2011/fieldlens/blob/main/docs/DEPLOYMENT.md" target="_blank" rel="noopener">查看完整部署文档</a></div></section>`;
}

function renderAbout(main) {
  main.innerHTML = `<section class="page-heading"><div><h1>项目说明</h1><p>功能说明、运行方式与开源许可。</p></div></section>
  <section class="panel about-panel"><div class="panel-heading"><h2>禾镜 FieldLens</h2><span class="badge">v1.1</span></div><div class="about-body"><p>作物图像检测工具，支持图片缩放、YOLO 检测框、置信度筛选、标注图与 CSV 导出、记录检索和人工复核。</p><dl class="description-list"><dt>界面</dt><dd>参考 Element UI 的后台界面风格，使用蓝色主操作、标准表单与结果列表。</dd><dt>在线演示</dt><dd>示例图片和标注均为预设数据。上传自己的图片可预览，真实识别需本地运行。</dd><dt>本地检测</dt><dd>启动 Python 服务并配置授权 YOLO 目标检测权重。支持的作物和病害类别取决于模型。</dd><dt>检测记录</dt><dd>最多保留 30 条，支持搜索、筛选、复核备注和单条删除；只存储在当前浏览器，不保存图片、不跨设备同步。</dd><dt>当前范围</dt><dd>单张图片检测。暂不包含视频、摄像头、账户管理和病害防治建议。</dd><dt>开源许可</dt><dd>AGPL-3.0-only。依赖和模型按各自许可使用；未打包参考项目授权不明的代码、数据和权重。</dd></dl><div class="about-links"><a class="button primary" href="https://github.com/GuHang2011/fieldlens" target="_blank" rel="noopener">查看源码</a><a class="button outlined" href="https://github.com/GuHang2011/fieldlens/blob/main/docs/DEPLOYMENT.md" target="_blank" rel="noopener">部署文档</a></div></div></section>`;
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
function route() {
  state.view = ["workspace", "history", "about", "guide"].includes(
    location.hash.slice(1),
  )
    ? location.hash.slice(1)
    : "workspace";
  if (document.querySelector("#main")) render();
}
window.addEventListener("hashchange", route);
window.addEventListener("resize", fitImage);
route();
shell();
checkService();
