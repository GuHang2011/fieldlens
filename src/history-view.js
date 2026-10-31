import { filterRecords } from "./domain.js";
import { downloadCSV, downloadJSON } from "./exports.js";

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const when = (date) => new Date(date).toLocaleString("zh-CN");
const source = (r) => (r.mode === "demo" ? "预设演示" : "YOLO 推理");

export function renderHistoryPage(main, { getRecords, persist, toast }) {
  let query = "",
    mode = "all",
    review = "all",
    page = 1;
  const pageSize = 8;
  main.innerHTML = `<section class="page-heading"><div><h1>检测记录</h1><p>记录保存在当前浏览器，最多 30 条。图片不写入记录，建议及时导出备份。</p></div><button class="button outlined" id="export-records">导出筛选结果 CSV</button></section>
  <section class="record-stats" id="record-stats" aria-label="记录统计"></section>
  <section class="panel history-panel"><div class="history-filters"><label>搜索记录<input id="record-query" type="search" placeholder="图片名、类别或备注" maxlength="200"/></label><label>检测来源<select id="record-mode"><option value="all">全部来源</option><option value="model">YOLO 推理</option><option value="demo">预设演示</option></select></label><label>复核状态<select id="record-review"><option value="all">全部状态</option><option value="pending">待复核</option><option value="reviewed">已复核</option></select></label><button class="button outlined" id="reset-filters">重置筛选</button></div><p class="table-mobile-hint">左右滑动查看记录，右侧操作栏固定显示。</p><div id="records-table"></div><div class="pagination"><span id="records-total" role="status"></span><div><button class="button outlined" id="previous-page">上一页</button><span id="page-label"></span><button class="button outlined" id="next-page">下一页</button></div></div></section>
  <div class="history-tools"><button class="text-button danger" id="clear">清空全部记录</button><span>复核标记仅表示已查看，不代表病害确诊。</span></div>
  <dialog id="record-dialog" class="record-dialog" aria-labelledby="record-dialog-title"></dialog>`;
  const filtered = () => filterRecords(getRecords(), { query, mode, review });
  const dialog = main.querySelector("#record-dialog");
  let openerId;
  dialog.addEventListener("close", () => {
    [...main.querySelectorAll("[data-details]")]
      .find((button) => button.dataset.details === openerId)
      ?.focus();
  });
  function refresh() {
    const records = getRecords(),
      matches = filtered();
    const pages = Math.max(1, Math.ceil(matches.length / pageSize));
    page = Math.min(page, pages);
    main.querySelector("#record-stats").innerHTML = [
      ["全部记录", records.length],
      ["待复核", records.filter((r) => !r.reviewed).length],
      ["模型记录", records.filter((r) => r.mode === "model").length],
      ["演示记录", records.filter((r) => r.mode === "demo").length],
    ]
      .map(
        ([label, value]) =>
          `<div class="panel"><span>${label}</span><strong>${value}</strong></div>`,
      )
      .join("");
    main.querySelector("#records-table").innerHTML = matches.length
      ? `<div class="table-scroll" tabindex="0" role="region" aria-label="检测记录表格"><table><thead><tr><th>图片名称</th><th>记录时间</th><th>来源</th><th>区域 / 阈值</th><th>复核状态</th><th>操作</th></tr></thead><tbody>${matches
          .slice((page - 1) * pageSize, page * pageSize)
          .map(
            (r) =>
              `<tr><td><strong>${esc(r.name)}</strong>${r.notes ? `<small class="record-note" title="${esc(r.notes)}">${esc(r.notes)}</small>` : ""}</td><td>${esc(when(r.date))}</td><td><span class="badge">${source(r)}</span></td><td>${r.detections.length} / ${Math.round(r.threshold * 100)}%</td><td><span class="badge ${r.reviewed ? "success" : "warning"}">${r.reviewed ? "已复核" : "待复核"}</span></td><td class="record-actions"><button class="text-button" data-details="${esc(r.id)}">详情</button><button class="text-button" data-json="${esc(r.id)}">JSON</button><button class="text-button danger" data-delete="${esc(r.id)}" aria-label="删除 ${esc(r.name)}">删除</button></td></tr>`,
          )
          .join("")}</tbody></table></div>`
      : `<div class="history-empty"><h2>${records.length ? "没有匹配的记录" : "暂无检测记录"}</h2><p>${records.length ? "请修改搜索条件，或重置筛选。" : "完成示例或模型检测后，点击“保存记录”。"}</p>${records.length ? "" : '<a class="button primary" href="#workspace">前往图像检测</a>'}</div>`;
    main.querySelector("#records-total").textContent =
      `共 ${matches.length} 条 / 全部 ${records.length} 条`;
    main.querySelector("#page-label").textContent = `${page} / ${pages}`;
    main.querySelector("#previous-page").disabled = page <= 1;
    main.querySelector("#next-page").disabled = page >= pages;
    main.querySelector("#export-records").disabled = !matches.length;
    main.querySelector("#clear").disabled = !records.length;
    main
      .querySelectorAll("[data-json]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            downloadJSON(records.find((r) => r.id === b.dataset.json))),
      );
    main
      .querySelectorAll("[data-details]")
      .forEach((b) => (b.onclick = () => openDetails(b.dataset.details)));
    main.querySelectorAll("[data-delete]").forEach(
      (b) =>
        (b.onclick = () => {
          const record = records.find((r) => r.id === b.dataset.delete);
          if (!confirm(`删除“${record.name}”的记录？此操作无法撤销。`)) return;
          if (persist(getRecords().filter((r) => r.id !== record.id))) {
            refresh();
            toast("记录已删除");
          }
        }),
    );
  }
  function openDetails(id) {
    const r = getRecords().find((record) => record.id === id);
    if (!r) return;
    openerId = id;
    dialog.innerHTML = `<div class="panel-heading"><h2 id="record-dialog-title">记录详情</h2><button class="text-button" id="close-detail" aria-label="关闭记录详情">关闭</button></div><div class="dialog-body"><h3>${esc(r.name)}</h3><p class="detail-meta">${esc(when(r.date))} · ${source(r)} · 阈值 ${Math.round(r.threshold * 100)}%</p><p class="demo-note">${r.mode === "demo" ? "本记录使用预设演示标注，并非模型推理。" : "模型输出仅供筛查参考，需结合实际复核。"}${r.width ? ` 图片尺寸：${r.width} × ${r.height}。` : ""} 原图片未保存。</p><div class="table-scroll"><table><thead><tr><th>类别</th><th>置信度</th><th>归一化坐标</th></tr></thead><tbody>${r.detections.map((d) => `<tr><td>${esc(d.label)}</td><td>${(d.confidence * 100).toFixed(1)}%</td><td>${d.box.map((v) => v.toFixed(3)).join(", ")}</td></tr>`).join("") || '<tr><td colspan="3">该阈值下没有检测区域。</td></tr>'}</tbody></table></div><label class="dialog-label" for="record-notes">复核备注</label><textarea id="record-notes" maxlength="1000" rows="3" placeholder="例如采集地点、需要再次核查的区域">${esc(r.notes)}</textarea><label class="review-check"><input type="checkbox" id="record-reviewed" ${r.reviewed ? "checked" : ""}/> 已人工查看此记录</label></div><div class="results-footer"><button class="button outlined" id="detail-export">导出 JSON</button><button class="button primary" id="save-review">保存复核信息</button></div>`;
    dialog.querySelector("#close-detail").onclick = () => dialog.close();
    dialog.querySelector("#detail-export").onclick = () => downloadJSON(r);
    dialog.querySelector("#save-review").onclick = () => {
      const updated = {
        ...r,
        notes: dialog.querySelector("#record-notes").value.trim(),
        reviewed: dialog.querySelector("#record-reviewed").checked,
      };
      if (
        persist(
          getRecords().map((record) => (record.id === id ? updated : record)),
        )
      ) {
        dialog.close();
        refresh();
        toast("复核信息已保存");
      }
    };
    dialog.showModal();
  }
  main.querySelector("#record-query").oninput = (e) => {
    query = e.target.value;
    page = 1;
    refresh();
  };
  main.querySelector("#record-mode").onchange = (e) => {
    mode = e.target.value;
    page = 1;
    refresh();
  };
  main.querySelector("#record-review").onchange = (e) => {
    review = e.target.value;
    page = 1;
    refresh();
  };
  main.querySelector("#reset-filters").onclick = () => {
    query = "";
    mode = "all";
    review = "all";
    page = 1;
    main.querySelector("#record-query").value = "";
    main.querySelector("#record-mode").value = "all";
    main.querySelector("#record-review").value = "all";
    refresh();
  };
  main.querySelector("#previous-page").onclick = () => {
    page--;
    refresh();
  };
  main.querySelector("#next-page").onclick = () => {
    page++;
    refresh();
  };
  main.querySelector("#export-records").onclick = () => downloadCSV(filtered());
  main.querySelector("#clear").onclick = () => {
    if (
      confirm("清空此浏览器的全部检测记录？建议先导出 CSV 备份。") &&
      persist([])
    ) {
      refresh();
      toast("记录已清空");
    }
  };
  refresh();
}
