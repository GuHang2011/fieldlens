import {
  normalizeReviews,
  reviewCounts,
  REVIEW_LABELS,
} from "./review-domain.js";

export const DEMO_DETECTIONS = [
  { label: "叶斑区域", confidence: 0.946, box: [0.18, 0.19, 0.45, 0.55] },
  { label: "叶斑区域", confidence: 0.873, box: [0.57, 0.42, 0.81, 0.76] },
  { label: "疑似褪绿", confidence: 0.728, box: [0.52, 0.12, 0.72, 0.34] },
];

export function visibleDetections(detections, threshold) {
  return detections.filter((item) => item.confidence >= threshold);
}

export function validateResult(data) {
  if (!data || !Array.isArray(data.detections) || data.detections.length > 300)
    throw new Error("检测服务返回了无效结果");
  for (const item of data.detections) {
    if (
      !item ||
      typeof item.label !== "string" ||
      item.label.length > 200 ||
      !Number.isFinite(item.confidence) ||
      item.confidence < 0 ||
      item.confidence > 1 ||
      !Array.isArray(item.box) ||
      item.box.length !== 4 ||
      item.box.some((v) => !Number.isFinite(v) || v < 0 || v > 1) ||
      item.box[0] >= item.box[2] ||
      item.box[1] >= item.box[3]
    )
      throw new Error("检测结果格式错误");
  }
  return data.detections;
}

export function loadHistory(storage) {
  try {
    const records = JSON.parse(storage.getItem("fieldlens.history") || "[]");
    if (!Array.isArray(records)) return [];
    const ids = new Set();
    return records
      .flatMap((r) => {
        try {
          const record = normalizeRecord(r);
          if (ids.has(record.id)) return [];
          ids.add(record.id);
          return [record];
        } catch {
          return [];
        }
      })
      .slice(0, 30);
  } catch {
    return [];
  }
}

export function reportFor(record) {
  return {
    ...record,
    application: "禾镜 FieldLens",
    version: "1.9.1",
    notice:
      record.mode === "demo"
        ? "合成插画与预设标注，仅作交互演示，并非模型推理。"
        : "模型输出仅供筛查参考，需结合田间调查人工复核。",
  };
}

export function normalizeRecord(r) {
  if (
    !r ||
    typeof r.id !== "string" ||
    !r.id ||
    r.id.length > 100 ||
    typeof r.name !== "string" ||
    !r.name ||
    r.name.length > 255 ||
    typeof r.date !== "string" ||
    !Number.isFinite(Date.parse(r.date)) ||
    !["demo", "model"].includes(r.mode) ||
    !Number.isFinite(r.threshold) ||
    r.threshold < 0.1 ||
    r.threshold > 0.99
  )
    throw Error("无效记录");
  return {
    id: r.id,
    name: r.name,
    date: new Date(r.date).toISOString(),
    mode: r.mode,
    threshold: r.threshold,
    detections: validateResult(r),
    reviewed: r.reviewed === true,
    notes: typeof r.notes === "string" ? r.notes.slice(0, 1000) : "",
    model: typeof r.model === "string" ? r.model.slice(0, 200) : "",
    width: Number.isSafeInteger(r.width) && r.width > 0 ? r.width : null,
    height: Number.isSafeInteger(r.height) && r.height > 0 ? r.height : null,
    sample: normalizeSample(r.sample),
    followUp: normalizeFollowUp(r.followUp),
    regionReviews: normalizeReviews(r.regionReviews, r.detections),
  };
}

export function filterRecords(
  records,
  {
    query = "",
    mode = "all",
    review = "all",
    plot = "",
    batch = "",
    from = "",
    to = "",
    task = "all",
    today = localDay(),
  } = {},
) {
  const terms = query
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return records.filter((r) => {
    const sample = normalizeSample(r.sample);
    const date = localDay(new Date(sample.collectedAt || r.date));
    const text = [
      r.name,
      r.notes || "",
      sample.code,
      sample.crop,
      sample.plot,
      sample.batch,
      ...r.detections.map((d) => d.label),
    ]
      .join(" ")
      .normalize("NFKC")
      .toLowerCase();
    return (
      (mode === "all" || r.mode === mode) &&
      (review === "all" || (review === "reviewed") === !!r.reviewed) &&
      (!plot || sample.plot === plot) &&
      (!batch || sample.batch === batch) &&
      (!from || date >= from) &&
      (!to || date <= to) &&
      matchesTask(r.followUp, task, today) &&
      terms.every((term) => text.includes(term))
    );
  });
}

export function recordsCSV(records) {
  const cell = (value) => {
    let text = String(value ?? "");
    if (/^[\s]*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text))
      text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const rows = [
    [
      "图片名称",
      "记录时间（ISO 8601）",
      "来源",
      "阈值",
      "区域数",
      "类别",
      "复核状态",
      "备注",
      "样本编号",
      "作物",
      "地块",
      "巡检批次",
      "采集时间",
      "采集时间来源",
      "复查状态",
      "计划日期",
      "复查原因",
      "处理说明",
      "关联记录 ID",
      "区域待确认数",
      "人工保留数",
      "疑似误检数",
      "区域复核意见",
    ],
  ];
  for (const r of records)
    rows.push([
      r.name,
      r.date,
      r.mode === "demo" ? "预设演示（非模型推理）" : "YOLO 模型推理",
      r.threshold,
      r.detections.length,
      [...new Set(r.detections.map((d) => d.label))].join(" / "),
      r.reviewed ? "已复核" : "待复核",
      r.notes || "",
      ...Object.values(normalizeSample(r.sample)).slice(0, 5),
      r.sample?.collectedAt
        ? r.sample.timeSource === "user"
          ? "用户填写"
          : "录入时间"
        : "",
      r.followUp ? taskLabel(r.followUp) : "未安排",
      r.followUp?.dueDate || "",
      r.followUp?.reason || "",
      r.followUp?.note || "",
      r.followUp?.linkedRecordId || "",
      ...Object.values(reviewCounts(r)),
      (r.regionReviews || [])
        .map((v) => `${v.key}：${REVIEW_LABELS[v.status]} ${v.note}`)
        .join("\n"),
    ]);
  return "\ufeff" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
}

