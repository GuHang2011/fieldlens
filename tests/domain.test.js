import test from "node:test";
import assert from "node:assert/strict";
import {
  DEMO_DETECTIONS,
  visibleDetections,
  validateResult,
  loadHistory,
  reportFor,
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
