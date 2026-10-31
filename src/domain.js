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
    return records
      .filter(
        (r) =>
          typeof r.id === "string" &&
          typeof r.name === "string" &&
          typeof r.date === "string" &&
          ["demo", "model"].includes(r.mode) &&
          Number.isFinite(r.threshold) &&
          r.threshold >= 0.1 &&
          r.threshold <= 0.99 &&
          Array.isArray(r.detections),
      )
      .filter((r) => {
        try {
          validateResult(r);
          return true;
        } catch {
          return false;
        }
      })
      .slice(0, 30);
  } catch {
    return [];
  }
}

export function reportFor(record) {
  return {
    application: "禾镜 FieldLens",
    version: "1.0.0",
    ...record,
    notice:
      record.mode === "demo"
        ? "合成插画与预设标注，仅作交互演示，并非模型推理。"
        : "模型输出仅供筛查参考，需结合田间调查人工复核。",
  };
}
