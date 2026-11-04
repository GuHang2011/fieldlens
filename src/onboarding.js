const steps = [
  {
    title: "先选择一张图片",
    text: "在图像检测页选择或拖入图片，也可点击“摄像头拍照”，预览确认后使用。在线展示可点击“加载示例”；示例采用预设标注，不代表模型识别效果。",
    target: "#dropzone",
    route: "workspace",
    action: "前往图像检测",
  },
  {
    title: "设置参数，查看检测区域",
    text: "检查检测方式与置信度阈值，再点击检测。自己的图片需要连接本地 YOLO；点击结果行可高亮对应区域。",
    target: ".settings",
    route: "workspace",
    action: "查看检测参数",
  },
  {
    title: "补充信息并保存",
    text: "填写样本编号、地块与采集时间，点击“保存记录”。保存的是检测数据和备注，原图不会写入记录；记得按需导出备份。",
    target: "#save",
    route: "workspace",
    action: "查看保存入口",
  },
  {
    title: "复核结果，安排后续观察",
    text: "打开检测记录中的详情，可逐区域标记人工意见，填写复查日期并关联后续记录。切换详情标签会保留草稿，完成后统一保存。",
    target: ".history-panel",
    route: "history",
    action: "前往检测记录",
  },
  {
    title: "查看大屏与报告",
    text: "大屏按最近 7 天或 30 天汇总本机记录；模型与演示数据分开标注。记录页可以按筛选结果生成报告，并打印为 PDF。",
    target: ".screen-board",
    route: "dashboard",
    action: "前往数据大屏",
  },
  {
    title: "按需接入 AI 平台",
    text: "检测记录 → 详情 → AI 辅助，可核对发送预览后整理复核要点。平台密钥由服务端配置。这里的操作引导不调用 AI，也不上传数据。",
    target: ".guide-panel",
    route: "guide",
    action: "查看接入指南",
  },
];

export function createOnboarding({ navigate }) {
  let index = 0,
    dialog,
    highlight,
    returnFocus,
    locateTimer;
  const key = "fieldlens.guide.v1";
  function clearHighlight() {
    clearTimeout(locateTimer);
    highlight?.classList.remove("guide-highlight");
    highlight = null;
  }
  function close() {
    clearHighlight();
    dialog?.close();
    dialog?.remove();
    dialog = null;
    returnFocus?.isConnected && returnFocus.focus();
  }
  function paint() {
    const step = steps[index];
    dialog.innerHTML = `<div class="onboarding-head"><span>操作引导 · ${index + 1} / ${steps.length}</span><button class="text-button" id="guide-close" aria-label="关闭操作引导">关闭</button></div><div class="guide-progress" aria-hidden="true">${steps.map((_, i) => `<i class="${i <= index ? "active" : ""}"></i>`).join("")}</div><h2 id="onboarding-title">${step.title}</h2><p>${step.text}</p><button class="button outlined" id="guide-locate">${step.action} ↗</button><div class="onboarding-footer"><button class="button outlined" id="guide-previous" ${index === 0 ? "disabled" : ""}>上一步</button><button class="button primary" id="guide-next">${index === steps.length - 1 ? "完成引导" : "下一步"}</button></div>`;
    dialog.querySelector("#guide-close").onclick = close;
    dialog.querySelector("#guide-previous").onclick = () => {
      clearHighlight();
      index--;
      paint();
      dialog.querySelector("#guide-next").focus();
    };
    dialog.querySelector("#guide-next").onclick = () => {
      clearHighlight();
      if (index === steps.length - 1) {
        try {
          localStorage.setItem(key, "done");
        } catch {}
        close();
        window.dispatchEvent(new Event("fieldlens:guide-done"));
      } else {
        index++;
        paint();
        dialog.querySelector("#guide-next").focus();
      }
    };
    dialog.querySelector("#guide-locate").onclick = () => {
      clearHighlight();
      if (!navigate(step.route)) return;
      locateTimer = setTimeout(() => {
        if (!dialog?.open) return;
        highlight = document.querySelector(step.target);
        highlight?.classList.add("guide-highlight");
        highlight?.scrollIntoView({ block: "center", behavior: "instant" });
      }, 50);
    };
  }
  return {
    open() {
      if (dialog) return;
      returnFocus = document.activeElement;
      index = 0;
      dialog = document.createElement("dialog");
      dialog.className = "onboarding-dialog";
      dialog.setAttribute("aria-labelledby", "onboarding-title");
      dialog.addEventListener("cancel", (e) => {
        e.preventDefault();
        close();
      });
      document.body.append(dialog);
      paint();
      dialog.showModal();
    },
    close,
    completed() {
      try {
        return localStorage.getItem(key) === "done";
      } catch {
        return false;
      }
    },
  };
}
