import test from "node:test";
import assert from "node:assert/strict";
import {
  DEMO_DETECTIONS,
  visibleDetections,
  validateResult,
  loadHistory,
  reportFor,
  normalizeRecord,
  filterRecords,
  recordsCSV,
} from "../src/domain.js";

test("threshold boundary and empty detections are handled", () => {
  assert.equal(visibleDetections(DEMO_DETECTIONS, 0.873).length, 2);
  assert.equal(visibleDetections(DEMO_DETECTIONS, 0.99).length, 0);
});
test("malformed model output is rejected before rendering", () => {
  assert.deepEqual(validateResult({ detections: [] }), []);
  for (const value of [
    null,
    {},
    { detections: [{ label: "leaf", confidence: NaN, box: [0, 0, 1, 1] }] },
    { detections: [{ label: "leaf", confidence: 0.9, box: [0.9, 0, 0.1, 1] }] },
    { detections: [{ label: "leaf", confidence: 0.9, box: [0, 0, 2, 1] }] },
  ])
    assert.throws(() => validateResult(value));
});
test("corrupt or inaccessible local storage does not break the workspace", () => {
  assert.deepEqual(loadHistory({ getItem: () => "{broken" }), []);
  assert.deepEqual(
    loadHistory({
      getItem: () => {
        throw Error("blocked");
      },
    }),
    [],
  );
  assert.deepEqual(loadHistory({ getItem: () => '[{"id":"x"}]' }), []);
});
test("demo report explicitly preserves its synthetic provenance", () => {
  const report = reportFor({ mode: "demo", detections: DEMO_DETECTIONS });
  assert.match(report.notice, /并非模型推理/);
});

const record = (extra = {}) => ({
  id: "sample-1",
  name: "叶片.png",
  date: "2026-11-01T00:00:00.000Z",
  mode: "demo",
  threshold: 0.5,
  detections: DEMO_DETECTIONS,
  ...extra,
});

test("legacy history survives malformed neighbors and duplicate IDs", () => {
  const result = loadHistory({
    getItem: () =>
      JSON.stringify([
        null,
        record({ date: "bad" }),
        record(),
        record(),
        record({ id: "sample-2", mode: "model" }),
      ]),
  });
  assert.equal(result.length, 2);
  assert.equal(result[0].notes, "");
  assert.equal(result[0].reviewed, false);
  assert.equal(result[1].mode, "model");
});

test("record validation rejects invalid provenance and dimensions are optional", () => {
  assert.throws(() => normalizeRecord(record({ mode: "unknown" })));
  assert.throws(() => normalizeRecord(record({ date: 123 })));
  assert.throws(() => normalizeRecord(record({ detections: [null] })));
  assert.equal(normalizeRecord(record({ width: -1 })).width, null);
  assert.equal(
    normalizeRecord(record({ notes: "a".repeat(2000) })).notes.length,
    1000,
  );
});

test("history search combines source, review state and case-insensitive terms", () => {
  const records = [
    record({ notes: "Plot A 样本", reviewed: true }),
    record({ id: "2", mode: "model", notes: "Plot B 样本" }),
  ];
  assert.equal(
    filterRecords(records, {
      query: "plot a 叶斑",
      mode: "demo",
      review: "reviewed",
    }).length,
    1,
  );
  assert.equal(
    filterRecords(records, { mode: "model", review: "pending" }).length,
    1,
  );
  assert.equal(filterRecords(records, { query: "missing" }).length, 0);
});

test("CSV quotes commas and newlines and neutralizes spreadsheet formulas", () => {
  const csv = recordsCSV([
    record({ name: '=HYPERLINK("x")', notes: 'line one,\n"quoted"' }),
  ]);
  assert.ok(csv.startsWith("\ufeff"));
  assert.ok(csv.includes('"\'=HYPERLINK(""x"")"'));
  assert.ok(csv.includes('"line one,\n""quoted"""'));
  assert.ok(csv.includes("预设演示（非模型推理）"));
  assert.ok(
    recordsCSV([record({ notes: "  +SUM(A1:A2)" })]).includes("'  +SUM"),
  );
});

test("export provenance cannot be overwritten by imported metadata", () => {
  const report = reportFor(
    record({ application: "Other", version: "fake", notice: "real inference" }),
  );
  assert.equal(report.application, "禾镜 FieldLens");
  assert.equal(report.version, "1.2.0");
  assert.match(report.notice, /并非模型推理/);
});