export const HISTORY_LIMIT = 30;
export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function validDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + "T12:00:00");
  return Number.isFinite(d.getTime()) && localDay(d) === value;
}
const shortText = (value, limit) =>
  typeof value === "string" ? value.trim().slice(0, limit) : "";
export function normalizeSample(sample = {}) {
  sample = sample || {};
  if (
    sample.collectedAt &&
    (typeof sample.collectedAt !== "string" ||
      !Number.isFinite(Date.parse(sample.collectedAt)))
  )
    throw Error("采集时间无效");
  return {
    code: shortText(sample.code, 80),
    crop: shortText(sample.crop, 80),
    plot: shortText(sample.plot, 100),
    batch: shortText(sample.batch, 100),
    collectedAt: sample.collectedAt
      ? new Date(sample.collectedAt).toISOString()
      : "",
    timeSource: sample.collectedAt
      ? sample.timeSource === "user"
        ? "user"
        : "entry"
      : "",
  };
}
export function normalizeFollowUp(task) {
  if (task == null) return null;
  if (
    !["pending", "done", "cancelled"].includes(task.status) ||
    typeof task.reason !== "string" ||
    !task.reason.trim()
  )
    throw Error("复查任务无效");
  if (task.dueDate && !validDay(task.dueDate)) throw Error("复查日期无效");
  return {
    status: task.status,
    reason: shortText(task.reason, 200),
    dueDate: task.dueDate || "",
    note: shortText(task.note, 1000),
    linkedRecordId: shortText(task.linkedRecordId, 100),
  };
}
export function matchesTask(task, filter, today = localDay()) {
  if (filter === "all") return true;
  if (!task) return filter === "none";
  if (filter === "today")
    return task.status === "pending" && task.dueDate === today;
  if (filter === "overdue")
    return task.status === "pending" && !!task.dueDate && task.dueDate < today;
  return task.status === filter;
}
export function taskLabel(task, today = localDay()) {
  if (!task) return "未安排";
  if (task.status === "done") return "已完成";
  if (task.status === "cancelled") return "已取消";
  return matchesTask(task, "overdue", today)
    ? "已逾期"
    : matchesTask(task, "today", today)
      ? "今日待复查"
      : task.dueDate
        ? "待复查"
        : "待复查 · 未安排日期";
}
export function backupFor(records) {
  return {
    application: "禾镜 FieldLens",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    records: records.map((r) => reportFor(normalizeRecord(r))),
  };
}
export function parseBackup(text, existing) {
  if (new TextEncoder().encode(text).length > 5 * 1024 * 1024)
    throw Error("备份文件不能超过 5 MB");
  let data;
  try {
    data = JSON.parse(text.replace(/^\ufeff/, ""));
  } catch {
    throw Error("文件不是有效的 JSON");
  }
  let records;
  if (data?.schemaVersion !== undefined) {
    if (
      data.schemaVersion !== 1 ||
      data.application !== "禾镜 FieldLens" ||
      !Array.isArray(data.records)
    )
      throw Error("不支持的备份格式或版本");
    records = data.records;
  } else if (data?.application === "禾镜 FieldLens" && data.id)
    records = [data];
  else throw Error("请选择禾镜备份文件或单条 JSON 报告");
  if (records.length > 1000)
    throw Error("单次最多校验 1000 条记录，请拆分备份");
  const seen = new Set();
  return records.map((raw, index) => {
    try {
      const record = normalizeRecord(raw);
      if (seen.has(record.id))
        return {
          index,
          name: record.name,
          kind: "invalid",
          message: "文件内记录 ID 重复",
        };
      seen.add(record.id);
      const old = existing.find((r) => r.id === record.id);
      const kind = !old
        ? "new"
        : JSON.stringify(normalizeRecord(old)) === JSON.stringify(record)
          ? "duplicate"
          : "conflict";
      return {
        index,
        name: record.name,
        record,
        kind,
        existing: old ? normalizeRecord(old) : null,
      };
    } catch (error) {
      return {
        index,
        name: shortText(raw?.name, 255) || `第 ${index + 1} 条`,
        kind: "invalid",
        message: error.message,
      };
    }
  });
}
export function mergeBackup(existing, entries, choices) {
  const result = existing.map(normalizeRecord);
  for (const entry of entries) {
    const action = choices[entry.index];
    if (action !== "add" && action !== "replace") continue;
    if (
      (action === "add" && entry.kind !== "new") ||
      (action === "replace" && entry.kind !== "conflict")
    )
      throw Error("导入选项无效，请重新预览");
    const index = result.findIndex((r) => r.id === entry.record.id);
    if (action === "replace" && index >= 0) result[index] = entry.record;
    else if (action === "add" && index < 0) result.unshift(entry.record);
    else throw Error("记录已变化，请重新导入");
  }
  if (result.length > HISTORY_LIMIT)
    throw Error(
      `合并后共 ${result.length} 条，超过 30 条上限。请减少导入数量或先备份并整理旧记录。`,
    );
  return result;
}
