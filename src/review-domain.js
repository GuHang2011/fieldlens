export const REVIEW_LABELS = {
  pending: "待确认",
  keep: "保留",
  reject: "疑似误检",
};

// Include the complete original detection and occurrence number, not its position
// in a filtered list. Different inference records never share review state.
export function regionKeys(detections) {
  const seen = new Map();
  return detections.map((d) => {
    const signature = JSON.stringify([d.label, d.confidence, d.box]);
    const occurrence = seen.get(signature) || 0;
    seen.set(signature, occurrence + 1);
    return `${signature}#${occurrence}`;
  });
}

export function normalizeReviews(reviews, detections) {
  if (reviews == null) return [];
  if (!Array.isArray(reviews) || reviews.length > detections.length)
    throw Error("区域复核格式无效");
  const keys = new Set(regionKeys(detections)),
    seen = new Set();
  return reviews.map((r) => {
    if (
      !r ||
      !keys.has(r.key) ||
      seen.has(r.key) ||
      !Object.hasOwn(REVIEW_LABELS, r.status) ||
      typeof r.note !== "string" ||
      r.note.length > 300
    )
      throw Error("区域复核与原始检测不匹配");
    seen.add(r.key);
    return { key: r.key, status: r.status, note: r.note.trim() };
  });
}

export function reviewCounts(record) {
  const counts = { pending: record.detections.length, keep: 0, reject: 0 };
  for (const review of normalizeReviews(
    record.regionReviews,
    record.detections,
  )) {
    if (review.status !== "pending") {
      counts.pending--;
      counts[review.status]++;
    }
  }
  return counts;
}

export function comparisonWarnings(a, b) {
  const warnings = [];
  if (a.mode === "demo" || b.mode === "demo")
    warnings.push("包含预设演示记录，不能用于判断田间变化。");
  if (a.mode !== b.mode) warnings.push("检测来源不同。");
  if (a.model !== b.model) warnings.push("模型不同，结果不可直接比较。");
  if (a.threshold !== b.threshold)
    warnings.push("置信度阈值不同，区域数量不可直接比较。");
  if (!a.sample?.code || !b.sample?.code || a.sample.code !== b.sample.code)
    warnings.push("样本编号不一致或未填写，请确认是否属于同一观察对象。");
  if (a.sample?.plot !== b.sample?.plot || a.sample?.crop !== b.sample?.crop)
    warnings.push("作物或地块不一致。");
  return warnings;
}

export function assistantContext(record) {
  const keys = regionKeys(record.detections);
  return {
    source:
      record.mode === "demo"
        ? "预设演示，非模型推理"
        : "模型输出，尚需人工复核",
    model: record.model || "未记录",
    threshold: record.threshold,
    crop: record.sample?.crop || "未填写",
    detections: record.detections.map((d, i) => {
      const review = record.regionReviews?.find((r) => r.key === keys[i]);
      return {
        region: i + 1,
        label: d.label,
        confidence: d.confidence,
        box: d.box,
        review: REVIEW_LABELS[review?.status || "pending"],
        note: review?.note || "",
      };
    }),
    notes: record.notes || "",
  };
}
