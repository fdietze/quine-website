// Use geometry without a world: CSS shares its dynamic height and safe area
// with body.world (style.css). Measure afresh for each preview so rotation and
// browser bars cannot leave a cached viewport. No core or resident is opened.
export function useViewport() {
  const probe = document.createElement("div");
  probe.className = "use-viewport";
  probe.setAttribute("aria-hidden", "true");
  document.body.append(probe);
  try {
    const style = getComputedStyle(probe);
    return {
      width: probe.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
      height: probe.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom),
    };
  } finally {
    probe.remove();
  }
}
