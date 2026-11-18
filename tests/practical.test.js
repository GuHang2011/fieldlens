import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeRecord,
  backupFor,
  parseBackup,
  mergeBackup,
  filterRecords,
  localDay,
  matchesTask,
  taskLabel,
  recordsCSV,
  BACKUP_MAX_BYTES,
} from "../src/domain.js";
import { regionKeys } from "../src/review-domain.js";
const record = (extra = {}) => ({
  id: "r1",
  name: "leaf.png",
  date: "2026-11-02T10:00:00Z",
  threshold: 0.5,
  mode: "demo",
  detections: [],
  ...extra,
});
const task = (extra = {}) => ({
  status: "pending",
  reason: "需要补拍",
  dueDate: "2026-11-02",
  note: "",
  linkedRecordId: "",
  ...extra,
});
test("legacy records get empty metadata without fabricating sampling dates", () => {
  const result = normalizeRecord(record());
  assert.equal(result.sample.collectedAt, "");
  assert.equal(result.followUp, null);
  assert.equal(result.reviewed, false);
});
test("backup round trip retains sample, task, review and provenance", () => {
  const original = normalizeRecord(
    record({
      reviewed: true,
      notes: "已查看",
      sample: {
        code: "A01",
        crop: "番茄",
        plot: "温室A",
        batch: "第一批",
        collectedAt: "2026-11-02T08:15:00+08:00",
        timeSource: "user",
      },
      followUp: task({ linkedRecordId: "r2" }),
    }),
  );
  const entries = parseBackup(JSON.stringify(backupFor([original])), []);
  assert.equal(entries[0].kind, "new");
  assert.deepEqual(mergeBackup([], entries, { 0: "add" }), [original]);
});
test("restoring a complete backup preserves the saved record order", () => {
  const original = ["newest", "middle", "oldest"].map((id) =>
    normalizeRecord(record({ id })),
  );
  const entries = parseBackup(JSON.stringify(backupFor(original)), []);
  const restored = mergeBackup([], entries, { 0: "add", 1: "add", 2: "add" });
  assert.deepEqual(restored, original);
});
test("a maximum-size legal backup remains restorable after UTF-8 encoding and JSON escaping", () => {
  // Control characters require six JSON bytes per character. Region identities
  // embed escaped detection labels again, making them larger than plain CJK.
  const label = "\u0000".repeat(200);
  const detections = Array.from({ length: 300 }, () => ({
    label,
    confidence: 0.12345678901234568,
    box: [0.0000010000000000000002, 0.0000010000000000000002, 0.9999999999999999, 0.9999999999999999],
  }));
  const regionReviews = regionKeys(detections).map((key) => ({
    key, status: "keep", note: "\u0000".repeat(300),
  }));
  const original = Array.from({ length: 30 }, (_, index) => normalizeRecord(record({
    id: String(index).padEnd(100, "\u0000"),
    name: "\u0000".repeat(255),
    model: "\u0000".repeat(200),
    notes: "\u0000".repeat(1000),
    detections,
    regionReviews,
    sample: {
      code: "\u0000".repeat(80), crop: "\u0000".repeat(80),
      plot: "\u0000".repeat(100), batch: "\u0000".repeat(100),
      collectedAt: "2026-11-18T01:02:03.456Z", timeSource: "user",
    },
    followUp: task({ reason: "\u0000".repeat(200), note: "\u0000".repeat(1000), linkedRecordId: "\u0000".repeat(100) }),
  })));
  const text = JSON.stringify(backupFor(original), null, 2);
  assert.ok(Buffer.byteLength(text) > 5 * 1024 * 1024);
  assert.ok(Buffer.byteLength(text) <= BACKUP_MAX_BYTES);
  const entries = parseBackup(text, []);
  assert.ok(entries.every((entry) => entry.kind === "new"));
  const choices = Object.fromEntries(entries.map((entry) => [entry.index, "add"]));
  assert.deepEqual(mergeBackup([], entries, choices), original);
});
test("mixed imports prepend additions in backup order and replace existing records in place", () => {
  const existing = ["local-first", "local-second"].map((id) =>
    normalizeRecord(record({ id })),
  );
  const before = JSON.stringify(existing);
  const entries = parseBackup(
    JSON.stringify(backupFor([
      record({ id: "new-first" }),
      record({ id: "local-second", notes: "replaced" }),
      record({ id: "skip-new" }),
      record({ id: "new-second" }),
      record({ id: "local-first" }),
    ])),
    existing,
  );
  const result = mergeBackup(existing, entries, {
    0: "add", 1: "replace", 2: "skip", 3: "add",
  });
  assert.deepEqual(result.map((item) => item.id), [
    "new-first", "new-second", "local-first", "local-second",
  ]);
  assert.equal(result[3].notes, "replaced");
  assert.equal(JSON.stringify(existing), before);
});
test("import reports duplicate conflict invalid and file duplicate independently", () => {
  const data = backupFor([
    record(),
    record({ id: "r2" }),
    record({ id: "r3" }),
  ]);
  data.records.push(
    { ...record(), id: "bad", mode: "unknown" },
    record({ id: "r3" }),
  );
  const entries = parseBackup(JSON.stringify(data), [
    record(),
    record({ id: "r2", notes: "local" }),
  ]);
  assert.deepEqual(
    entries.map((e) => e.kind),
    ["duplicate", "conflict", "new", "invalid", "invalid"],
  );
  const kept = mergeBackup(
    [record(), record({ id: "r2", notes: "local" })],
    entries,
    { 2: "add" },
  );
  assert.equal(kept.find((r) => r.id === "r2").notes, "local");
  const replaced = mergeBackup(kept, entries, { 1: "replace" });
  assert.equal(replaced.find((r) => r.id === "r2").notes, "");
});
test("capacity is checked before merge, updates at full capacity remain allowed", () => {
  const existing = Array.from({ length: 30 }, (_, i) =>
    record({ id: String(i) }),
  );
  const before = JSON.stringify(existing);
  const entries = parseBackup(
    JSON.stringify(
      backupFor([record({ id: "new" }), record({ id: "0", notes: "updated" })]),
    ),
    existing,
  );
  assert.throws(() => mergeBackup(existing, entries, { 0: "add" }), /超过 30/);
  assert.equal(JSON.stringify(existing), before);
  assert.equal(
    mergeBackup(existing, entries, { 1: "replace" }).find((r) => r.id === "0")
      .notes,
    "updated",
  );
});
test("bad envelopes and invalid task dates cannot enter history", () => {
  assert.throws(() => parseBackup("{", []), /JSON/);
  assert.throws(
    () =>
      parseBackup(JSON.stringify({ ...backupFor([]), schemaVersion: 2 }), []),
    /版本/,
  );
  assert.throws(() => parseBackup(" ".repeat(BACKUP_MAX_BYTES + 1), []), /64 MiB/);
  assert.throws(
    () =>
      normalizeRecord(record({ followUp: task({ dueDate: "2026-02-30" }) })),
    /日期/,
  );
  assert.throws(
    () => normalizeRecord(record({ followUp: task({ status: "unknown" }) })),
    /任务/,
  );
});
test("legacy single-report import supported but missing provenance rejected", () => {
  const old = { ...record(), application: "禾镜 FieldLens", version: "1.1.0" };
  assert.equal(parseBackup(JSON.stringify(old), [])[0].kind, "new");
  delete old.mode;
  assert.equal(parseBackup(JSON.stringify(old), [])[0].kind, "invalid");
});
test("tasks use local calendar boundaries independently of reviewed flag", () => {
  assert.equal(matchesTask(task(), "today", "2026-11-02"), true);
  assert.equal(matchesTask(task(), "overdue", "2026-11-03"), true);
  assert.equal(
    matchesTask(task({ status: "done" }), "overdue", "2026-11-03"),
    false,
  );
  assert.equal(
    matchesTask(task({ dueDate: "" }), "overdue", "2026-11-03"),
    false,
  );
  assert.equal(taskLabel(task({ dueDate: "" })), "待复查 · 未安排日期");
  assert.equal(
    filterRecords(
      [normalizeRecord(record({ reviewed: true, followUp: task() }))],
      { task: "pending" },
    ).length,
    1,
  );
});
test("metadata search and date range use sampling time with legacy fallback", () => {
  const day = localDay(new Date("2026-11-01T12:00:00Z"));
  const records = [
    normalizeRecord(
      record({
        sample: {
          code: "A01",
          plot: "A区",
          batch: "11月",
          collectedAt: "2026-11-01T12:00:00Z",
          timeSource: "user",
        },
      }),
    ),
    normalizeRecord(record({ id: "old" })),
  ];
  assert.equal(
    filterRecords(records, {
      query: "a01 11月",
      plot: "A区",
      batch: "11月",
      from: day,
      to: day,
    }).length,
    1,
  );
  assert.equal(
    filterRecords(records, { from: "2026-12-01", to: "2026-01-01" }).length,
    0,
  );
});
test("new CSV fields preserve formula escaping and task details", () => {
  const csv = recordsCSV([
    normalizeRecord(
      record({
        sample: { code: "=CMD()", plot: "A区" },
        followUp: task({ note: "+formula" }),
      }),
    ),
  ]);
  assert.ok(csv.includes("'=CMD()"));
  assert.ok(csv.includes("'+formula"));
  assert.ok(csv.includes("需要补拍"));
  assert.ok(csv.includes("样本编号"));
});
