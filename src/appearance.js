const themeKey = "fieldlens.ui.theme.v1";
const screenKey = "fieldlens.screen.preferences.v1";
const themes = [
  ["classic", "经典浅色"],
  ["field", "田野青绿"],
  ["dark", "深色"],
];

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
  } catch {
    /* Still usable for this visit. */
  }
}
function applyTheme(value) {
  const theme = themes.some(([id]) => id === value) ? value : "classic";
  document.documentElement.dataset.uiTheme = theme;
  document.querySelectorAll("[data-ui-theme-select]").forEach((select) => {
    select.value = theme;
  });
}

export function initializeAppearance() {
  applyTheme(read(themeKey));
  window.addEventListener("storage", (event) => {
    if (event.key === themeKey || event.key === null)
      applyTheme(read(themeKey));
  });
}

export function themeControl(id) {
  return `<label class="theme-control" for="${id}"><span>界面</span><select id="${id}" data-ui-theme-select>${themes.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label>`;
}

export function bindThemeControls(root) {
  root.querySelectorAll("[data-ui-theme-select]").forEach((select) => {
    select.value = document.documentElement.dataset.uiTheme || "classic";
    select.onchange = () => {
      applyTheme(select.value);
      save(themeKey, document.documentElement.dataset.uiTheme);
    };
  });
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
