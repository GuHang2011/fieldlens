import { normalizeSample, normalizeFollowUp, localDay } from "./domain.js";

export const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function newSample() {
  return {
    code: `FL-${localDay().replaceAll("-", "")}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
    crop: "",
    plot: "",
    batch: "",
    collectedAt: new Date().toISOString(),
    timeSource: "entry",
  };
}
function localMinute(value) {
  if (!value) return "";
  const date = new Date(value);
  return `${localDay(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
export function sampleFields(value, prefix, records = []) {
  const sample = normalizeSample(value);
  return `<div class="sample-fields">${[
    ["code", "样本编号", 80],
    ["crop", "作物", 80],
    ["plot", "地块 / 温室", 100],
    ["batch", "巡检批次", 100],
  ]
    .map(
      ([key, label, max]) =>
        `<label>${label}<input data-sample="${key}" id="${prefix}-${key}" value="${escapeHTML(sample[key])}" maxlength="${max}" ${key !== "code" ? `list="${prefix}-${key}-list"` : ""} placeholder="${key === "code" ? "可自行编号" : "未填写"}"/>${key !== "code" ? `<datalist id="${prefix}-${key}-list">${[...new Set(records.map((r) => r.sample?.[key]).filter(Boolean))].map((v) => `<option value="${escapeHTML(v)}"></option>`).join("")}</datalist>` : ""}</label>`,
    )
    .join(
      "",
    )}<label>采集时间<input data-sample="collectedAt" type="datetime-local" value="${localMinute(sample.collectedAt)}"/></label><p class="sample-time-source">${sample.timeSource === "user" ? "用户填写的采集时间" : sample.collectedAt ? "默认使用录入时间，可按实际采集时间修改" : "旧记录未填写采集时间"}</p></div>`;
}
export function readSample(container, previous) {
  const result = { ...normalizeSample(previous) };
  container.querySelectorAll("[data-sample]").forEach((input) => {
    const key = input.dataset.sample;
    if (key === "collectedAt") {
      if (input.value !== localMinute(result.collectedAt)) {
        const date = input.value ? new Date(input.value) : null;
        if (date && !Number.isFinite(date.getTime()))
          throw Error("请填写有效的采集时间");
        result.collectedAt = date?.toISOString() || "";
        result.timeSource = date ? "user" : "";
      }
    } else result[key] = input.value;
  });
  const source = container.querySelector(".sample-time-source");
  if (source)
    source.textContent =
      result.timeSource === "user"
        ? "用户填写的采集时间"
        : result.collectedAt
          ? "默认使用录入时间，可按实际采集时间修改"
          : "未填写采集时间";
  return normalizeSample(result);
}
export function followUpFields(value, records, currentId) {
  const task = normalizeFollowUp(value);
  return `<fieldset class="followup-fields"><legend>复查安排</legend><label class="review-check"><input id="followup-enabled" type="checkbox" ${task ? "checked disabled" : ""}/> 安排复查${task ? "（已有安排可在下方选择已取消）" : ""}</label><div id="followup-form" ${task ? "" : "hidden"}><div class="sample-fields"><label>复查原因<input id="followup-reason" list="followup-reasons" maxlength="200" value="${escapeHTML(task?.reason)}" placeholder="例如图片不清晰、结果存疑"/><datalist id="followup-reasons">${["图片不清晰", "需要补拍", "结果存疑", "观察变化", "其他"].map((r) => `<option value="${r}"></option>`).join("")}</datalist></label><label>计划日期<input id="followup-date" type="date" value="${escapeHTML(task?.dueDate)}"/></label><label>任务状态<select id="followup-status">${[
    ["pending", "待复查"],
    ["done", "已完成"],
    ["cancelled", "已取消"],
  ]
    .map(
      ([v, l]) =>
        `<option value="${v}" ${task?.status === v ? "selected" : ""}>${l}</option>`,
    )
    .join(
      "",
    )}</select></label><label>关联新检测记录<select id="followup-link"><option value="">暂不关联</option>${records
    .filter((r) => r.id !== currentId)
    .map(
      (r) =>
        `<option value="${escapeHTML(r.id)}" ${task?.linkedRecordId === r.id ? "selected" : ""}>${escapeHTML(r.sample?.code || r.name)} · ${escapeHTML(r.sample?.batch || "未分批")}</option>`,
    )
    .join(
      "",
    )}${task?.linkedRecordId && !records.some((r) => r.id === task.linkedRecordId) ? `<option selected value="${escapeHTML(task.linkedRecordId)}">关联记录未在此浏览器中（保留 ID）</option>` : ""}</select></label></div><label class="dialog-label">处理说明 / 复查备注<textarea id="followup-note" rows="2" maxlength="1000">${escapeHTML(task?.note)}</textarea></label><p class="field-help">日期按本机时区计算。提醒仅在打开站点时显示；人工查看不代表复查任务完成。</p></div></fieldset>`;
}
export function readFollowUp(container) {
  if (!container.querySelector("#followup-enabled").checked) return null;
  const reason = container.querySelector("#followup-reason").value.trim();
  if (!reason) throw Error("请填写复查原因");
  return normalizeFollowUp({
    reason,
    status: container.querySelector("#followup-status").value,
    dueDate: container.querySelector("#followup-date").value,
    note: container.querySelector("#followup-note").value,
    linkedRecordId: container.querySelector("#followup-link").value,
  });
}
