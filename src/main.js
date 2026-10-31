import "./style.css";
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
  mode: "demo",
  threshold: 0.5,
  boxes: true,
  detections: [...DEMO_DETECTIONS],
  file: null,
  image: "./specimen.svg",
  name: "叶片标本 · 交互示例",
  history: initialHistory(),
  busy: false,
  status: "checking",
  model: "",
  error: "",
  completed: true,
  selected: -1,
};
let objectUrl;
const app = document.querySelector("#app");

function shell() {
  app.innerHTML = `<aside class="sidebar">
    <a class="brand" href="#workspace" aria-label="禾镜首页"><img src="./favicon.svg" alt=""/><span>禾镜 <b>FieldLens</b><small>作物视觉巡检工作台</small></span></a>
    <div class="nav-caption">WORKSPACE / 工作空间</div>
    <nav aria-label="主导航">
      <button data-view="workspace">${icon("scan")}<span>图像检测</span><small>01</small></button>
      <button data-view="history">${icon("history")}<span>巡检记录</span><small>02</small></button>
      <button data-view="about">${icon("info")}<span>关于禾镜</span><small>03</small></button>
    </nav>
    <div class="sidebar-note"><span class="mini-leaf">${icon("leaf")}</span><h3>从一片叶子，<br/>读懂田间变化。</h3><p>把视觉线索转化为<br/>可追溯的巡检记录。</p><span class="line-art"></span></div>
    <a class="source-link" href="https://github.com/GuHang2011/fieldlens" target="_blank" rel="noopener">开源项目 ${icon("arrow")}</a>
    <div class="sidebar-footer"><span class="status-dot"></span> FIELDLENS <span>v1.0</span></div>
  </aside>
  <div class="main-shell"><header class="topbar"><div>农业视觉实验室 <span>/</span> <strong id="breadcrumb">图像检测</strong></div><div class="top-right"><span class="local-badge">本地优先</span><span class="avatar">禾</span></div></header><main id="main"></main><footer class="page-footer"><span>FIELDLENS · 让田间观察，有迹可循</span><span>观察 / 识别 / 记录</span></footer></div>
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
    history: "巡检记录",
    about: "关于禾镜",
  }[state.view];
  const main = document.querySelector("#main");
  if (state.view === "workspace") renderWorkspace(main);
  else if (state.view === "history") renderHistory(main);
  else renderAbout(main);
}

function renderWorkspace(main) {
  main.innerHTML = `<section class="page-heading"><div><div class="eyebrow"><span></span> A CLOSER LOOK AT YOUR CROPS</div><h1>看见每一片叶子的<span>信号。</span></h1><p>从图像到线索，让作物巡检更直观、更有据可循。</p></div><button class="button outlined" id="sample-top" ${state.busy ? "disabled" : ""}>${icon("leaf")} 体验示例</button></section>
  <section class="workflow" aria-label="巡检流程"><div class="current"><b>01</b><span>选择图像<small>捕捉田间细节</small></span></div><span class="step-line"></span><div><b>02</b><span>视觉识别<small>发现潜在线索</small></span></div><span class="step-line"></span><div><b>03</b><span>复核与记录<small>留存观察依据</small></span></div><span class="workflow-note">每一次观察，都是生长的注脚 ${icon("leaf")}</span></section>
  <div class="workspace-grid"><section class="panel image-panel"><div class="panel-heading"><div><span class="section-index">A</span><h2>图像工作区</h2><span id="mode-badge" class="badge">${state.mode === "demo" ? "演示样本" : "本地图像"}</span></div><label class="box-switch"><input type="checkbox" id="show-boxes" ${state.boxes ? "checked" : ""}/> 显示标注</label></div>
  <div class="image-stage" id="dropzone"><div class="image-wrap"><img id="specimen" src="${escape(state.image)}" alt="${escape(state.name)}"/><svg id="box-layer" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-label="检测区域标注"></svg></div><div class="image-corner"><span class="status-dot"></span><span>${state.mode === "demo" ? "原创合成插画 / 非真实推理" : "图片仅在开始检测时发送至本地服务"}</span></div><div class="scan-line" ${state.busy ? "" : "hidden"}></div></div>
  <div class="image-toolbar"><div>${icon("leaf")}<span id="file-name">${escape(state.name)}</span></div><span>拖放图片即可替换</span></div>
  <div class="upload-area"><div class="upload-icon">${icon("upload")}</div><div><strong>带一片叶子，开启一次观察</strong><p>JPG / PNG / WebP · 最大 10 MB · 支持拖放</p></div><button class="button outlined" id="upload" ${state.busy ? "disabled" : ""}>选择图片 ${icon("arrow")}</button><input id="file-input" type="file" accept="image/jpeg,image/png,image/webp" hidden/></div>
  <div class="demo-note">${icon("info")}<span>${state.mode === "demo" ? "当前为演示模式：标注为预设数据，用于体验操作流程，不代表模型识别效果。" : "真实检测需要启动本地 YOLO 服务并配置经授权的作物模型。"}</span></div></section>
  <aside class="inspector"><section class="panel settings"><div class="panel-heading"><div><span class="section-index">B</span><h2>检测设置</h2></div>${icon("target")}</div><div class="settings-body"><label class="field-label" for="mode">检测方式 <span>INFERENCE</span></label><select id="mode" ${state.busy ? "disabled" : ""}><option value="demo" ${state.mode === "demo" ? "selected" : ""}>交互演示 · 预设标注</option><option value="model" ${state.mode === "model" ? "selected" : ""}>YOLO · 本地模型推理</option></select><div class="connection ${state.status === "ready" ? "connected" : ""}"><span class="status-dot"></span><span>${serviceLabel()}</span><button id="refresh-status" aria-label="重新检查服务" title="重新检查服务">↻</button></div>
  <div class="range-heading"><label for="threshold">置信度阈值</label><output id="threshold-output">${Math.round(state.threshold * 100)}%</output></div><input id="threshold" type="range" min="10" max="99" value="${Math.round(state.threshold * 100)}" ${state.busy ? "disabled" : ""}/><div class="range-labels"><span>更多线索</span><span>更高置信度</span></div><p class="field-help">仅展示达到阈值的区域；真实模型模式调整后需重新检测。</p><button class="button primary" id="detect" ${state.busy ? "disabled" : ""}>${icon("scan")} ${state.busy ? "正在检测…" : state.mode === "demo" ? "运行示例检测" : "开始 YOLO 检测"} ${icon("arrow")}</button><p class="error" id="error" role="alert" ${state.error ? "" : "hidden"}>${escape(state.error)}</p></div></section>
  <section class="panel results"><div class="panel-heading"><div><span class="section-index">C</span><h2>识别结果</h2></div><span class="badge" id="result-count"></span></div><div id="results-body"></div><div class="results-footer"><button id="export" class="text-button">${icon("download")} 导出 JSON</button><button id="save" class="text-button">保存记录 ${icon("arrow")}</button></div></section></aside></div>
  <section class="bottom-note"><div class="note-number">田间手记 <span>FIELD NOTES</span></div><p>图像里的一处斑点，是进一步观察的起点。<br/><strong>结合叶背、环境与生长阶段，做出更完整的判断。</strong></p><span>辅助筛查 · 人工复核</span></section>`;
  document.querySelector("#sample-top").onclick = useSample;
  document.querySelector("#upload").onclick = () =>
    document.querySelector("#file-input").click();
  document.querySelector("#file-input").onchange = (event) =>
    acceptFile(event.target.files[0]);
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
  document.querySelector("#threshold").oninput = (event) => {
    state.threshold = Number(event.target.value) / 100;
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
  specimen.onload = fitImage;
  if (specimen.complete) fitImage();
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
  if (!apiEnabled) return "线上展示 · 下载后启用 YOLO";
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
  document.querySelector("#box-layer").innerHTML = !state.boxes
    ? ""
    : items
        .map((item, i) => {
          const [x1, y1, x2, y2] = item.box.map((v) => v * 1000);
          return `<g class="detection-box ${state.selected === i ? "selected" : ""}"><rect x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}"/><text x="${x1 + 9}" y="${Math.max(24, y1 - 12)}">${i + 1} / ${Math.round(item.confidence * 100)}%</text></g>`;
        })
        .join("");
  document.querySelector("#results-body").innerHTML = items.length
    ? `<div class="result-summary"><strong>${items.length.toString().padStart(2, "0")}</strong><div>处可关注区域<span>${state.mode === "demo" ? "预设示例 · 供交互展示" : "模型输出 · 待人工复核"}</span></div><span class="summary-icon">${icon("leaf")}</span></div><div class="result-list">${items.map((item, i) => `<button class="result-row ${state.selected === i ? "selected" : ""}" data-result="${i}"><span class="result-number">${String(i + 1).padStart(2, "0")}</span><span class="result-label">${escape(item.label)}<span class="confidence-track"><i style="width:${item.confidence * 100}%"></i></span></span><strong>${(item.confidence * 100).toFixed(1)}<small>%</small></strong></button>`).join("")}</div>`
    : `<div class="empty-results">${icon("scan")}<strong>${state.completed ? "当前阈值下未检出区域" : "等待一次新的观察"}</strong><p>${state.completed ? "未检出不等于健康，请结合实际复核。" : "选择图片并开始检测，结果将在这里展示。"}</p></div>`;
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
    name: "叶片标本 · 交互示例",
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
  main.innerHTML = `<section class="page-heading"><div><div class="eyebrow"><span></span> YOUR FIELD JOURNAL</div><h1>每一次观察，<span>都有迹可循。</span></h1><p>记录仅保存在当前浏览器，最多保留 30 条。图片不写入历史记录。</p></div><button class="button outlined" id="clear" ${state.history.length ? "" : "disabled"}>清空记录</button></section><section class="panel history-panel"><div class="panel-heading"><div><span class="section-index">H</span><h2>巡检档案</h2></div><span class="badge">${state.history.length} 条记录</span></div>${state.history.length ? `<div class="table-scroll"><table><thead><tr><th>观察对象</th><th>记录时间</th><th>检测方式</th><th>区域 / 阈值</th><th>报告</th></tr></thead><tbody>${state.history.map((record, i) => `<tr><td><strong>${escape(record.name)}</strong></td><td>${escape(new Date(record.date).toLocaleString("zh-CN"))}</td><td><span class="badge">${record.mode === "demo" ? "预设演示" : "YOLO 推理"}</span></td><td>${record.detections.length} 处 / ${Math.round(record.threshold * 100)}%</td><td><button class="text-button" data-export="${i}">${icon("download")} 导出</button></td></tr>`).join("")}</tbody></table></div>` : `<div class="history-empty">${icon("leaf")}<h2>第一份田间记录，从这里开始。</h2><p>完成一次检测后，点击「保存记录」，建立你的巡检档案。</p><a class="button primary" href="#workspace">前往图像检测 ${icon("arrow")}</a></div>`}</section>`;
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
  main.innerHTML = `<section class="about-hero"><div class="eyebrow"><span></span> FIELDLENS / OPEN SOURCE FIELD LAB</div><h1>让田间的细微信号，<br/>成为看得见的<span>依据。</span></h1><p>禾镜 FieldLens 是一个面向作物图像观察的开源视觉工作台。<br/>将图像、检测区域与巡检记录放在同一张工作台上，<br/>帮助使用者完成「观察 — 识别 — 复核」的完整流程。</p><a class="button primary" href="#workspace">开始一次观察 ${icon("arrow")}</a><img src="./favicon.svg" alt="禾镜标志"/></section><div class="about-grid"><article class="panel about-card"><span class="section-index">01 / EXPERIENCE</span><h2>围绕田间观察重新设计</h2><p>原创视觉品牌、植物标本插画和响应式界面。检测框与结果列表联动，阈值筛选、JSON 报告和浏览器本地记录，让结果更易复核。</p></article><article class="panel about-card"><span class="section-index">02 / INFERENCE</span><h2>从交互示例，到真实 YOLO</h2><p>无需模型即可体验明确标注的演示流程。启动 Python 服务并配置授权模型后，可对上传图片执行真实 YOLO 目标检测。识别类别取决于模型训练数据。</p></article><article class="panel about-card"><span class="section-index">03 / OPEN SOURCE</span><h2>公开来源，保留边界</h2><p>参考作物检测项目的业务场景，独立实现本展示版。未打包参考项目的业务代码、图片、数据和权重。源代码采用 AGPL-3.0-only；依赖及模型须遵循各自许可。</p><a href="https://github.com/GuHang2011/fieldlens" target="_blank" rel="noopener" class="text-button">查看源码与项目说明 ${icon("arrow")}</a></article></div><section class="bottom-note"><div class="note-number">使用边界</div><p>这里展示的是辅助筛查工具。演示标注不代表模型能力；真实推理结果也需要人工复核。<br/>当前版本支持单张图片检测，视频、摄像头与病害防治建议未纳入本版本。</p></section>`;
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
