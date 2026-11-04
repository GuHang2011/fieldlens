const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

export function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers);
  headers.set("X-FieldLens-Request", "1");
  return fetch(url, { ...options, headers, credentials: "same-origin" }).then(
    (response) => {
      if (response.status === 401)
        window.dispatchEvent(new Event("fieldlens:login-required"));
      return response;
    },
  );
}

export function createAccess(apiEnabled) {
  const access = {
    enabled: false,
    user: null,
    unavailable: false,
    expired: false,
  };
  const notifySession = () => {
    try {
      localStorage.setItem("fieldlens.auth.changed", crypto.randomUUID());
    } catch {}
  };
  access.initialize = async () => {
    if (!apiEnabled) return;
    try {
      const response = await apiFetch("/api/auth/session", {
        signal: AbortSignal.timeout(4000),
      });
      if (!response.ok) throw Error();
      const data = await response.json();
      if (typeof data.enabled !== "boolean") throw Error();
      access.enabled = data.enabled;
      access.user =
        data.enabled &&
        typeof data.user?.id === "string" &&
        typeof data.user.name === "string"
          ? data.user
          : null;
    } catch {
      access.unavailable = true;
    }
  };
  access.historyKey = () =>
    access.user
      ? `fieldlens.history.user.${access.user.id}`
      : "fieldlens.history";
  access.storage = {
    getItem: () => localStorage.getItem(access.historyKey()),
    setItem: (_key, value) => localStorage.setItem(access.historyKey(), value),
  };
  access.label = () =>
    access.user
      ? access.user.name
      : access.unavailable
        ? "登录服务未连接"
        : access.enabled
          ? "未登录"
          : apiEnabled
            ? "本机工作区"
            : "演示访客";
  access.logout = async () => {
    const response = await apiFetch("/api/auth/logout", {
      method: "POST",
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw Error("退出失败，请检查服务连接后重试。");
    notifySession();
    location.hash = "login";
    location.reload();
  };
  access.renderLogin = (main) => {
    const signedIn = access.user && !access.expired;
    main.innerHTML = `<section class="login-layout"><div class="login-story"><span class="login-eyebrow">FIELDLENS / 禾镜</span><h1>把每次观察<br>留在巡检记录里。</h1><p>检测图片、核查区域、安排复查。<br>从一次记录，接到下一次巡检。</p><div class="login-specimen"><img src="./specimen.svg" alt="原创植物示意插画"/><span>作物视觉巡检工作台</span></div></div><section class="login-card" aria-labelledby="login-title"><div class="login-brand"><img src="./favicon.svg" alt=""/><strong>禾镜 FieldLens</strong></div><h2 id="login-title">${signedIn ? "当前账号" : "欢迎使用"}</h2><p class="field-help">${signedIn ? `已登录为 ${esc(access.user.name)}（${esc(access.user.username)}）` : apiEnabled ? "使用管理员分配的账号登录。" : "在线展示可直接体验，真实账号登录需部署服务。"}</p>${signedIn ? '<a class="button primary" href="#workspace">返回工作台</a>' : `<form id="login-form"><label for="login-username">账号</label><input id="login-username" name="username" autocomplete="username" maxlength="40" required ${!apiEnabled || !access.enabled ? "disabled" : ""}/><label for="login-password">密码</label><div class="password-field"><input id="login-password" name="password" type="password" autocomplete="current-password" maxlength="128" required ${!apiEnabled || !access.enabled ? "disabled" : ""}/><button type="button" id="password-toggle" aria-label="显示密码" ${!apiEnabled || !access.enabled ? "disabled" : ""}>显示</button></div><p class="login-help">账号开通、停用或密码重置，请联系管理员。</p><p id="login-error" class="error" role="alert" hidden></p><button class="button primary" id="login-submit" type="submit" ${!access.enabled ? "disabled" : ""}>登录工作台</button></form>`}<div class="login-mode-note">${access.enabled ? "账号分别使用本机记录空间；记录不会自动跨设备同步。" : apiEnabled ? (access.unavailable ? "登录服务暂时无法连接。请检查服务后重试。" : "当前服务未开启账号验证。管理员可按部署说明启用。") : "GitHub Pages 为静态演示，不验证账号或收集密码。"}</div><div class="login-links">${!access.enabled ? '<a class="button outlined" href="#workspace">进入演示工作台</a>' : ""}${apiEnabled ? '<button class="text-button" id="retry-session">重新检查登录服务</button>' : ""}<a class="text-button" href="https://github.com/GuHang2011/fieldlens/blob/main/docs/ACCOUNTS_AND_SCREEN.md" target="_blank" rel="noopener">账号部署说明 ↗</a></div></section></section>`;
    main
      .querySelector("#retry-session")
      ?.addEventListener("click", () => location.reload());
    const form = main.querySelector("#login-form");
    if (!form) return;
    const password = main.querySelector("#login-password");
    main.querySelector("#password-toggle").onclick = (event) => {
      const shown = password.type === "password";
      password.type = shown ? "text" : "password";
      event.target.textContent = shown ? "隐藏" : "显示";
      event.target.setAttribute("aria-label", shown ? "隐藏密码" : "显示密码");
    };
    form.onsubmit = async (event) => {
      event.preventDefault();
      if (!access.enabled) return;
      const button = main.querySelector("#login-submit"),
        error = main.querySelector("#login-error");
      if (button.disabled) return;
      button.disabled = true;
      button.textContent = "正在登录…";
      error.hidden = true;
      try {
        const response = await apiFetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: main.querySelector("#login-username").value.trim(),
            password: password.value,
          }),
          signal: AbortSignal.timeout(10000),
        });
        const data = await response.json();
        if (!response.ok || !data.user?.id)
          throw Error(data.error || "登录失败，请重试");
        password.value = "";
        notifySession();
        location.hash = "workspace";
        location.reload();
      } catch (e) {
        error.textContent =
          e.name === "TimeoutError"
            ? "登录超时，请重试。"
            : e.message === "Failed to fetch"
              ? "登录服务无法连接。"
              : e.message;
        error.hidden = false;
      } finally {
        button.disabled = false;
        button.textContent = "登录工作台";
      }
    };
  };
  return access;
}
