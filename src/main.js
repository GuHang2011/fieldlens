import "./admin.css";
import {
  DEMO_DETECTIONS,
  visibleDetections,
  validateResult,
  loadHistory,
  reportFor,
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
  mode: "model",
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
};
let objectUrl;
const app = document.querySelector("#app");

function shell() {
  app.innerHTML = `<aside class="sidebar">
    <a class="brand" href="#workspace" aria-label="禾镜首页"><img src="./favicon.svg" alt=""/><span>禾镜 <b>FieldLens</b></span></a>
    <div class="nav-caption">检测管理</div>
    <nav aria-label="主导航">
      <button data-view="workspace">${icon("scan")}<span>图像检测</span></button>
      <button data-view="history">${icon("history")}<span>检测记录</span></button>
      <button data-view="about">${icon("info")}<span>项目说明</span></button>
    </nav>
    <a class="source-link" href="https://github.com/GuHang2011/fieldlens" target="_blank" rel="noopener">GitHub 仓库 ${icon("arrow")}</a>
    <div class="sidebar-footer">FieldLens <span>v1.0</span></div>
  </aside>
  <div class="main-shell"><header class="topbar"><div>作物病害检测 <span>/</span> <strong id="breadcrumb">图像检测</strong></div><span class="local-badge">${apiEnabled ? "本地运行" : "在线演示"}</span></header><main id="main"></main><footer class="page-footer">禾镜 FieldLens · 作物病害检测系统</footer></div>
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
  }[state.view];
  const main = document.querySelector("#main");
  if (state.view === "workspace") renderWorkspace(main);
  else if (state.view === "history") renderHistory(main);
  else renderAbout(main);
}

function renderWorkspace(main) {
  main.innerHTML = `<section class="page-heading"><div><h1>图像检测</h1><p>上传作物图片，设置检测参数并查看结果。</p></div><button class="button outlined" id="sample-top" ${state.busy ? "disabled" : ""}>加载示例</button></section>
  <div class="workspace-grid"><section class="panel image-panel"><div class="panel-heading"><div><h2>检测图片</h2>${state.image ? `<span class="badge">${state.mode === "demo" ? "演示图片" : "已上传"}</span>` : ""}</div><label class="box-switch"><input type="checkbox" id="show-boxes" ${state.boxes ? "checked" : ""}/> 显示检测框</label></div>
  <div class="image-stage ${state.image ? "has-image" : "is-empty"}" id="dropzone">${state.image ? `<div class="image-wrap"><img id="specimen" src="${escape(state.image)}" alt="${escape(state.name)}"/><svg id="box-layer" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-label="检测区域标注"></svg></div><div class="image-corner">${state.mode === "demo" ? "演示图片 · 预设标注" : "图片预览"}</div>` : `<button class="empty-upload" id="empty-upload" ${state.busy ? "disabled" : ""}>${icon("upload")}<strong>将图片拖到此处，或<span>点击上传</span></strong><span class="upload-hint">支持 JPG、PNG、WebP，单张不超过 10 MB</span></button>`}<div class="scan-line" ${state.busy ? "" : "hidden"}></div></div>
  <div class="image-toolbar"><span id="file-name" title="${escape(state.name)}">${escape(state.name || "未选择图片")}</span><button class="button outlined" id="upload" ${state.busy ? "disabled" : ""}>${icon("upload")} ${state.image ? "更换图片" : "选择图片"}</button><input id="file-input" type="file" accept="image/jpeg,image/png,image/webp" hidden/></div>
  <div class="demo-note">${icon("info")}<span>${state.mode === "demo" ? "示例标注为预设数据，不代表模型识别结果。" : apiEnabled ? "图片在点击检测后发送至本地服务。" : "在线版支持预览图片和查看示例；真实检测请在本地运行。"}</span></div></section>
  <aside class="inspector"><section class="panel settings"><div class="panel-heading"><h2>检测参数</h2></div><div class="settings-body"><label class="field-label" for="mode">检测方式</label><select id="mode" ${state.busy ? "disabled" : ""}><option value="demo" ${state.mode === "demo" ? "selected" : ""}>示例演示</option><option value="model" ${state.mode === "model" ? "selected" : ""}>YOLO 模型检测</option></select><div class="connection ${state.status === "ready" ? "connected" : ""}"><span class="status-dot"></span><span>${serviceLabel()}</span><button id="refresh-status" aria-label="重新检查服务" title="重新检查服务">↻</button></div>
  <div class="range-heading"><label for="threshold">置信度阈值</label><output id="threshold-output">${Math.round(state.threshold * 100)}%</output></div><input id="threshold" type="range" min="10" max="99" value="${Math.round(state.threshold * 100)}" ${state.busy ? "disabled" : ""}/><div class="range-labels"><span>10%</span><span>99%</span></div><p class="field-help">低于阈值的结果不显示。模型检测调整参数后需重新运行。</p><button class="button primary" id="detect" ${state.busy ? "disabled" : ""}>${icon("scan")} ${state.busy ? "检测中…" : state.mode === "demo" ? "运行示例检测" : "开始检测"}</button><p class="error" id="error" role="alert" ${state.error ? "" : "hidden"}>${escape(state.error)}</p></div></section>
  <section class="panel results"><div class="panel-heading"><h2>检测结果</h2><span class="badge" id="result-count"></span></div><div id="results-body"></div><div class="results-footer"><button id="export" class="button outlined">${icon("download")} 导出 JSON</button><button id="save" class="button primary">保存记录</button></div></section></aside></div>
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
  const scale = Math.min(
    stage.clientWidth / img.naturalWidth,
    540 / img.naturalHeight,
  );
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
  document.querySelector("#save").disabled = !state.completed || state.busy;
}

