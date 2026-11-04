import test from "node:test";
import assert from "node:assert/strict";
import { summarizeRecords } from "../src/dashboard.js";

const now = new Date(2026, 10, 4, 12);
const record = (id, date, mode = "model", extra = {}) => ({
  id,
  date: new Date(2026, 10, date, 10).toISOString(),
  mode,
  reviewed: false,
  detections: [{ label: "叶斑" }],
  sample: { plot: "一号温室" },
  ...extra,
});

test("dashboard separates demo/model and excludes out-of-range or future records", () => {
  const result = summarizeRecords(
    [record("a", 4), record("b", 3, "demo"), record("c", -8), record("d", 5)],
    { now },
  );
  assert.equal(result.total, 2);
  assert.equal(result.model, 1);
  assert.equal(result.demo, 1);
  assert.equal(result.regions, 2);
  assert.equal(result.timeline.length, 7);
  assert.equal(
    result.timeline.reduce((n, d) => n + d.model + d.demo, 0),
    2,
  );
  assert.deepEqual(result.labels, [["叶斑", 2]]);
  assert.equal(
    summarizeRecords(result.records, { source: "model", now }).total,
    1,
  );
});

test("dashboard treats empty ranges and review/task state independently", () => {
  assert.equal(summarizeRecords([], { days: 30, now }).timeline.length, 30);
  const result = summarizeRecords(
    [
      record("a", 4, "model", {
        reviewed: true,
        followUp: { status: "pending", reason: "补拍", dueDate: "2026-11-03" },
      }),
      record("b", 4, "demo", {
        followUp: { status: "done", reason: "完成", dueDate: "2026-11-02" },
      }),
    ],
    { now },
  );
  assert.equal(result.pending, 1);
  assert.equal(result.tasks.length, 1);
  assert.equal(result.overdue, 1);
  assert.equal(result.plots[0][1], 2);
});
