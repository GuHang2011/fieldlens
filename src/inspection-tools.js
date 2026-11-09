import { escapeHTML as esc } from "./record-fields.js";
import {
  REVIEW_LABELS,
  regionKeys,
  reviewCounts,
  comparisonWarnings,
} from "./review-domain.js";
import { taskLabel } from "./domain.js";

const when = (value) =>
  value ? new Date(value).toLocaleString("zh-CN") : "未填写";
const source = (r) =>
  r.mode === "demo" ? "预设演示（非模型推理）" : "模型推理";

export function regionDiagram(record) {
  return `<figure class="region-map"><svg viewBox="0 0 1000 650" role="img" aria-label="检测区域位置示意，非原图">${record.detections.map((d, i) => `<rect x="${d.box[0] * 1000}" y="${d.box[1] * 650}" width="${(d.box[2] - d.box[0]) * 1000}" height="${(d.box[3] - d.box[1]) * 650}"/><text x="${d.box[0] * 1000 + 6}" y="${d.box[1] * 650 + 26}">${i + 1}</text>`).join("")}</svg><figcaption>位置示意 · 非原图 · 共 ${record.detections.length} 个原始区域</figcaption></figure>`;
}

export function regionEditor(record) {
  const keys = regionKeys(record.detections);
  return `<section class="region-review"><h3>逐区域复核</h3><p class="field-help">原始类别、置信度和坐标保留。人工“保留”仅表示认可该检测区域，不代表确诊。</p><div class="region-layout">${regionDiagram(record)}<div class="table-scroll"><table><thead><tr><th>区域 / 类别</th><th>置信度 / 坐标</th><th>人工意见</th></tr></thead><tbody>${
    record.detections
      .map((d, i) => {
        const review = record.regionReviews?.find((r) => r.key === keys[i]);
        return `<tr><td data-label="区域 / 类别">#${i + 1} ${esc(d.label)}</td><td data-label="置信度 / 坐标">${(d.confidence * 100).toFixed(1)}%<small class="record-note">${d.box.map((v) => v.toFixed(3)).join(", ")}</small></td><td data-label="人工意见"><select data-region-status="${i}" aria-label="区域 ${i + 1} 复核状态">${Object.entries(
          REVIEW_LABELS,
        )
          .map(
            ([key, label]) =>
              `<option value="${key}" ${key === (review?.status || "pending") ? "selected" : ""}>${label}</option>`,
          )
          .join(
            "",
          )}</select><input data-region-note="${i}" aria-label="区域 ${i + 1} 复核说明" maxlength="300" placeholder="复核说明（可选）" value="${esc(review?.note || "")}"/></td></tr>`;
      })
      .join("") ||
    '<tr><td colspan="3">该阈值下没有检测区域，可在下方填写整图复核备注或安排补拍。</td></tr>'
  }</tbody></table></div></div></section>`;
}

export function readRegionReviews(root, record) {
  return regionKeys(record.detections).flatMap((key, i) => {
    const status = root.querySelector(`[data-region-status="${i}"]`).value;
    const note = root.querySelector(`[data-region-note="${i}"]`).value.trim();
    return status === "pending" && !note ? [] : [{ key, status, note }];
  });
}

function summary(record) {
  const c = reviewCounts(record);
  return `<dl class="inspection-meta">${[
    ["来源", source(record)],
    ["采集时间", when(record.sample?.collectedAt)],
    ["检测时间", when(record.date)],
    ["样本编号", record.sample?.code || "未填写"],
    [
      "作物 / 地块",
      [record.sample?.crop, record.sample?.plot].filter(Boolean).join(" / ") ||
        "未填写",
    ],
    ["批次", record.sample?.batch || "未填写"],
    ["模型", record.model || "未记录"],
    ["阈值", `${Math.round(record.threshold * 100)}%`],
    ["区域复核", `待确认 ${c.pending} · 保留 ${c.keep} · 疑似误检 ${c.reject}`],
    ["复查", `${taskLabel(record.followUp)} ${record.followUp?.dueDate || ""}`],
    ["备注", record.notes || "无"],
  ]
    .map(([label, value]) => `<dt>${label}</dt><dd>${esc(value)}</dd>`)
    .join("")}</dl>`;
}

function makeDialog(title, className = "") {
  const dialog = document.createElement("dialog");
  dialog.className = `record-dialog inspection-dialog ${className}`;
  dialog.setAttribute("aria-label", title);
  dialog.innerHTML = `<div class="panel-heading"><h2>${title}</h2><button class="text-button" data-close>关闭</button></div><div class="dialog-body"></div>`;
  const opener = document.activeElement;
  dialog.querySelector("[data-close]").onclick = () => dialog.close();
  dialog.addEventListener(
    "close",
    () => {
      dialog.remove();
      if (opener?.isConnected) opener.focus();
    },
    { once: true },
  );
  document.body.append(dialog);
  return dialog;
}