function useSample() {
  if (state.busy) return;
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
  Object.assign(state, {
    mode: "demo",
    file: null,
    image: "./specimen.svg",
    name: "示例图片.svg",
    detections: [...DEMO_DETECTIONS],
    completed: true,
    error: "",
    selected: -1,
  });
  render();
}

async function acceptFile(file) {
  if (!file || state.busy) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    return toast("请选择 JPG、PNG 或 WebP 图片");
  if (file.size > 10 * 1024 * 1024) return toast("图片不能超过 10 MB");
  const url = URL.createObjectURL(file);
  const probe = new Image();
  try {
    probe.src = url;
    await probe.decode();
  } catch {
    URL.revokeObjectURL(url);
    return toast("图片无法读取，请选择有效的图像文件");
  }
  if (probe.naturalWidth * probe.naturalHeight > 25000000) {
    URL.revokeObjectURL(url);
    return toast("图片分辨率过大，请缩小至 2500 万像素以内");
  }
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
  });
  render();
}

async function checkService() {
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
  if (state.view === "workspace") {
    const el = document.querySelector(".connection");
    el.classList.toggle("connected", state.status === "ready");
    el.querySelector("span:nth-child(2)").innerHTML = serviceLabel();
  }
}

async function detect() {
  if (state.busy) return;
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
  state.busy = true;
  state.error = "";
  state.detections = [];
  state.completed = false;
  render();
  try {
    if (state.mode === "demo") {
      await new Promise((resolve) => setTimeout(resolve, 650));
      state.detections = [...DEMO_DETECTIONS];
    } else {
      const body = new FormData();
      body.append("image", state.file);
      body.append("confidence", String(state.threshold));
      const response = await fetch("/api/detect", {
        method: "POST",
        body,
        signal: AbortSignal.timeout(120000),
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
    }
    state.completed = true;
    state.selected = -1;
    toast(
      state.mode === "demo"
        ? "示例已完成，标注为预设演示数据"
        : "检测完成，请复核结果",
    );
  } catch (error) {
    state.error =
      error.name === "TimeoutError"
        ? "检测超时，请检查模型和设备后重试。"
        : error.message === "Failed to fetch"
          ? "无法连接检测服务，请检查服务是否启动。"
          : error.message;
  } finally {
    state.busy = false;
    render();
  }
}

function currentRecord() {
  return {
    id: crypto.randomUUID(),
    name: state.name,
    date: new Date().toISOString(),
    mode: state.mode,
    threshold: state.threshold,
    detections: visibleDetections(state.detections, state.threshold),
  };
}
function saveRecord() {
  if (!state.completed || state.busy) return;
  const next = [currentRecord(), ...state.history].slice(0, 30);
  try {
    localStorage.setItem("fieldlens.history", JSON.stringify(next));
    state.history = next;
    toast("已保存到此浏览器的巡检记录");
  } catch {
    toast("浏览器存储不可用，请使用导出 JSON 保存结果");
  }
}
function downloadReport(record) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(reportFor(record), null, 2)], {
      type: "application/json",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `fieldlens-${record.id.slice(0, 8)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderHistory(main) {
  main.innerHTML = `<section class="page-heading"><div><h1>检测记录</h1><p>记录仅保存在当前浏览器，最多保留 30 条。图片不写入历史记录。</p></div><button class="button outlined" id="clear" ${state.history.length ? "" : "disabled"}>清空记录</button></section><section class="panel history-panel"><div class="panel-heading"><div><h2>记录列表</h2></div><span class="badge">${state.history.length} 条记录</span></div>${state.history.length ? `<div class="table-scroll"><table><thead><tr><th>图片名称</th><th>记录时间</th><th>检测方式</th><th>区域 / 阈值</th><th>报告</th></tr></thead><tbody>${state.history.map((record, i) => `<tr><td><strong>${escape(record.name)}</strong></td><td>${escape(new Date(record.date).toLocaleString("zh-CN"))}</td><td><span class="badge">${record.mode === "demo" ? "预设演示" : "YOLO 推理"}</span></td><td>${record.detections.length} 处 / ${Math.round(record.threshold * 100)}%</td><td><button class="text-button" data-export="${i}">${icon("download")} 导出</button></td></tr>`).join("")}</tbody></table></div>` : `<div class="history-empty">${icon("leaf")}<h2>暂无检测记录</h2><p>检测完成后点击“保存记录”，可在此查看和导出。</p><a class="button primary" href="#workspace">前往图像检测 ${icon("arrow")}</a></div>`}</section>`;
  document.querySelector("#clear").onclick = () => {
    if (!confirm("清空当前浏览器中的全部巡检记录？此操作无法撤销。")) return;
    try {
      localStorage.removeItem("fieldlens.history");
      state.history = [];
      render();
      toast("记录已清空");
    } catch {
      toast("无法访问浏览器存储");
    }
  };
  document
    .querySelectorAll("[data-export]")
    .forEach(
      (button) =>
        (button.onclick = () =>
          downloadReport(state.history[Number(button.dataset.export)])),
    );
}

function renderAbout(main) {
  main.innerHTML = `<section class="page-heading"><div><h1>项目说明</h1><p>功能说明、运行方式与开源许可。</p></div></section>
  <section class="panel about-panel"><div class="panel-heading"><h2>禾镜 FieldLens</h2><span class="badge">v1.0</span></div><div class="about-body"><p>作物图像检测工具，支持 YOLO 检测框展示、置信度筛选、检测记录和 JSON 导出。</p><dl class="description-list"><dt>界面</dt><dd>参考 Element UI 的后台界面风格，使用蓝色主操作、标准表单与结果列表。</dd><dt>在线演示</dt><dd>示例图片和标注均为预设数据。上传自己的图片可预览，真实识别需本地运行。</dd><dt>本地检测</dt><dd>启动 Python 服务并配置授权 YOLO 目标检测权重。支持的作物和病害类别取决于模型。</dd><dt>检测记录</dt><dd>最多保留 30 条，存储在当前浏览器中，不保存图片、不跨设备同步。</dd><dt>当前范围</dt><dd>单张图片检测。暂不包含视频、摄像头、账户管理和病害防治建议。</dd><dt>开源许可</dt><dd>AGPL-3.0-only。依赖和模型按各自许可使用；未打包参考项目授权不明的代码、数据和权重。</dd></dl><div class="about-links"><a class="button primary" href="https://github.com/GuHang2011/fieldlens" target="_blank" rel="noopener">查看源码</a><a class="button outlined" href="https://github.com/GuHang2011/fieldlens/blob/main/docs/DEPLOYMENT.md" target="_blank" rel="noopener">部署文档</a></div></div></section>`;
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
  state.view = ["workspace", "history", "about"].includes(
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
