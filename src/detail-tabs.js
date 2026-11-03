// Panels stay mounted so switching sections preserves unsaved form values.
export function attachDetailTabs(dialog) {
  const tabs = [...dialog.querySelectorAll('[role="tab"]')];
  function select(name, focus = false) {
    for (const tab of tabs) {
      const active = tab.dataset.detailTab === name;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      dialog.querySelector(`#${tab.getAttribute("aria-controls")}`).hidden =
        !active;
      if (active && focus) tab.focus();
    }
    dialog.querySelector(".detail-scroll").scrollTop = 0;
    if (name === "ai") dialog.querySelector(".assistant-panel").open = true;
  }
  tabs.forEach((tab, index) => {
    tab.onclick = () => select(tab.dataset.detailTab);
    tab.onkeydown = (event) => {
      const next = {
        ArrowRight: (index + 1) % tabs.length,
        ArrowLeft: (index + tabs.length - 1) % tabs.length,
        Home: 0,
        End: tabs.length - 1,
      }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      select(tabs[next].dataset.detailTab, true);
    };
  });
  select("review");
  return select;
}
