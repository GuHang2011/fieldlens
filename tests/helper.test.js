import test from "node:test";
import assert from "node:assert/strict";
import { findHelp, localReview, localOverview } from "../src/helper-domain.js";
import { createDemoRecords } from "../src/demo-session.js";

const now = new Date(2026, 10, 5, 12);
test("built-in help finds camera, report and compatible AI instructions and admits unknown questions", () => {
  assert.equal(findHelp("摄像头权限")[0].id, "camera");
  assert.equal(findHelp("导出PDF报告")[0].id, "report");
  assert.equal(findHelp("怎么接入 DeepSeek 平台")[0].id, "ai");
  assert.deepEqual(findHelp("明天出门带伞吗"), []);
  assert.equal(findHelp("").length, 8);
});
test("local checklist preserves evidence and distinguishes empty detections from health", () => {
  const records = createDemoRecords(now);
  const before = JSON.stringify(records);
  const zero = localReview(
    records.find((r) => !r.detections.length),
    now,
  );
  assert.match(zero, /没有检测区域，不能据此判断样本健康/);
  assert.match(zero, /预设演示，非模型推理/);
  assert.match(zero, /未调用 AI/);
  const record = structuredClone(records[0]);
  record.sample.code = "";
  record.sample.plot = "";
  const text = localReview(record, now);
  assert.match(text, /尚缺 样本编号、地块/);
  assert.match(text, /今日待复查/);
  assert.match(text, /待确认 1/);
  assert.equal(JSON.stringify(records), before);
  assert.match(localReview(null), /尚未选择记录/);
});
test("weekly overview separates preset and model work and keeps task counts independent of review", () => {
  const records = createDemoRecords(now);
  records.push({ ...records[0], id: "model", mode: "model", reviewed: true });
  records.push({
    ...records[0],
    id: "old",
    date: new Date(2026, 9, 20).toISOString(),
  });
  records.push({
    ...records[0],
    id: "future",
    date: new Date(2026, 10, 10).toISOString(),
  });
  const text = localOverview(records, now);
  assert.match(text, /本次范围内 13 条/);
  assert.match(text, /模型记录 1 条/);
  assert.match(text, /预设演示 12 条/);
  assert.match(text, /今日 2 条、逾期 1 条/);
  assert.match(text, /不代表病害严重度/);
  assert.match(localOverview([], now), /当前范围没有记录/);
});
