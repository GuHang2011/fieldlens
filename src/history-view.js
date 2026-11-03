import { attachDetailTabs } from "./detail-tabs.js";
import {
  regionEditor,
  readRegionReviews,
  openComparison,
  openReport,
} from "./inspection-tools.js";
import { assistantMarkup, attachAssistant } from "./assistant-view.js";
import { attachBackup } from "./backup-view.js";
import {
  sampleFields,
  readSample,
  followUpFields,
  readFollowUp,
} from "./record-fields.js";
import { filterRecords, matchesTask, taskLabel, localDay } from "./domain.js";
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

export function renderHistoryPage(
  main,
  { getRecords, persist, toast, initialTask = "all", apiEnabled = false },
) {
  let query = "",
    mode = "all",
    review = "all",
    page = 1;
  let extra = {
    plot: "",
    batch: "",
    from: "",
    to: "",
    task: [
      "all",
      "pending",
      "today",
      "overdue",
      "done",
      "cancelled",
      "none",
    ].includes(initialTask)
      ? initialTask
      : "all",
  };
  const pageSize = 8;
  main.innerHTML = `<section class="page-heading"><div><h1>检测记录</h1><p>查找样本、复核检测结果，安排后续巡检。</p></div><div class="page-actions"><button class="button outlined" id="compare-records">两次记录对比</button><button class="button primary" id="report-records">生成巡检报告</button></div></section>
  <section class="record-stats" id="record-stats" aria-label="记录统计"></section>
  <section class="panel history-panel"><div class="history-section-heading"><h2>记录列表</h2><div class="record-toolbar"><span id="backup-tools"></span><button class="button outlined" id="export-records">导出筛选结果 CSV</button></div></div><div class="task-shortcuts" aria-label="复查快捷筛选"><button class="button outlined" data-task="all">全部记录</button><button class="button outlined" data-task="pending">待复查</button><button class="button outlined" data-task="today">今日待办</button><button class="button outlined" data-task="overdue">已逾期</button><span id="task-overview"></span></div><div class="history-filters"><label>搜索记录<input id="record-query" type="search" placeholder="编号、地块、批次、图片或备注" maxlength="200"/></label><label>检测来源<select id="record-mode"><option value="all">全部来源</option><option value="model">YOLO 推理</option><option value="demo">预设演示</option></select></label><label>复核状态<select id="record-review"><option value="all">全部状态</option><option value="pending">待复核</option><option value="reviewed">已复核</option></select></label><button class="button outlined" id="reset-filters">重置筛选</button></div><details class="advanced-filters"><summary>更多筛选 <span>地块、批次、采集日期与复查状态</span></summary><div class="history-filters"><label>地块<select id="filter-plot"></select></label><label>巡检批次<select id="filter-batch"></select></label><label>采集日期起<input id="filter-from" type="date"/></label><label>采集日期止<input id="filter-to" type="date"/></label><label>复查任务<select id="filter-task"><option value="all">全部任务状态</option><option value="pending">待复查</option><option value="today">今日待办</option><option value="overdue">已逾期</option><option value="done">已完成</option><option value="cancelled">已取消</option><option value="none">未安排</option></select></label></div><p class="field-help">未填写采集时间的旧记录按检测日期筛选。日期按本机时区计算。</p></details><p id="filter-error" class="error" hidden>开始日期不能晚于结束日期，请调整筛选。</p><p class="table-mobile-hint">左右滑动查看记录，右侧操作栏固定显示。</p><div id="records-table"></div><div class="pagination"><span id="records-total" role="status"></span><div><button class="button outlined" id="previous-page">上一页</button><span id="page-label"></span><button class="button outlined" id="next-page">下一页</button></div></div></section>
  <p class="storage-note">本机保存 · 最多 30 条 · 满额停止新增。备份不含原图；对比、报告与 CSV 使用全部筛选结果。</p><div class="history-tools"><button class="text-button danger" id="clear">清空全部记录</button><span>复核标记仅表示已查看，不代表病害确诊。</span></div>
  <dialog id="record-dialog" class="record-dialog inspection-dialog" aria-labelledby="record-dialog-title"></dialog>`;
  const filtered = () =>
    filterRecords(getRecords(), { query, mode, review, ...extra });
  const dialog = main.querySelector("#record-dialog");
  let openerId;
  dialog.addEventListener("close", () => {
    [...main.querySelectorAll("[data-details]")]
      .find((button) => button.dataset.details === openerId)
      ?.focus();
  });
  function refresh() {
    const invalidRange = extra.from && extra.to && extra.from > extra.to;
    main.querySelector("#filter-error").hidden = !invalidRange;
    for (const key of ["plot", "batch"]) {
      const select = main.querySelector("#filter-" + key);
      const values = [
        ...new Set(
          [...getRecords().map((r) => r.sample?.[key]), extra[key]].filter(
            Boolean,
          ),
        ),
      ];
      select.innerHTML =
        '<option value="">全部</option>' +
        values
          .map((v) => `<option value="${esc(v)}">${esc(v)}</option>`)
          .join("");
      select.value = extra[key];
    }
    main.querySelector("#filter-task").value = extra.task;
    main
      .querySelectorAll("[data-task]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.task === extra.task)),
      );
    const tasks = getRecords().filter((r) =>
      matchesTask(r.followUp, "pending"),
    ).length;
    const overdue = getRecords().filter((r) =>
      matchesTask(r.followUp, "overdue"),
    ).length;
    main.querySelector("#task-overview").textContent =
      `待复查 ${tasks} 条 · 已逾期 ${overdue} 条`;
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
      ? `<div class="table-scroll" tabindex="0" role="region" aria-label="检测记录表格"><table><thead><tr><th>样本 / 图片</th><th>记录时间</th><th>来源</th><th>区域 / 阈值</th><th>复核 / 复查</th><th>操作</th></tr></thead><tbody>${matches
          .slice((page - 1) * pageSize, page * pageSize)
          .map(
            (r) =>
              `<tr><td><strong>${esc(r.sample?.code || r.name)}</strong><small class="record-note">${esc([r.sample?.code ? r.name : "", r.sample?.plot, r.sample?.batch].filter(Boolean).join(" · "))}</small>${r.notes ? `<small class="record-note" title="${esc(r.notes)}">${esc(r.notes)}</small>` : ""}</td><td data-label="记录时间">${esc(when(r.date))}</td><td data-label="来源"><span class="badge">${source(r)}</span></td><td data-label="区域 / 阈值">${r.detections.length} / ${Math.round(r.threshold * 100)}%</td><td data-label="复核 / 复查"><span class="badge ${r.reviewed ? "success" : "warning"}">${r.reviewed ? "已复核" : "待复核"}</span>${r.followUp ? `<small class="record-note">${taskLabel(r.followUp)}${r.followUp.dueDate ? ` · ${esc(r.followUp.dueDate)}` : ""}</small>` : ""}</td><td class="record-actions"><button class="text-button" data-details="${esc(r.id)}">详情</button><button class="text-button" data-json="${esc(r.id)}">JSON</button><button class="text-button danger" data-delete="${esc(r.id)}" aria-label="删除 ${esc(r.name)}">删除</button></td></tr>`,
          )
          .join("")}</tbody></table></div>`
      : `<div class="history-empty"><h2>${records.length ? "没有匹配的记录" : "暂无检测记录"}</h2><p>${records.length ? "请修改搜索条件，或重置筛选。" : "完成示例或模型检测后，点击“保存记录”。"}</p>${records.length ? "" : '<a class="button primary" href="#workspace">前往图像检测</a>'}</div>`;
    main.querySelector("#records-total").textContent =
      `共 ${matches.length} 条 / 全部 ${records.length} 条`;
    main.querySelector("#page-label").textContent = `${page} / ${pages}`;
    main.querySelector("#previous-page").disabled = page <= 1;
    main.querySelector("#next-page").disabled = page >= pages;
    main.querySelector("#export-records").disabled = !matches.length;
    main.querySelector("#report-records").disabled = !matches.length;
    main.querySelector("#compare-records").disabled = matches.length < 2;
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
          const linked = getRecords().filter(
            (r) => r.followUp?.linkedRecordId === record.id,
          ).length;
          if (
            !confirm(
              `删除“${record.name}”的记录？${record.followUp ? "该记录的复查安排也会删除。" : ""}${linked ? `另有 ${linked} 条复查安排关联此记录，关联 ID 会保留并显示记录缺失。` : ""}此操作无法撤销。`,
            )
          )
            return;
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
    dialog.innerHTML = `<div class="panel-heading"><div><h2 id="record-dialog-title">记录详情</h2><span class="badge">${source(r)}</span></div><button class="button outlined" id="close-detail" aria-label="关闭记录详情">关闭</button></div>
    <div class="detail-identity"><h3>${esc(r.sample?.code || r.name)}</h3><p>${esc(r.name)} · ${esc(when(r.date))} · 阈值 ${Math.round(r.threshold * 100)}%</p></div>
    <div class="detail-tabs" role="tablist" aria-label="记录详情分区">${[
      ["review", "区域复核"],
      ["sample", "样本信息"],
      ["followup", "复查安排"],
      ["ai", "AI 辅助"],
    ]
      .map(
        ([key, label]) =>
          `<button role="tab" id="detail-tab-${key}" data-detail-tab="${key}" aria-controls="detail-panel-${key}" aria-selected="false" tabindex="-1">${label}</button>`,
      )
      .join("")}</div>
    <div class="dialog-body detail-scroll"><section role="tabpanel" id="detail-panel-review" aria-labelledby="detail-tab-review"><p class="demo-note">${r.mode === "demo" ? "预设演示标注，并非模型推理。" : "模型输出仅供筛查参考，需结合实际复核。"}${r.width ? ` ${r.width} × ${r.height} 像素。` : ""} 原图未保存，以下为区域位置示意。</p>${regionEditor(r)}<label class="dialog-label" for="record-notes">整图复核备注</label><textarea id="record-notes" maxlength="1000" rows="3" placeholder="补充需要核查的问题或采集说明">${esc(r.notes)}</textarea><label class="review-check"><input type="checkbox" id="record-reviewed" ${r.reviewed ? "checked" : ""}/> 已人工查看此记录</label></section>
    <section role="tabpanel" id="detail-panel-sample" aria-labelledby="detail-tab-sample" hidden><h3>样本信息</h3><p class="field-help">补充编号、地块和巡检批次，便于后续查找与对比。</p>${sampleFields(r.sample, "detail", getRecords())}</section>
    <section role="tabpanel" id="detail-panel-followup" aria-labelledby="detail-tab-followup" hidden><h3>复查安排</h3><p class="field-help">安排补拍或再次观察，记录处理进度与关联结果。</p>${followUpFields(r.followUp, getRecords(), r.id)}</section>
    <section role="tabpanel" id="detail-panel-ai" aria-labelledby="detail-tab-ai" hidden>${assistantMarkup()}</section></div><div class="detail-footer"><p class="error" id="detail-error" role="alert" hidden></p><div class="results-footer"><span class="detail-save-state" role="status">修改后请保存复核信息</span><button class="button outlined" id="detail-export">导出 JSON</button><button class="button primary" id="save-review">保存复核信息</button></div></div>`;
    const selectTab = attachDetailTabs(dialog);

    const currentDraft = () => ({
      ...r,
      sample: readSample(dialog, r.sample),
      followUp: readFollowUp(dialog),
      regionReviews: readRegionReviews(dialog, r),
      notes: dialog.querySelector("#record-notes").value.trim(),
      reviewed: dialog.querySelector("#record-reviewed").checked,
    });
    const showError = (error) => {
      const el = dialog.querySelector("#detail-error");
      el.textContent = error.message;
      el.hidden = false;
      if (error.message.includes("复查")) selectTab("followup");
      else if (error.message.includes("采集")) selectTab("sample");
    };
    let dirty = false;
    dialog.dataset.dirty = "false";
    dialog.oninput = (e) => {
      if (e.target.closest(".assistant-panel")) return;
      dirty = true;
      dialog.dataset.dirty = "true";
      dialog.querySelector(".detail-save-state").textContent = "有未保存的修改";
    };
    dialog.onchange = (e) => {
      if (e.target.closest(".assistant-panel")) return;
      dirty = true;
      dialog.dataset.dirty = "true";
      dialog.querySelector(".detail-save-state").textContent = "有未保存的修改";
    };
    const close = () => {
      if (!dirty || confirm("有未保存的修改，确定放弃吗？")) dialog.close();
    };
    dialog.querySelector("#close-detail").onclick = close;
    dialog.oncancel = (e) => {
      e.preventDefault();
      close();
    };
    dialog.querySelector("#followup-enabled").onchange = (e) => {
      dialog.querySelector("#followup-form").hidden = !e.target.checked;
    };
    dialog.querySelector("#detail-export").onclick = () => {
      try {
        downloadJSON(currentDraft());
      } catch (error) {
        showError(error);
        return;
      }
      toast("已导出当前填写内容；保存复核信息后才会更新本地记录");
    };
    dialog.querySelector("#save-review").onclick = () => {
      let updated;
      try {
        updated = currentDraft();
      } catch (error) {
        showError(error);
        return;
      }
      if (
        persist(
          getRecords().map((record) => (record.id === id ? updated : record)),
        )
      ) {
        dialog.close();
        refresh();
        toast("复核信息已保存");
      } else
        showError(new Error("保存失败，填写内容已保留。请导出报告后重试。"));
    };
    attachAssistant(dialog, currentDraft, apiEnabled);
    dialog.showModal();
    dialog.scrollTop = 0;
    dialog.querySelector("#close-detail").focus({ preventScroll: true });
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
    extra = { plot: "", batch: "", from: "", to: "", task: "all" };
    main.querySelector("#filter-from").value = "";
    main.querySelector("#filter-to").value = "";
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
  main.querySelector("#compare-records").onclick = () =>
    openComparison(filtered());
  main.querySelector("#report-records").onclick = () => openReport(filtered());
  main.querySelector("#clear").onclick = () => {
    if (
      confirm("清空此浏览器的全部检测记录和复查安排？建议先导出全部备份。") &&
      persist([])
    ) {
      refresh();
      toast("记录已清空");
    }
  };
  for (const key of ["plot", "batch", "from", "to", "task"])
    main.querySelector("#filter-" + key).onchange = (e) => {
      extra[key] = e.target.value;
      page = 1;
      refresh();
    };
  main.querySelectorAll("[data-task]").forEach(
    (b) =>
      (b.onclick = () => {
        extra.task = b.dataset.task;
        page = 1;
        refresh();
      }),
  );
  attachBackup(main, { getRecords, persist, toast, refresh });
  let day = localDay();
  const timer = setInterval(() => {
    if (!main.contains(dialog)) {
      clearInterval(timer);
      return;
    }
    const now = localDay();
    if (now !== day) {
      day = now;
      refresh();
    }
  }, 30000);
  refresh();
}