export function openComparison(records) {
  if (records.length < 2) return;
  const dialog = makeDialog("两次记录对比");
  const body = dialog.querySelector(".dialog-body");
  body.innerHTML = `<p class="field-help">请选择同一样本的两次记录。这里只对照检测数据，不按区域数量推算病情变化。原图未保存。</p><div class="compare-selectors">${["a", "b"].map((key, i) => `<label>记录 ${i + 1}<select id="compare-${key}">${records.map((r, j) => `<option value="${esc(r.id)}" ${i === j ? "selected" : ""}>${esc(r.sample?.code || r.name)} · ${esc(when(r.date))}</option>`).join("")}</select></label>`).join("")}</div><div id="compare-content" aria-live="polite"></div>`;
  function refresh() {
    const a = records.find(
      (r) => r.id === body.querySelector("#compare-a").value,
    );
    const b = records.find(
      (r) => r.id === body.querySelector("#compare-b").value,
    );
    const out = body.querySelector("#compare-content");
    if (a.id === b.id) {
      out.innerHTML = '<p class="error">请选择两条不同的记录。</p>';
      return;
    }
    const warnings = comparisonWarnings(a, b);
    const labels = [
      ...new Set([...a.detections, ...b.detections].map((d) => d.label)),
    ];
    out.innerHTML = `${warnings.length ? `<div class="demo-note"><ul>${warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>` : ""}<div class="compare-columns">${[a, b].map((r, i) => `<section><h3>记录 ${i + 1} · ${esc(r.name)}</h3>${regionDiagram(r)}${summary(r)}</section>`).join("")}</div><h3>原始区域数量</h3><div class="table-scroll"><table><thead><tr><th>类别</th><th>记录 1</th><th>记录 2</th></tr></thead><tbody>${labels.map((label) => `<tr><td>${esc(label)}</td><td>${a.detections.filter((d) => d.label === label).length}</td><td>${b.detections.filter((d) => d.label === label).length}</td></tr>`).join("") || '<tr><td colspan="3">两条记录均无检测区域，不能据此判断作物健康。</td></tr>'}</tbody></table></div>`;
  }
  body.querySelectorAll("select").forEach((el) => (el.onchange = refresh));
  refresh();
  dialog.showModal();
}

export function reportHTML(records) {
  const groups = [
    ["model", "模型检测记录"],
    ["demo", "预设演示记录（非模型推理）"],
  ];
  return `<p>本次选定 ${records.length} 条 · 已人工查看 ${records.filter((r) => r.reviewed).length} 条 · 待复查 ${records.filter((r) => r.followUp?.status === "pending").length} 条</p><p>报告保留原始检测及人工意见，不构成病害确诊。未保存原图；位置示意不能替代图片。</p>${groups
    .map(([mode, title]) => {
      const items = records.filter((r) => r.mode === mode);
      return items.length
        ? `<section class="report-group"><h2>${title} · ${items.length} 条</h2>${items
            .map((r) => {
              const keys = regionKeys(r.detections);
              return `<article class="report-record"><h3>${esc(r.sample?.code || r.name)} · ${esc(r.name)}</h3>${summary(r)}<p>已人工查看：${r.reviewed ? "是" : "否"} · 复查原因：${esc(r.followUp?.reason || "未安排")} · 处理说明：${esc(r.followUp?.note || "无")}</p><table><thead><tr><th>区域 / 类别</th><th>置信度</th><th>坐标</th><th>人工意见 / 说明</th></tr></thead><tbody>${
                r.detections
                  .map((d, i) => {
                    const review = r.regionReviews?.find(
                      (v) => v.key === keys[i],
                    );
                    return `<tr><td>#${i + 1} ${esc(d.label)}</td><td>${(d.confidence * 100).toFixed(1)}%</td><td>${d.box.map((v) => v.toFixed(3)).join(", ")}</td><td>${REVIEW_LABELS[review?.status || "pending"]}<br/>${esc(review?.note || "")}</td></tr>`;
                  })
                  .join("") ||
                '<tr><td colspan="4">该阈值下未检出区域，不能据此判断作物健康。</td></tr>'
              }</tbody></table></article>`;
            })
            .join("")}</section>`
        : "";
    })
    .join("")}`;
}

export function openReport(records, { selected = false } = {}) {
  if (!records.length) return;
  const dialog = makeDialog("巡检报告预览", "report-dialog");
  dialog.querySelector(".dialog-body").innerHTML =
    `<div class="report-controls"><label>学院 / 课程 / 单位（可选）<input id="report-institution" maxlength="100" placeholder="填写后显示在报告中"/></label><button class="button primary" id="print-report">打印 / 另存为 PDF</button><p class="field-help">${selected ? `报告仅使用已勾选的 ${records.length} 条记录。` : `报告使用当前筛选的全部 ${records.length} 条记录，包含其他分页。`}打印设置中可关闭浏览器页眉页脚。</p></div><div class="report-paper"><h1>禾镜 · 巡检报告</h1><p id="report-heading" hidden></p><p>生成时间：${esc(when(new Date().toISOString()))}</p>${reportHTML(records)}</div>`;
  dialog.querySelector("#report-institution").oninput = (e) => {
    const heading = dialog.querySelector("#report-heading");
    heading.textContent = e.target.value.trim();
    heading.hidden = !heading.textContent;
  };
  dialog.querySelector("#print-report").onclick = () => window.print();
  dialog.showModal();
}
