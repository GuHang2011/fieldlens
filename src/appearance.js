const themeKey = "fieldlens.ui.theme.v1";
const screenKey = "fieldlens.screen.preferences.v1";
const themes = [
  ["classic", "经典浅色"],
  ["field", "田野青绿"],
  ["dark", "深色"],
  ["sand", "暖砂"],
  ["system", "跟随系统"],
];
let selectedTheme = "classic";
let skinDialog, skinOpener;
let systemTheme;

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function save(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
function applyTheme(value) {
  selectedTheme = themes.some(([id]) => id === value) ? value : "classic";
  const theme =
    selectedTheme === "system"
      ? systemTheme?.matches
        ? "dark"
        : "classic"
      : selectedTheme;
  document.documentElement.dataset.uiTheme = theme;
  document.querySelectorAll("[data-ui-theme-select]").forEach((select) => {
    select.value = selectedTheme;
  });
  skinDialog?.querySelectorAll("[data-skin-choice]").forEach((input) => {
    input.checked = input.value === selectedTheme;
  });
}

function chooseTheme(value) {
  applyTheme(value);
  const saved = save(themeKey, selectedTheme);
  const status = skinDialog?.querySelector("#skin-status");
  if (status)
    status.textContent = saved
      ? "已应用，当前浏览器会记住此选择。"
      : "已应用。浏览器未允许保存设置，刷新后可能恢复默认。";
}

function closeSkinPanel() {
  if (!skinDialog) return;
  skinDialog?.close();
  skinDialog?.remove();
  skinDialog = null;
  if (skinOpener?.isConnected) skinOpener.focus({ preventScroll: true });
}

function openSkinPanel(opener) {
  if (skinDialog?.open) return;
  skinOpener = opener;
  skinDialog = document.createElement("dialog");
  skinDialog.className = "record-dialog skin-dialog";
  skinDialog.setAttribute("aria-labelledby", "skin-title");
  const descriptions = {
    classic: "中性灰白与深绿主操作，适合日常使用",
    field: "浅绿底色，保留田野气息",
    dark: "深色背景，适合夜间查看",
    sand: "暖色背景，柔和的棕色主操作",
    system: "随设备的浅色或深色设置变化",
  };
  skinDialog.innerHTML = `<div class="panel-heading"><h2 id="skin-title">界面换肤</h2><button class="button outlined" id="skin-close">关闭</button></div><div class="skin-body"><p class="field-help">选择后立即预览，当前图片、记录和输入会保留。</p><fieldset class="skin-options"><legend>选择皮肤</legend>${themes.map(([value, label]) => `<label class="skin-card"><input type="radio" name="fieldlens-skin" value="${value}" data-skin-choice/><span class="skin-preview skin-preview--${value}" aria-hidden="true"><i></i><span><b></b><em></em><em></em></span></span><strong>${label}</strong><small>${descriptions[value]}</small></label>`).join("")}</fieldset><p id="skin-status" role="status">设置保存在当前浏览器，可随时更换。</p></div><div class="skin-footer"><button class="button outlined" id="skin-reset">恢复默认</button><button class="button primary" id="skin-done">完成</button></div>`;
  (document.fullscreenElement || document.body).append(skinDialog);
  applyTheme(selectedTheme);
  skinDialog
    .querySelectorAll("[data-skin-choice]")
    .forEach((input) => (input.onchange = () => chooseTheme(input.value)));
  skinDialog.querySelector("#skin-close").onclick = closeSkinPanel;
  skinDialog.querySelector("#skin-done").onclick = closeSkinPanel;
  skinDialog.querySelector("#skin-reset").onclick = () =>
    chooseTheme("classic");
  skinDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeSkinPanel();
  });
  skinDialog.showModal();
}

export function initializeAppearance() {
  systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
  applyTheme(read(themeKey));
  systemTheme.addEventListener("change", () => {
    if (selectedTheme === "system") applyTheme("system");
  });
  window.addEventListener("hashchange", closeSkinPanel);
  window.addEventListener("storage", (event) => {
    if (event.key === themeKey || event.key === null)
      applyTheme(read(themeKey));
  });
}

export function themeControl(id) {
  return `<div class="theme-switcher"><label class="theme-control" for="${id}"><span>界面</span><select id="${id}" data-ui-theme-select>${themes.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label><button class="text-button" type="button" data-skin-open>换肤</button></div>`;
}

export function bindThemeControls(root) {
  root.querySelectorAll("[data-ui-theme-select]").forEach((select) => {
    select.value = selectedTheme;
    select.onchange = () => {
      chooseTheme(select.value);
    };
  });
  root
    .querySelectorAll("[data-skin-open]")
    .forEach((button) => (button.onclick = () => openSkinPanel(button)));
}

export function readScreenPreferences() {
  let value;
  try {
    value = JSON.parse(read(screenKey));
  } catch {
    /* Use defaults. */
  }
  return {
    source: ["all", "model", "demo"].includes(value?.source)
      ? value.source
      : "all",
    days: [7, 30].includes(value?.days) ? value.days : 7,
    distance: ["standard", "far", "hall"].includes(value?.distance)
      ? value.distance
      : "standard",
  };
}

export function saveScreenPreferences(value) {
  save(screenKey, JSON.stringify(value));
}
