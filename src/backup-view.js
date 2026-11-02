import { backupFor, parseBackup, mergeBackup } from "./domain.js";
import { downloadBlob } from "./exports.js";
import { escapeHTML as esc } from "./record-fields.js";

function comparison(record) {
  const values = [
    ["图片", record.name],
    ["来源", record.mode === "demo" ? "预设演示" : "模型推理"],
    ["检测时间", new Date(record.date).toLocaleString("zh-CN")],
    ["模型", record.model || "未记录"],
    ["阈值", `${Math.round(record.threshold * 100)}%`],
    [
      "尺寸",
      record.width && record.height
        ? `${record.width} × ${record.height}`
        : "未记录",
    ],
    [
      "编号 / 作物",
      [record.sample.code, record.sample.crop].filter(Boolean).join(" / ") ||
        "未填写",
    ],
    [
      "地块 / 批次",
      [record.sample.plot, record.sample.batch].filter(Boolean).join(" / ") ||
        "未填写",
    ],
    [
      "采集时间",
      record.sample.collectedAt
        ? `${new Date(record.sample.collectedAt).toLocaleString("zh-CN")}（${record.sample.timeSource === "user" ? "用户填写" : "录入时间"}）`
        : "未填写",
    ],
    ["已人工查看", record.reviewed ? "是" : "否"],
    ["备注", record.notes || "无"],
    [
      "复查",
      record.followUp
        ? `${{ pending: "待复查", done: "已完成", cancelled: "已取消" }[record.followUp.status]} · ${record.followUp.dueDate || "未安排日期"} · ${record.followUp.reason}`
        : "未安排",
    ],
    ["处理说明", record.followUp?.note || "无"],
    ["关联记录", record.followUp?.linkedRecordId || "无"],
  ];
  return `<dl>${values.map(([label, value]) => `<dt>${label}</dt><dd>${esc(value)}</dd>`).join("")}</dl><p>检测区域 ${record.detections.length} 个</p>${record.detections.map((d) => `<p>${esc(d.label)} · ${(d.confidence * 100).toFixed(1)}%<br/>坐标：${d.box.map((v) => v.toFixed(4)).join(", ")}</p>`).join("")}`;
}

export function attachBackup(main, { getRecords, persist, toast, refresh }) {
  const toolbar = main.querySelector("#backup-tools");
  toolbar.innerHTML = `<button class="button outlined" id="backup-export">导出全部备份</button><button class="button outlined" id="backup-import">导入备份</button><input type="file" id="backup-file" accept=".json,application/json" hidden/>`;
  main.insertAdjacentHTML(
    "beforeend",
    '<dialog class="record-dialog" id="backup-dialog" aria-labelledby="backup-title"></dialog>',
  );
  const dialog = main.querySelector("#backup-dialog"),
    input = main.querySelector("#backup-file");
  main.querySelector("#backup-export").onclick = () =>
    downloadBlob(
      new Blob([JSON.stringify(backupFor(getRecords()), null, 2)], {
        type: "application/json",
      }),
      `fieldlens-backup-${new Date().toISOString().slice(0, 10)}.json`,
    );
  main.querySelector("#backup-import").onclick = () => input.click();
  input.onchange = async () => {
    const file = input.files[0];
    input.value = "";
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw Error("备份文件不能超过 5 MB");
      const text = await file.text();
      if (!main.contains(dialog)) return;
      const baseline = JSON.stringify(getRecords());
      const entries = parseBackup(text, getRecords());
      const labels = {
        new: "新增",
        duplicate: "重复",
        conflict: "内容冲突",
        invalid: "无效",
      };
      dialog.innerHTML = `<div class="panel-heading"><h2 id="backup-title">导入预览</h2><button class="text-button" id="backup-close">关闭</button></div><div class="dialog-body"><p>${Object.entries(
        labels,
      )
        .map(
          ([k, v]) => `${v} ${entries.filter((e) => e.kind === k).length} 条`,
        )
        .join(
          " · ",
        )}</p><p class="field-help">默认只添加新记录，冲突保留原记录。可逐条选择覆盖；不会按日期自动覆盖。原图片不包含在备份中。</p><div class="table-scroll backup-table"><table><thead><tr><th>记录</th><th>检查结果</th><th>导入方式</th></tr></thead><tbody>${entries.map((e) => `<tr><td>${esc(e.name)}${e.record ? `<small>${esc(e.record.sample.code || "未填编号")} · ${e.record.mode === "demo" ? "预设演示" : "模型推理"}</small>` : ""}</td><td>${labels[e.kind]}${e.kind === "conflict" ? `<details class="conflict-details"><summary>查看差异</summary><strong>现有记录</strong><div class="comparison-body">${comparison(e.existing)}</div><strong>备份记录</strong><div class="comparison-body">${comparison(e.record)}</div></details>` : ""}${e.message ? `<small>${esc(e.message)}</small>` : ""}</td><td>${["new", "conflict"].includes(e.kind) ? `<select data-import="${e.index}" aria-label="第 ${e.index + 1} 条导入方式"><option value="skip">保留现有 / 跳过</option><option value="${e.kind === "new" ? "add" : "replace"}" ${e.kind === "new" ? "selected" : ""}>${e.kind === "new" ? "添加" : "覆盖现有记录"}</option></select>` : "跳过"}</td></tr>`).join("") || '<tr><td colspan="3">备份中没有记录</td></tr>'}</tbody></table></div><p id="backup-error" class="error" role="alert" hidden></p><p id="backup-count" role="status"></p></div><div class="results-footer"><button class="button primary" id="backup-confirm">确认合并</button></div>`;
      const choices = () =>
        Object.fromEntries(
          [...dialog.querySelectorAll("[data-import]")].map((el) => [
            el.dataset.import,
            el.value,
          ]),
        );
      const preview = () => {
        const error = dialog.querySelector("#backup-error"),
          button = dialog.querySelector("#backup-confirm");
        error.hidden = true;
        try {
          const selected = choices(),
            merged = mergeBackup(getRecords(), entries, selected);
          const count = Object.values(selected).filter(
            (v) => v !== "skip",
          ).length;
          dialog.querySelector("#backup-count").textContent =
            `选中 ${count} 条，合并后 ${merged.length} / 30 条`;
          button.disabled = !count;
          return merged;
        } catch (e) {
          error.textContent = e.message;
          error.hidden = false;
          dialog.querySelector("#backup-count").textContent = "请调整导入选项";
          button.disabled = true;
          return null;
        }
      };
      dialog
        .querySelectorAll("[data-import]")
        .forEach((el) => (el.onchange = preview));
      dialog.querySelector("#backup-close").onclick = () => dialog.close();
      dialog.querySelector("#backup-confirm").onclick = () => {
        if (JSON.stringify(getRecords()) !== baseline) {
          toast("记录已变化，请关闭后重新导入");
          return;
        }
        const merged = preview();
        if (!merged) return;
        if (persist(merged)) {
          dialog.close();
          refresh();
          toast("备份已合并，重复与未选择的记录已跳过");
        } else {
          dialog.querySelector("#backup-error").hidden = false;
          dialog.querySelector("#backup-error").textContent =
            "保存失败，原有记录未改变。请导出备份后重试。";
        }
      };
      preview();
      dialog.showModal();
    } catch (error) {
      toast(error.message);
    }
  };
}
