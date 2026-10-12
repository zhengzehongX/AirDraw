/**
 * Capability probing.
 *
 * AirDraw needs three things to do anything at all: a secure context, a camera
 * API and a WebGL context. Detecting them up front turns what would otherwise be
 * a blank canvas and a silent failure into a page that says what is missing and
 * what to do about it.
 */

export type CapabilityReport = {
  webgl: boolean;
  camera: boolean;
  secure: boolean;
};

export function detectCapabilities(): CapabilityReport {
  return {
    webgl: hasWebgl(),
    camera: typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
    secure: typeof window !== 'undefined' && window.isSecureContext,
  };
}

function hasWebgl(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    // The probe context is the only allocation; release it immediately so the
    // browser does not count it against the per-origin context limit.
    const extension = context?.getExtension('WEBGL_lose_context');
    extension?.loseContext();
    return context !== null;
  } catch {
    return false;
  }
}

/** Anything missing that makes the app impossible to use. */
export function missingCapability(report: CapabilityReport, simulated: boolean): 'webgl' | 'camera' | 'insecure-context' | null {
  if (!report.webgl) return 'webgl';
  if (simulated) return null;
  if (!report.secure) return 'insecure-context';
  if (!report.camera) return 'camera';
  return null;
}
