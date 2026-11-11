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
const recordTime = (date) => {
  const value = new Date(date);
  const day = value.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
  const time = value.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `<time datetime="${esc(date)}" title="${esc(when(date))}">${esc(day)}<small>${esc(time)}</small></time>`;
};
const source = (r) => (r.mode === "demo" ? "预设演示" : "YOLO 推理");

export function renderHistoryPage(
  main,
  {
    getRecords,
    persist,
    toast,
    initialTask = "all",
    initialReview = "all",
    apiEnabled = false,
    storageNote,
  },
) {
  let query = "",
    mode = "all",
    review = ["pending", "reviewed"].includes(initialReview) ? initialReview : "all",
    page = 1,
    order = "saved";
  const selected = new Set();
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
  main.innerHTML = `<section class="page-heading"><div><h1>检测记录</h1><p>按样本核对结果，跟进复查，整理巡检报告。</p></div><div class="page-actions"><button class="button outlined" id="compare-records">两次记录对比</button><button class="button primary" id="report-records">生成巡检报告</button></div></section>
  <section class="record-stats" id="record-stats" aria-label="记录统计"></section>
  <section class="panel history-panel"><div class="history-section-heading"><h2>记录列表</h2><div class="record-toolbar"><button class="button outlined" id="export-records">导出筛选结果 CSV</button></div></div><div class="task-shortcuts" aria-label="复查快捷筛选"><button class="button outlined" data-task="all">全部记录</button><button class="button outlined" data-task="pending">待复查</button><button class="button outlined" data-task="today">今日待办</button><button class="button outlined" data-task="overdue">已逾期</button><span id="task-overview"></span></div><div class="history-filter-bar"><div class="record-search-row"><label class="record-search-label">搜索记录<input id="record-query" type="search" placeholder="搜索样本、地块或备注" maxlength="200"/></label><button type="button" class="button outlined record-filter-toggle" id="record-filter-toggle" aria-controls="record-filter-fields" aria-expanded="false">筛选<span id="filter-count"></span></button></div><div id="record-filter-fields" class="record-filter-fields"><div class="history-filters"><label>检测来源<select id="record-mode"><option value="all">全部来源</option><option value="model">YOLO 推理</option><option value="demo">预设演示</option></select></label><label>复核状态<select id="record-review"><option value="all">全部状态</option><option value="pending">待复核</option><option value="reviewed">已复核</option></select></label><button class="button outlined" id="reset-filters">重置筛选</button></div><details class="advanced-filters"><summary>更多筛选 <span>地块、批次、日期</span></summary><div class="history-filters"><label>地块<select id="filter-plot"></select></label><label>巡检批次<select id="filter-batch"></select></label><label>采集日期起<input id="filter-from" type="date"/></label><label>采集日期止<input id="filter-to" type="date"/></label><label>复查任务<select id="filter-task"><option value="all">全部任务状态</option><option value="pending">待复查</option><option value="today">今日待办</option><option value="overdue">已逾期</option><option value="done">已完成</option><option value="cancelled">已取消</option><option value="none">未安排</option></select></label></div><p class="field-help">未填写采集时间的旧记录按检测日期筛选。日期按本机时区计算。</p></details></div></div><p id="filter-error" class="error" hidden>开始日期不能晚于结束日期，请调整筛选。</p><div id="active-filters" class="active-filters" aria-label="已应用的筛选条件" hidden></div><div class="record-list-controls"><div class="record-selection-tools"><label class="record-checkbox"><input type="checkbox" id="select-page"/>选择本页</label><span id="records-scope" role="status"></span><button class="text-button" id="clear-selection" hidden>取消选择</button><button class="text-button" id="select-matching" hidden>选择全部筛选结果</button></div><label class="record-sort">排序<select id="record-sort"><option value="saved">最近保存优先</option><option value="newest">最新记录优先</option><option value="oldest">最早记录优先</option><option value="review">待复核优先</option><option value="due">复查到期优先</option></select></label></div><p class="table-mobile-hint">左右滑动查看记录，右侧操作栏固定显示。</p><div id="records-table"></div><div class="pagination"><span id="records-total" role="status"></span><div><button class="button outlined" id="previous-page">上一页</button><span id="page-label"></span><button class="button outlined" id="next-page">下一页</button></div></div><div class="record-backup-tools"><div><strong>备份与迁移</strong><span>导出全部记录，或从其他设备恢复。</span></div><span id="backup-tools"></span></div></section>
  <p class="storage-note">本机保存 · 最多 30 条 · 满额停止新增。备份不含原图。勾选后对比、报告与 CSV 使用所选记录；未勾选时使用全部筛选结果。</p><div class="history-tools"><button class="text-button danger" id="clear">清空全部记录</button><span>复核标记仅表示已查看，不代表病害确诊。</span></div>
  <dialog id="record-dialog" class="record-dialog inspection-dialog" aria-labelledby="record-dialog-title"></dialog>`;
  if (storageNote)
    main.querySelector(".storage-note").textContent = storageNote;
  const filtered = () => {
    const newest = (a, b) => new Date(b.date) - new Date(a.date);
    const due = (r) => r.followUp?.status === "pending"
      ? r.followUp.dueDate || "9999-12-30" : "9999-12-31";
    const matches = filterRecords(getRecords(), { query, mode, review, ...extra });
    if (order === "saved") return matches;
    return matches.sort(
      order === "oldest" ? (a, b) => -newest(a, b)
        : order === "review" ? (a, b) => Number(a.reviewed) - Number(b.reviewed) || newest(a, b)
          : order === "due" ? (a, b) => due(a).localeCompare(due(b)) || newest(a, b)
            : newest,
    );
  };
  const actionRecords = () => filtered().filter((r) => !selected.size || selected.has(r.id));
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
    const matchingIds = new Set(matches.map((r) => r.id));
    for (const id of selected) if (!matchingIds.has(id)) selected.delete(id);
    const chips = [
      ["query", query.trim() ? `搜索：${query.trim()}` : ""],
      ["mode", mode === "all" ? "" : `来源：${mode === "demo" ? "预设演示" : "YOLO 推理"}`],
      ["review", review === "all" ? "" : `复核：${review === "pending" ? "待复核" : "已复核"}`],
      ["plot", extra.plot ? `地块：${extra.plot}` : ""],
      ["batch", extra.batch ? `批次：${extra.batch}` : ""],
      ["from", extra.from ? `从：${extra.from}` : ""],
      ["to", extra.to ? `至：${extra.to}` : ""],
      ["task", extra.task === "all" ? "" : `复查：${main.querySelector("#filter-task").selectedOptions[0].textContent}`],
    ].filter(([, label]) => label);
    const filterCount = chips.filter(([key]) => key !== "query").length;
    main.querySelector("#filter-count").textContent = filterCount ? ` ${filterCount}` : "";
    const activeFilters = main.querySelector("#active-filters");
    activeFilters.hidden = !chips.length;
    activeFilters.innerHTML = chips.map(([key, label]) => `<button class="filter-chip" data-remove-filter="${key}" aria-label="移除${esc(label)}">${esc(label)}<span aria-hidden="true">×</span></button>`).join("");
    activeFilters.querySelectorAll("[data-remove-filter]").forEach((button) => {
      button.onclick = () => {
        const key = button.dataset.removeFilter;
        if (key === "query") query = "";
        else if (key === "mode") mode = "all";
        else if (key === "review") review = "all";
        else extra[key] = key === "task" ? "all" : "";
        syncFilters();
        page = 1;
        refresh();
        (activeFilters.querySelector("button") || main.querySelector("#record-query")).focus();
      };
    });
    const pages = Math.max(1, Math.ceil(matches.length / pageSize));
    page = Math.min(page, pages);
    main.querySelector("#record-stats").innerHTML = [
      ["all", "全部记录", records.length, "查看完整记录"],
      ["review", "待复核", records.filter((r) => !r.reviewed).length, "核对区域与备注"],
      ["pending", "待复查", tasks, "继续跟进样本"],
      ["overdue", "已逾期", overdue, "优先处理复查"],
    ]
      .map(
        ([key, label, value, hint]) =>
          `<button type="button" class="panel record-stat" data-record-stat="${key}" aria-label="查看${label} ${value} 条"><span class="stat-copy"><span>${label}</span><small>${hint}<span aria-hidden="true"> ↗</span></small></span><strong>${value}</strong></button>`,
      )
      .join("");
    main.querySelector("#records-table").innerHTML = matches.length
      ? `<div class="table-scroll" tabindex="0" role="region" aria-label="检测记录表格"><table><thead><tr><th>样本信息</th><th>记录时间</th><th>检测来源</th><th>检测结果</th><th>复核与跟进</th><th>操作</th></tr></thead><tbody>${matches
          .slice((page - 1) * pageSize, page * pageSize)
          .map(
            (r) =>
              `<tr class="${selected.has(r.id) ? "is-selected" : ""}"><td><div class="record-identity"><input type="checkbox" data-select-record="${esc(r.id)}" aria-label="选择 ${esc(r.name)}" ${selected.has(r.id) ? "checked" : ""}/><div><strong>${esc(r.sample?.code || r.name)}</strong><small class="record-note">${esc([r.sample?.plot, r.sample?.batch].filter(Boolean).join(" · ") || r.name)}</small>${r.notes ? `<small class="record-note record-comment" title="${esc(r.notes)}">${esc(r.notes)}</small>` : ""}</div></div></td><td data-label="记录时间">${recordTime(r.date)}</td><td data-label="来源"><span class="badge">${source(r)}</span></td><td data-label="检测结果"><span class="record-detection-count">${r.detections.length}<small> 个区域</small></span><small class="record-note">阈值 ${Math.round(r.threshold * 100)}%</small></td><td data-label="复核 / 复查"><span class="badge ${r.reviewed ? "success" : "warning"}">${r.reviewed ? "已复核" : "待复核"}</span>${r.followUp ? `<small class="record-note record-followup">${taskLabel(r.followUp)}${r.followUp.dueDate ? ` · ${esc(r.followUp.dueDate)}` : ""}</small>` : ""}</td><td class="record-actions"><button class="text-button" data-details="${esc(r.id)}">详情</button><button class="text-button" data-json="${esc(r.id)}">JSON</button><button class="text-button danger" data-delete="${esc(r.id)}" aria-label="删除 ${esc(r.name)}">删除</button></td></tr>`,
          )
          .join("")}</tbody></table></div>`
      : `<div class="history-empty"><h2>${records.length ? "没有匹配的记录" : "暂无检测记录"}</h2><p>${records.length ? "请修改搜索条件，或重置筛选。" : "完成示例或模型检测后，点击“保存记录”。"}</p>${records.length ? '<button class="button outlined" id="empty-reset">清除筛选</button>' : '<a class="button primary" href="#workspace">前往图像检测</a>'}</div>`;
    main.querySelector("#records-total").textContent =
      `共 ${matches.length} 条 / 全部 ${records.length} 条`;
    main.querySelector("#page-label").textContent = `${page} / ${pages}`;
    main.querySelector("#previous-page").disabled = page <= 1;
    main.querySelector("#next-page").disabled = page >= pages;
    const count = actionRecords().length;
    main.querySelector("#export-records").disabled = !count;
    main.querySelector("#report-records").disabled = !count;
    main.querySelector("#compare-records").disabled = count < 2;
    main.querySelector("#export-records").textContent = selected.size ? `导出所选 CSV（${count}）` : "导出筛选结果 CSV";
    main.querySelector("#report-records").textContent = selected.size ? `生成所选报告（${count}）` : "生成巡检报告";
    main.querySelector("#compare-records").textContent = selected.size ? "对比所选记录" : "两次记录对比";
    main.querySelector("#records-scope").textContent = selected.size ? `已选 ${selected.size} 条 · 可跨页选择` : `操作范围：筛选结果 ${matches.length} 条`;
    main.querySelector("#clear-selection").hidden = !selected.size;
    main.querySelector("#select-matching").hidden = !selected.size || selected.size === matches.length;
    const visible = matches.slice((page - 1) * pageSize, page * pageSize);
    const visibleSelected = visible.filter((r) => selected.has(r.id)).length;
    const selectPage = main.querySelector("#select-page");
    selectPage.disabled = !visible.length;
    selectPage.checked = !!visible.length && visibleSelected === visible.length;
    selectPage.indeterminate = visibleSelected > 0 && visibleSelected < visible.length;
    main.querySelectorAll("[data-select-record]").forEach((checkbox) => {
      checkbox.onchange = () => {
        const id = checkbox.dataset.selectRecord;
        if (checkbox.checked) selected.add(id); else selected.delete(id);
        refresh();
        [...main.querySelectorAll("[data-select-record]")].find((el) => el.dataset.selectRecord === id)?.focus({ preventScroll: true });
      };
    });
    main.querySelectorAll("[data-record-stat]").forEach((button) => {
      button.onclick = () => {
        resetFilters();
        const key = button.dataset.recordStat;
        if (key === "review") review = "pending";
        else if (key !== "all") extra.task = key;
        syncFilters();
        refresh();
        main.querySelector(`[data-record-stat="${key}"]`).focus({ preventScroll: true });
      };
    });
    main.querySelector("#empty-reset")?.addEventListener("click", () => {
      resetFilters();
      refresh();
      main.querySelector("#record-query").focus();
    });
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
  const filterToggle = main.querySelector("#record-filter-toggle");
  filterToggle.onclick = () => {
    const open = filterToggle.getAttribute("aria-expanded") !== "true";
    filterToggle.setAttribute("aria-expanded", String(open));
    main.querySelector(".history-panel").classList.toggle("filters-expanded", open);
  };
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
  function syncFilters() {
    main.querySelector("#record-query").value = query;
    main.querySelector("#record-mode").value = mode;
    main.querySelector("#record-review").value = review;
    main.querySelector("#filter-from").value = extra.from;
    main.querySelector("#filter-to").value = extra.to;
  }
  function resetFilters() {
    selected.clear();
    query = "";
    mode = "all";
    review = "all";
    page = 1;
    extra = { plot: "", batch: "", from: "", to: "", task: "all" };
    syncFilters();
  }
  main.querySelector("#reset-filters").onclick = () => { resetFilters(); refresh(); };
  main.querySelector("#select-page").onchange = (event) => {
    for (const r of filtered().slice((page - 1) * pageSize, page * pageSize)) {
      if (event.target.checked) selected.add(r.id); else selected.delete(r.id);
    }
    refresh();
  };
  main.querySelector("#clear-selection").onclick = () => { selected.clear(); refresh(); main.querySelector("#select-page").focus(); };
  main.querySelector("#select-matching").onclick = () => { filtered().forEach((r) => selected.add(r.id)); refresh(); main.querySelector("#clear-selection").focus(); };
  main.querySelector("#record-sort").onchange = (event) => { order = event.target.value; page = 1; refresh(); };
  main.querySelector("#previous-page").onclick = () => {
    page--;
    refresh();
  };
  main.querySelector("#next-page").onclick = () => {
    page++;
    refresh();
  };
  main.querySelector("#export-records").onclick = () => downloadCSV(actionRecords());
  main.querySelector("#compare-records").onclick = () =>
    openComparison(actionRecords());
  main.querySelector("#report-records").onclick = () => openReport(actionRecords(), { selected: selected.size > 0 });
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
  syncFilters();
  refresh();
}
