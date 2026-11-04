import { DEMO_DETECTIONS, localDay, normalizeRecord } from "./domain.js";
import { regionKeys } from "./review-domain.js";

export const DEMO_SESSION_KEY = "fieldlens.demo.session.v1";

export function createDemoRecords(now = new Date()) {
  const offsets = [0, 0, 1, 1, 2, 2, 3, 4, 4, 5, 6, 6];
  const day = (offset) => {
    const value = new Date(now);
    value.setDate(value.getDate() + offset);
    return localDay(value);
  };
  return offsets.map((offset, index) => {
    const date = new Date(now);
    date.setDate(date.getDate() - offset);
    const detections =
      index === 10
        ? []
        : structuredClone(DEMO_DETECTIONS.slice(0, 1 + (index % 3)));
    const reviewed = index % 3 === 1;
    return normalizeRecord({
      id: `demo-case-${String(index + 1).padStart(2, "0")}`,
      name: `演示叶片-${String(index + 1).padStart(2, "0")}.svg`,
      date: date.toISOString(),
      mode: "demo",
      model: "预设交互案例，非模型推理",
      threshold: 0.5,
      detections,
      width: 1000,
      height: 680,
      reviewed,
      notes:
        index === 10
          ? "演示案例：无预设区域，用于体验空结果；不表示样本健康。"
          : "演示案例：图片、地块与标注均为示意，请练习填写复核意见。",
      sample: {
        code: `DEMO-${String(Math.floor(index / 2) + 1).padStart(2, "0")}`,
        crop: "叶片样本（示意）",
        plot: ["教学示范区 A", "教学示范区 B", "教学示范区 C"][
          Math.floor(index / 2) % 3
        ],
        batch: offset < 3 ? "演示巡检 · 本轮" : "演示巡检 · 上轮",
        collectedAt: date.toISOString(),
        timeSource: "user",
      },
      regionReviews: reviewed
        ? regionKeys(detections).map((key, i) => ({
            key,
            status: i === 1 ? "reject" : "keep",
            note:
              i === 1
                ? "演示意见：高光区域，建议补拍核对。"
                : "演示意见：保留该区域供后续观察。",
          }))
        : [],
      followUp:
        index === 0
          ? {
              status: "pending",
              reason: "演示任务：补拍叶片背面",
              dueDate: day(0),
            }
          : index === 2
            ? {
                status: "pending",
                reason: "演示任务：核对存疑区域",
                dueDate: day(-1),
              }
            : index === 4
              ? {
                  status: "pending",
                  reason: "演示任务：固定角度再次采样",
                  dueDate: day(1),
                }
              : index === 7
                ? {
                    status: "done",
                    reason: "演示任务：完成复查",
                    dueDate: day(-2),
                    note: "演示意见：已补充观察记录。",
                    linkedRecordId: "demo-case-07",
                  }
                : index === 9
                  ? {
                      status: "cancelled",
                      reason: "演示任务：重复安排已取消",
                      dueDate: day(-1),
                    }
                  : null,
    });
  });
}

// Demo records never use the personal or authenticated localStorage namespace.
export function createDemoSession(getStorage = () => sessionStorage) {
  let value = null;
  let initialized = false;
  let persistent = true;
  let recovered = false;
  const storage = {
    getItem: () => value,
    setItem: (_key, next) => {
      value = next;
      try {
        getStorage().setItem(DEMO_SESSION_KEY, next);
        persistent = true;
      } catch {
        persistent = false;
      }
    },
  };
  const reset = (now = new Date()) => {
    storage.setItem(DEMO_SESSION_KEY, JSON.stringify(createDemoRecords(now)));
    initialized = true;
  };
  return {
    storage,
    initialize(now = new Date()) {
      if (initialized) return;
      try {
        value = getStorage().getItem(DEMO_SESSION_KEY);
      } catch {
        persistent = false;
      }
      if (value !== null) {
        try {
          const records = JSON.parse(value);
          if (!Array.isArray(records) || records.length > 30) throw Error();
          const normalized = records.map(normalizeRecord);
          if (new Set(normalized.map((r) => r.id)).size !== normalized.length)
            throw Error();
          value = JSON.stringify(normalized);
        } catch {
          value = null;
          recovered = true;
        }
      }
      if (value === null) reset(now);
      initialized = true;
    },
    reset,
    status() {
      return !persistent
        ? "浏览器未允许暂存，修改仅在当前页面有效，刷新可能丢失。"
        : recovered
          ? "演示缓存无效，已重新载入样例；修改仅保留在当前标签页。"
          : "修改仅保留在当前标签页，可重置样例或退出演示。";
    },
  };
}
