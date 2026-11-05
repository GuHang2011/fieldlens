import { localDay, matchesTask, taskLabel } from "./domain.js";
import { reviewCounts } from "./review-domain.js";

export const HELP_TOPICS = [
  {
    id: "start",
    title: "怎样体验完整演示？",
    keywords: ["演示", "体验", "开始", "入门", "账号", "密码", "登录"],
    text: "在线演示中心无需账号和密码。进入后使用独立空间中的 12 条预置案例，体验检测、复核、报告与大屏。真实部署的账号由管理员创建。",
    route: "demo",
    action: "打开演示中心",
  },
  {
    id: "camera",
    title: "怎样拍照或上传图片？",
    keywords: [
      "拍照",
      "摄像头",
      "相机",
      "权限",
      "照片",
      "上传",
      "图片",
      "camera",
    ],
    text: "在图像检测页选择 JPG、PNG、WebP，或点击摄像头拍照。允许浏览器权限，拍摄后确认使用；可重拍或选择系统相机。直接取景需要 HTTPS 或 localhost，确认照片不会自动上传。",
    route: "workspace",
    action: "前往图像检测",
  },
  {
    id: "model",
    title: "为什么自己的图片不能在线识别？",
    keywords: [
      "识别",
      "检测",
      "yolo",
      "模型",
      "服务",
      "连接",
      "阈值",
      "置信度",
    ],
    text: "GitHub Pages 支持预览和固定示例，自己的图片需要连接本地 YOLO 服务并配置授权目标检测权重。置信度用于筛选候选区域，不是病害严重程度；未检出区域也不能判断样本健康。",
    route: "guide",
    action: "查看模型运行指南",
  },
  {
    id: "review",
    title: "如何复核区域和安排复查？",
    keywords: ["复核", "复查", "待办", "逾期", "误检", "意见", "对比"],
    text: "在检测记录中打开详情，在区域复核页标记待确认、保留或疑似误检，在复查安排页填写原因和日期后保存。已查看和复查已完成分别记录；比较两次记录时需核对来源、阈值和样本。",
    route: "history",
    action: "查看检测记录",
  },
  {
    id: "report",
    title: "怎样导出巡检报告？",
    keywords: ["报告", "导出", "pdf", "打印", "csv", "汇报"],
    text: "先在检测记录页筛选所需记录，再点击生成巡检报告。填写学院或课程名称，核对预览后打印或保存为 PDF。记录 CSV 和完整 JSON 备份在列表工具栏，演示来源会保留。",
    route: "history",
    action: "前往记录与报告",
  },
  {
    id: "backup",
    title: "记录保存在哪里，怎样备份？",
    keywords: ["备份", "恢复", "记录", "保存", "数据", "丢失", "容量", "同步"],
    text: "个人记录保存在当前浏览器，最多 30 条，满额后停止新增。完整 JSON 备份可手动迁移，导入前会检查重复与冲突；不包含原图。演示空间只在当前标签页暂存，可重置，退出后回到个人记录。",
    route: "history",
    action: "前往备份入口",
  },
  {
    id: "screen",
    title: "怎样投屏、换肤和退出全屏？",
    keywords: [
      "大屏",
      "投屏",
      "全屏",
      "视距",
      "轮播",
      "换肤",
      "主题",
      "深色",
      "夜间",
    ],
    text: "右上角换肤可预览四种配色并跟随系统。数据大屏支持标准、远距、超远字号；专注展示隐藏导航，可开启双屏轮播。Esc 或退出展示可返回，设置区可调整来源和日期。",
    route: "dashboard",
    action: "打开数据大屏",
  },
  {
    id: "ai",
    title: "怎样接入 DeepSeek 等 AI 平台？",
    keywords: ["ai", "deepseek", "平台", "密钥", "key", "助手", "配置", "接口"],
    text: "在 Python 服务端设置 FIELDLENS_AI_BASE_URL、FIELDLENS_AI_MODEL、FIELDLENS_AI_API_KEY，重启服务。在平台 AI 页检查配置，核对预览后发送。使用兼容 Chat Completions 的文字接口；密钥只放在服务端，平台不会自动收到原图。",
    route: "guide",
    action: "查看 AI 接入指南",
  },
];

