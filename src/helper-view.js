import { assistantMarkup, attachAssistant } from "./assistant-view.js";
import {
  HELP_TOPICS,
  findHelp,
  localReview,
  localOverview,
} from "./helper-domain.js";
import { downloadBlob } from "./exports.js";

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

export function renderHelper(main, { getRecords, apiEnabled, scopeLabel }) {
  let alive = true,
    selectedId = "",
    snapshot = null,
    result = "",
    disposeAI = () => {};
  main.innerHTML = `<section class="page-heading"><div><h1>AI 助手</h1><p>查找操作说明，整理巡检记录；接入平台后可使用 AI 复核。</p></div><a class="button outlined" href="#guide">平台接入指南</a></section>
  <div class="helper-layout"><aside class="panel helper-context"><div class="panel-heading"><h2>当前记录</h2><span class="badge">${esc(scopeLabel)}</span></div><div class="helper-context-body"><label class="field-label" for="helper-record">选择已保存的记录</label><select id="helper-record"></select><p id="helper-record-meta" class="field-help"></p><button class="button outlined" id="helper-refresh">重新读取记录</button><p id="helper-snapshot-note" class="field-help" role="status"></p><a class="text-button" href="#history">查看与编辑记录 →</a><div class="helper-context-note"><strong>按记录快照整理</strong><p>不会自动修改原始检测或复核意见。更换记录、重新读取或离开本页会清除当前回答；需要保留时请先导出。</p></div></div></aside>
  <section class="panel helper-main"><div class="helper-tabs" role="tablist" aria-label="助手能力">${[
    ["help", "操作答疑"],
    ["records", "记录整理"],
    ["platform", "平台 AI"],
  ]
    .map(
      ([id, label]) =>
        `<button type="button" role="tab" id="helper-tab-${id}" data-helper-tab="${id}" aria-controls="helper-panel-${id}" aria-selected="${id === "help"}" tabindex="${id === "help" ? 0 : -1}">${label}</button>`,
    )
    .join("")}</div>
  <section class="helper-pane" role="tabpanel" id="helper-panel-help" aria-labelledby="helper-tab-help"><div class="helper-section-title"><h2>你想了解哪一步？</h2><span class="badge">内置帮助 · 无需联网</span></div><form id="helper-help-form"><label class="field-label" for="helper-query">输入操作问题</label><div class="helper-search"><input id="helper-query" type="search" maxlength="500" placeholder="例如：怎样拍照、导出报告、接入 DeepSeek"/><button class="button primary" type="submit">查找说明</button></div></form><div class="helper-quick" aria-label="常见问题">${HELP_TOPICS.map((topic) => `<button class="button outlined" type="button" data-help-topic="${topic.id}">${esc(topic.title)}</button>`).join("")}</div><p id="helper-help-status" class="field-help" role="status">按关键词查找内置说明，不调用语言模型。</p><div id="helper-help-results"></div></section>
  <section class="helper-pane" role="tabpanel" id="helper-panel-records" aria-labelledby="helper-tab-records" hidden><div class="helper-section-title"><h2>整理复核事项</h2><span class="badge">本地规则 · 未调用 AI</span></div><p class="field-help">根据已保存的字段与人工标记生成清单；概览按当前空间近 7 天的记录创建日期统计。</p><div class="helper-actions"><button class="button primary" id="helper-review">生成复核清单</button><button class="button outlined" id="helper-overview">生成巡检概览</button></div><p id="helper-local-empty" class="helper-empty">选择一条记录生成清单，或查看当前空间的巡检概览。</p><section id="helper-local-answer" hidden><p class="field-help" id="helper-local-time" role="status"></p><pre id="helper-local-text"></pre><div class="helper-actions"><button class="button outlined" id="helper-export">导出整理结果 TXT</button><button class="text-button" id="helper-clear">清除结果</button><a class="text-button" href="#history">前往记录处理 →</a></div></section></section>
  <section class="helper-pane" role="tabpanel" id="helper-panel-platform" aria-labelledby="helper-tab-platform" hidden><div class="helper-section-title"><h2>针对记录提问</h2><span class="badge">DeepSeek 等兼容平台</span></div><p class="field-help">先选择一条记录，检查服务端配置并核对文字预览。每次请求独立回答，不携带前次问答。</p>${!apiEnabled ? '<div class="helper-platform-note">公开演示未连接 AI 平台。可先体验「操作答疑」和「记录整理」；真实 AI 请求需要部署后端并配置自己的平台。<a href="#guide">查看接入步骤 →</a></div>' : ""}<div id="helper-platform-host"></div></section></section></div>`;
  const $ = (selector) => main.querySelector(selector);
  function clearResult() {
    result = "";
    $("#helper-local-text").textContent = "";
    $("#helper-local-answer").hidden = true;
    $("#helper-local-empty").hidden = false;
  }
  function chooseRecord() {
    disposeAI();
    selectedId = $("#helper-record").value;
    const record = getRecords().find((r) => r.id === selectedId);
    snapshot = record ? structuredClone(record) : null;
    clearResult();
    $("#helper-review").disabled = !snapshot;
    $("#helper-record-meta").textContent = snapshot
      ? `${snapshot.mode === "demo" ? "预设演示" : "模型输出"} · ${snapshot.detections.length} 个区域 · ${new Date(snapshot.date).toLocaleString("zh-CN")}`
      : "暂无可用记录。保存一次检测，或进入完整演示体验预置案例。";
    $("#helper-snapshot-note").textContent = snapshot
      ? `读取于 ${new Date().toLocaleTimeString("zh-CN")}。更换记录或重新读取会清除当前回答。`
      : "操作答疑和巡检概览仍可使用。";
    const host = $("#helper-platform-host");
    host.replaceChildren();
    if (!snapshot) {
      host.innerHTML =
        '<p class="helper-empty">选择一条已保存的记录后，可预览发送内容。<a href="#workspace">前往图像检测 →</a></p>';
      return;
    }
    host.innerHTML = assistantMarkup();
    host.querySelector(".assistant-panel").open = true;
    disposeAI = attachAssistant(host, () => snapshot, apiEnabled, {
      isOpen: () => alive,
    });
  }
  function refresh() {
    const records = getRecords();
    const select = $("#helper-record");
    select.replaceChildren(
      ...(records.length
        ? records.map(
            (record) =>
              new Option(
                `${record.mode === "demo" ? "演示" : "模型"} · ${record.name}`,
                record.id,
              ),
          )
        : [new Option("暂无记录", "")]),
    );
    select.disabled = !records.length;
    if (records.some((record) => record.id === selectedId))
      select.value = selectedId;
    chooseRecord();
  }
  $("#helper-record").onchange = chooseRecord;
  $("#helper-refresh").onclick = refresh;
  refresh();
  const tabs = [...main.querySelectorAll("[data-helper-tab]")];
  function selectTab(id, focus = false) {
    for (const tab of tabs) {
      const active = tab.dataset.helperTab === id;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      $(`#${tab.getAttribute("aria-controls")}`).hidden = !active;
      if (active && focus) tab.focus();
    }
  }
  tabs.forEach((tab, index) => {
    tab.onclick = () => selectTab(tab.dataset.helperTab);
    tab.onkeydown = (event) => {
      const next = {
        ArrowRight: (index + 1) % tabs.length,
        ArrowLeft: (index + tabs.length - 1) % tabs.length,
        Home: 0,
        End: tabs.length - 1,
      }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      selectTab(tabs[next].dataset.helperTab, true);
    };
  });
  function showHelp(topics) {
    $("#helper-help-status").textContent = topics.length
      ? `找到 ${topics.length} 条内置说明。`
      : "未找到匹配的操作说明。请换个关键词，或查看运行指南；本地帮助不提供自由问答。";
    $("#helper-help-results").innerHTML = topics
      .map(
        (topic) =>
          `<article class="helper-help-item"><h3>${esc(topic.title)}</h3><p>${esc(topic.text)}</p><a class="text-button" href="#${topic.route}">${esc(topic.action)} →</a></article>`,
      )
      .join("");
  }
  $("#helper-help-form").onsubmit = (event) => {
    event.preventDefault();
    showHelp(findHelp($("#helper-query").value));
  };
  main.querySelectorAll("[data-help-topic]").forEach(
    (button) =>
      (button.onclick = () => {
        const topic = HELP_TOPICS.find(
          (item) => item.id === button.dataset.helpTopic,
        );
        $("#helper-query").value = topic.title;
        showHelp([topic]);
      }),
  );
  function showResult(text) {
    const now = new Date().toLocaleString("zh-CN");
    result = `禾镜 · ${scopeLabel}\n生成时间：${now}\n\n${text}`;
    $("#helper-local-text").textContent = text;
    $("#helper-local-time").textContent =
      `生成于 ${now} · ${scopeLabel} · 仅在本页显示`;
    $("#helper-local-empty").hidden = true;
    $("#helper-local-answer").hidden = false;
  }
  $("#helper-review").onclick = () => showResult(localReview(snapshot));
  $("#helper-overview").onclick = () => showResult(localOverview(getRecords()));
  $("#helper-clear").onclick = clearResult;
  $("#helper-export").onclick = () => {
    if (result)
      downloadBlob(
        new Blob([result], { type: "text/plain;charset=utf-8" }),
        "fieldlens-local-checklist.txt",
      );
  };
  const changed = () => {
    $("#helper-snapshot-note").textContent =
      "记录已在其他页面更新。点击重新读取以获取最新内容，当前回答依据旧快照。";
  };
  window.addEventListener("fieldlens:records-changed", changed);
  return () => {
    alive = false;
    disposeAI();
    window.removeEventListener("fieldlens:records-changed", changed);
  };
}
