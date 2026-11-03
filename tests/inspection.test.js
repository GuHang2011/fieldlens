import test from "node:test";
import assert from "node:assert/strict";
import {
  regionKeys,
  normalizeReviews,
  reviewCounts,
  comparisonWarnings,
  assistantContext,
} from "../src/review-domain.js";
import {
  normalizeRecord,
  backupFor,
  parseBackup,
  recordsCSV,
  DEMO_DETECTIONS,
} from "../src/domain.js";
import { reportHTML } from "../src/inspection-tools.js";

const record = (extra) =>
  normalizeRecord({
    id: "one",
    name: "叶.png",
    date: "2026-11-03T09:00:00+08:00",
    mode: "demo",
    threshold: 0.5,
    detections: DEMO_DETECTIONS,
    ...extra,
  });
test("reviews attach to immutable detection identity, including duplicates", () => {
  const keys = regionKeys(DEMO_DETECTIONS);
  assert.equal(regionKeys(DEMO_DETECTIONS.slice(1))[0], keys[1]);
  assert.notEqual(...regionKeys([DEMO_DETECTIONS[0], DEMO_DETECTIONS[0]]));
  const r = record({
    regionReviews: [{ key: keys[0], status: "reject", note: "需补拍" }],
  });
  assert.equal(r.detections[0].confidence, 0.946);
  assert.deepEqual(reviewCounts(r), { pending: 2, keep: 0, reject: 1 });
});
test("mismatched and malformed review identities are rejected", () => {
  const valid = {
    key: regionKeys(DEMO_DETECTIONS)[0],
    status: "keep",
    note: "",
  };
  for (const reviews of [
    [{ ...valid, key: "wrong" }],
    [valid, valid],
    [{ ...valid, status: "confirmed" }],
    [{ ...valid, note: "x".repeat(301) }],
  ])
    assert.throws(() => normalizeReviews(reviews, DEMO_DETECTIONS));
});
test("legacy records and complete backups preserve review compatibility", () => {
  const old = record({});
  assert.deepEqual(old.regionReviews, []);
  const r = record({
    regionReviews: [
      { key: regionKeys(DEMO_DETECTIONS)[1], status: "keep", note: "复核意见" },
    ],
  });
  const imported = parseBackup(JSON.stringify(backupFor([r])), []);
  assert.deepEqual(imported[0].record.regionReviews, r.regionReviews);
  assert.equal(
    parseBackup(JSON.stringify(backupFor([r])), [r])[0].kind,
    "duplicate",
  );
});
test("comparison explicitly flags mismatched conditions and demo sources", () => {
  const a = record({ sample: { code: "A", plot: "一号", crop: "水稻" } });
  const b = record({
    id: "two",
    mode: "model",
    model: "other",
    threshold: 0.7,
    sample: { code: "B", plot: "二号", crop: "番茄" },
  });
  assert.equal(comparisonWarnings(a, b).length, 6);
  assert.deepEqual(
    comparisonWarnings(
      { ...a, mode: "model" },
      { ...a, mode: "model", id: "two" },
    ),
    [],
  );
});
test("AI context excludes identifying metadata and carries review provenance", () => {
  const r = record({
    sample: { code: "private-id", plot: "private-location", crop: "番茄" },
    notes: "请复核",
    regionReviews: [
      { key: regionKeys(DEMO_DETECTIONS)[0], status: "reject", note: "模糊" },
    ],
  });
  const context = assistantContext(r),
    text = JSON.stringify(context);
  assert.equal(context.detections[0].review, "疑似误检");
  assert.match(context.source, /预设演示/);
  assert.equal(context.crop, "番茄");
  for (const hidden of ["private-id", "private-location", r.name])
    assert.ok(!text.includes(hidden));
});
test("report separates demo and model groups, counts selected records and escapes input", () => {
  const html = reportHTML([
    record({ name: '<img onerror="alert(1)">', notes: "<script>bad</script>" }),
    record({ id: "two", mode: "model", detections: [], reviewed: true }),
  ]);
  assert.match(html, /本次选定 2 条/);
  assert.match(html, /已人工查看 1 条/);
  assert.match(html, /预设演示记录（非模型推理）/);
  assert.match(html, /不能据此判断作物健康/);
  assert.ok(!html.includes("<img ") && !html.includes("<script>"));
});
test("CSV includes original counts and separate escaped manual review notes", () => {
  const csv = recordsCSV([
    record({
      regionReviews: [
        {
          key: regionKeys(DEMO_DETECTIONS)[0],
          status: "reject",
          note: "=SUM(1,2)",
        },
      ],
    }),
  ]);
  assert.match(csv, /人工保留数/);
  assert.match(csv, /疑似误检/);
  assert.match(csv, /=SUM\(1,2\)/);
});