export function findHelp(query) {
  const text = String(query)
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .slice(0, 500);
  if (!text) return HELP_TOPICS;
  return HELP_TOPICS.map((topic) => ({
    topic,
    score: topic.keywords.filter((word) => text.includes(word)).length,
  }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((item) => item.topic);
}

export function localReview(record, now = new Date()) {
  if (!record)
    return "尚未选择记录。先保存一次检测，或在演示中心体验预置案例。";
  const counts = reviewCounts(record);
  const missing = [
    ["样本编号", record.sample?.code],
    ["作物名称", record.sample?.crop],
    ["地块", record.sample?.plot],
    ["采集时间", record.sample?.collectedAt],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  const source =
    record.mode === "demo" ? "预设演示，非模型推理" : "模型输出，需人工复核";
  return [
    "复核清单 · 本地规则整理（未调用 AI）",
    `记录：${record.name}`,
    `来源：${source}`,
    `记录时间：${new Date(record.date).toLocaleString("zh-CN")}`,
    `阈值：${Math.round(record.threshold * 100)}%；原始区域 ${record.detections.length} 个。`,
    `逐区域意见：待确认 ${counts.pending}，保留 ${counts.keep}，疑似误检 ${counts.reject}。`,
    `整条记录：${record.reviewed ? "已人工查看" : "待人工查看"}；该状态不代表复查已完成。`,
    "",
    "建议核查：",
    record.detections.length
      ? counts.pending
        ? `• 还有 ${counts.pending} 个区域未确认，逐一对照原始图片填写意见。`
        : "• 当前区域均已填写意见，核对是否需要补充说明。"
      : "• 当前没有检测区域，不能据此判断样本健康；请核对原图、拍摄质量和模型适用范围。",
    ...(counts.reject
      ? [
          `• ${counts.reject} 个区域标为疑似误检，建议补拍或核对高光、遮挡与边缘。`,
        ]
      : []),
    missing.length
      ? `• 尚缺 ${missing.join("、")}，按实际采集情况补充。`
      : "• 样本基本字段已填写，请核对其真实性。",
    record.followUp
      ? `• 复查任务：${taskLabel(record.followUp, localDay(now))}${record.followUp.dueDate ? `（${record.followUp.dueDate}）` : ""}。原因：${record.followUp.reason}`
      : "• 未安排复查，需要再次观察时可填写原因和日期。",
    "",
    "仅依据所选记录快照整理，未查看原图，也未修改检测框、意见或任务。",
  ].join("\n");
}

export function localOverview(records, now = new Date()) {
  const days = new Set(
    Array.from({ length: 7 }, (_, index) => {
      const day = new Date(now);
      day.setDate(day.getDate() - index);
      return localDay(day);
    }),
  );
  const selected = records.filter((record) =>
    days.has(localDay(new Date(record.date))),
  );
  const demo = selected.filter((record) => record.mode === "demo");
  const model = selected.filter((record) => record.mode === "model");
  return [
    "近 7 天巡检概览 · 本地规则整理（未调用 AI）",
    `统计截止：${now.toLocaleString("zh-CN")}；按记录创建日期统计。`,
    `当前空间共 ${records.length} 条记录，本次范围内 ${selected.length} 条。`,
    ...(!selected.length
      ? ["当前范围没有记录。可调整记录日期，或从演示中心加载案例。"]
      : [
          `模型记录 ${model.length} 条，包含 ${model.reduce((n, r) => n + r.detections.length, 0)} 个区域。`,
          `预设演示 ${demo.length} 条，包含 ${demo.reduce((n, r) => n + r.detections.length, 0)} 个区域；不计入模型结果。`,
          `待人工查看 ${selected.filter((r) => !r.reviewed).length} 条。`,
          `待复查 ${selected.filter((r) => matchesTask(r.followUp, "pending", localDay(now))).length} 条；其中今日 ${selected.filter((r) => matchesTask(r.followUp, "today", localDay(now))).length} 条、逾期 ${selected.filter((r) => matchesTask(r.followUp, "overdue", localDay(now))).length} 条。`,
          "下一步：先筛选今日和逾期待办，再核对待确认区域，完成后生成巡检报告。",
        ]),
    "",
    "以上为记录与工作量统计，不代表病害严重度、患病率或模型准确率。未自动修改记录。",
  ].join("\n");
}
