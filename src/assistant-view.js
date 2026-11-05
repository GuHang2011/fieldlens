import { apiFetch } from "./access.js";
import { assistantContext } from "./review-domain.js";
import { downloadBlob } from "./exports.js";

export function assistantMarkup() {
  return `<details class="assistant-panel"><summary>AI 辅助复核 <span class="badge">通用平台接口</span></summary><p class="field-help">整理待核查项和巡检摘要。AI 仅接收下方预览中的文字及坐标，不自动附带图片、样本编号或地块；密钥由服务端持有。回答不会自动修改记录。</p><p id="ai-status" role="status">尚未检查平台配置</p><button class="button outlined" id="ai-check">检查 AI 配置</button> <a class="text-button" href="https://github.com/GuHang2011/fieldlens/blob/main/docs/AI_PLATFORM.md" target="_blank" rel="noopener">接入说明</a><label class="dialog-label" for="ai-question">需要协助的问题</label><textarea id="ai-question" maxlength="500" rows="2">请整理这条记录中需要人工核查的事项，以及下次采集应补充的信息。</textarea><div class="ai-presets"><button class="text-button" data-ai-question="请整理这条记录中需要人工核查的事项，以及下次采集应补充的信息。">复核要点</button><button class="text-button" data-ai-question="请根据已有信息写一段巡检摘要，分清原始检测和人工意见，列出尚缺的信息。">巡检摘要</button></div><details><summary>发送内容预览</summary><pre id="ai-payload"></pre><button class="text-button" id="ai-refresh">重新读取当前填写内容</button><p class="field-help">预览包含复核备注，请在发送前检查。修改表单后需重新读取，发送使用此预览快照。</p></details><div class="ai-actions"><button class="button primary" id="ai-send" disabled>发送预览内容</button><button class="button outlined" id="ai-cancel" hidden>取消等待</button></div><p id="ai-error" class="error" role="alert" hidden></p><section id="ai-answer" hidden><h4>AI 参考 · 需人工核查</h4><p id="ai-origin" class="field-help"></p><div id="ai-text"></div><button class="button outlined" id="ai-export">导出回答 TXT</button></section></details>`;
}

export function attachAssistant(
  dialog,
  getRecord,
  apiEnabled,
  { isOpen = () => dialog.open } = {},
) {
  const $ = (id) => dialog.querySelector(id);
  let context = assistantContext(getRecord()),
    request = null,
    statusRequest = null,
    answer = null,
    configured = false,
    alive = true;
  const usable = () => alive && isOpen() && dialog.isConnected;
  const setError = (message) => {
    $("#ai-error").textContent = message;
    $("#ai-error").hidden = !message;
  };
  const showPreview = () => {
    $("#ai-payload").textContent = JSON.stringify(context, null, 2);
  };
  showPreview();
  if (!apiEnabled) {
    $("#ai-status").textContent =
      "在线展示版不发送 AI 请求。请在本地或自部署服务中配置兼容平台。";
    $("#ai-check").disabled = true;
  }
  $("#ai-refresh").onclick = () => {
    try {
      context = assistantContext(getRecord());
      showPreview();
      setError("");
    } catch (e) {
      setError(e.message);
    }
  };
  $("#ai-check").onclick = async () => {
    if (!apiEnabled || request || statusRequest || !usable()) return;
    const active = new AbortController();
    statusRequest = active;
    $("#ai-check").disabled = true;
    $("#ai-send").disabled = true;
    configured = false;
    setError("");
    try {
      const response = await apiFetch("/api/assistant/status", {
        signal: AbortSignal.any([active.signal, AbortSignal.timeout(4000)]),
      });
      if (!response.ok) throw Error("无法读取 AI 配置，请检查本地服务。");
      const status = await response.json();
      if (!usable() || active.signal.aborted) return;
      configured = status.configured === true;
      $("#ai-status").textContent = configured
        ? `已配置 ${status.provider} · ${status.model}（尚未验证平台调用）`
        : "尚未配置平台。请设置服务端地址、模型和密钥后重启服务。";
      $("#ai-send").disabled = !configured;
    } catch (e) {
      if (usable() && !active.signal.aborted) {
        configured = false;
        $("#ai-send").disabled = true;
        setError("无法连接本地 AI 服务，请按接入说明启动并重试。");
      }
    } finally {
      if (statusRequest === active) statusRequest = null;
      if (usable()) $("#ai-check").disabled = false;
    }
  };
  dialog.querySelectorAll("[data-ai-question]").forEach(
    (b) =>
      (b.onclick = () => {
        $("#ai-question").value = b.dataset.aiQuestion;
      }),
  );
  const controls = (busy) => {
    for (const selector of [
      "#ai-check",
      "#ai-refresh",
      "#ai-question",
      "[data-ai-question]",
    ])
      dialog.querySelectorAll(selector).forEach((el) => (el.disabled = busy));
    $("#ai-send").disabled = busy || !configured;
    $("#ai-send").textContent = busy ? "正在整理…" : "发送预览内容";
    $("#ai-cancel").hidden = !busy;
  };
  $("#ai-send").onclick = async () => {
    if (request || statusRequest || !configured || !apiEnabled || !usable())
      return;
    const question = $("#ai-question").value.trim();
    if (!question) {
      setError("请填写需要协助的问题。");
      return;
    }
    const snapshot = { context, question };
    request = new AbortController();
    const active = request;
    setError("");
    controls(true);
    $("#ai-answer").hidden = true;
    answer = null;
    try {
      const response = await apiFetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
        signal: AbortSignal.any([active.signal, AbortSignal.timeout(40000)]),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "AI 请求失败，请稍后重试。");
      if (
        typeof data.text !== "string" ||
        !data.text.trim() ||
        data.text.length > 12000
      )
        throw Error("平台没有返回有效文字。");
      if (!usable() || active.signal.aborted) return;
      answer = { ...data, snapshot, time: new Date().toLocaleString("zh-CN") };
      $("#ai-origin").textContent =
        `${data.provider} · ${data.model} · ${answer.time} · 依据发送时的预览内容，无原图`;
      $("#ai-text").textContent = data.text;
      $("#ai-answer").hidden = false;
    } catch (e) {
      if (usable())
        setError(
          active.signal.aborted
            ? "已取消等待，平台可能仍在处理本次请求。"
            : e.name === "TimeoutError"
              ? "等待超时，请稍后重试。"
              : e.message === "Failed to fetch"
                ? "无法连接本地服务，请检查连接后重试。"
                : e.message,
        );
    } finally {
      request = null;
      if (usable()) controls(false);
    }
  };
  $("#ai-cancel").onclick = () => request?.abort();
  $("#ai-export").onclick = () => {
    if (!answer) return;
    const text = `禾镜 AI 参考（未经人工确认）\n${answer.provider} / ${answer.model}\n${answer.time}\n无原图，依据以下预览内容。\n\n${answer.text}\n\n发送内容：\n${JSON.stringify(answer.snapshot, null, 2)}`;
    downloadBlob(
      new Blob([text], { type: "text/plain;charset=utf-8" }),
      "fieldlens-ai-reference.txt",
    );
  };
  const dispose = () => {
    alive = false;
    request?.abort();
    statusRequest?.abort();
    observer.disconnect();
  };
  const observer = new MutationObserver(() => {
    if (!dialog.isConnected) {
      dispose();
    }
  });
  observer.observe(document.querySelector("#main"), { childList: true });
  dialog.addEventListener("close", dispose, { once: true });
  return dispose;
}
