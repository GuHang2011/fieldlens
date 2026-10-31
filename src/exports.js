import { reportFor, recordsCSV } from "./domain.js";

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadJSON(record) {
  downloadBlob(
    new Blob([JSON.stringify(reportFor(record), null, 2)], {
      type: "application/json",
    }),
    `fieldlens-${record.id.slice(0, 8)}.json`,
  );
}

export function downloadCSV(records) {
  downloadBlob(
    new Blob([recordsCSV(records)], { type: "text/csv;charset=utf-8" }),
    "fieldlens-records.csv",
  );
}

export async function downloadAnnotatedImage(url, record) {
  const image = new Image();
  image.src = url;
  await image.decode();
  const scale = Math.min(
    1,
    2560 / Math.max(image.naturalWidth, image.naturalHeight),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(320, Math.round(image.naturalWidth * scale));
  const imageWidth = Math.round(image.naturalWidth * scale);
  const imageHeight = Math.round(image.naturalHeight * scale);
  const offset = (canvas.width - imageWidth) / 2;
  canvas.height = imageHeight + 60;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("当前浏览器不支持图片导出");
  ctx.fillStyle = "#f5f7fa";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, offset, 0, imageWidth, imageHeight);
  const fontSize = Math.max(12, Math.round(imageWidth / 55));
  ctx.font = `600 ${fontSize}px sans-serif`;
  ctx.lineWidth = Math.max(2, imageWidth / 450);
  record.detections.forEach((item, index) => {
    const [x1, y1, x2, y2] = item.box;
    const x = offset + x1 * imageWidth,
      y = y1 * imageHeight;
    ctx.strokeStyle = "#409eff";
    ctx.strokeRect(x, y, (x2 - x1) * imageWidth, (y2 - y1) * imageHeight);
    const label = `${index + 1} ${item.label.slice(0, 24)} ${(item.confidence * 100).toFixed(1)}%`;
    const width = Math.min(canvas.width, ctx.measureText(label).width + 12);
    const labelX = Math.min(x, canvas.width - width);
    const labelY = Math.max(0, y - fontSize - 10);
    ctx.fillStyle = "#2469ae";
    ctx.fillRect(labelX, labelY, width, fontSize + 10);
    ctx.fillStyle = "#fff";
    ctx.fillText(label, labelX + 6, labelY + fontSize + 2, width - 12);
  });
  ctx.fillStyle = "#303133";
  ctx.font = "12px sans-serif";
  ctx.fillText(
    `FieldLens | ${record.mode === "demo" ? "演示标注，非模型推理" : "模型输出，需人工复核"}`,
    12,
    imageHeight + 23,
    canvas.width - 24,
  );
  ctx.fillText(
    `阈值 ${Math.round(record.threshold * 100)}% | ${record.detections.length} 个区域 | ${new Date(record.date).toLocaleString("zh-CN")}`,
    12,
    imageHeight + 44,
    canvas.width - 24,
  );
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw Error("图片导出失败");
  downloadBlob(blob, `fieldlens-${record.id.slice(0, 8)}-annotated.png`);
}
