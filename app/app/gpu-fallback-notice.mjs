// Advice from the Worker's observed startup refusal, not browser/OS guesses.
// Raw renderer details follow the existing "Show tool calls" visibility rule.

/**
 * @param {import("../../types/worker-messages.js").GpuFallback | null} fallback
 * @param {boolean} showDetails
 * @returns {string}
 */
export function gpuFallbackNotice(fallback, showDetails) {
  if (!fallback) return "";
  const advice = !fallback.secureContext
    ? "WebGPU needs a secure page. Open Quine over HTTPS or on localhost, then reload."
    : `${fallback.apiExposed ? "WebGPU could not start." : "WebGPU is unavailable in this browser."} Update your browser and check its graphics/hardware acceleration settings, then restart it.`;
  return `${advice} This app still works with CPU drawing.${showDetails ? ` ${fallback.reason}` : ""}`;
}
