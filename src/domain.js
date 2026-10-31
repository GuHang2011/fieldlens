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
    version: "1.1.0",
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
  };
}

export function filterRecords(
  records,
  { query = "", mode = "all", review = "all" } = {},
) {
  const terms = query
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return records.filter((r) => {
    const text = [r.name, r.notes || "", ...r.detections.map((d) => d.label)]
      .join(" ")
      .normalize("NFKC")
      .toLowerCase();
    return (
      (mode === "all" || r.mode === mode) &&
      (review === "all" || (review === "reviewed") === !!r.reviewed) &&
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
    ]);
  return "\ufeff" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
