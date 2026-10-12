import { useMemo } from 'react';

export type UrlFlags = {
  /** `?simulate=1` — replay a synthetic hand instead of opening the camera. */
  simulate: boolean;
  /** `?debug=1` — open the debug panel on load. */
  debug: boolean;
  /** `?mirror=0` — start with mirroring disabled. */
  mirror: boolean;
};

export function useUrlFlags(): UrlFlags {
  return useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      simulate: params.get('simulate') === '1',
      debug: params.get('debug') === '1',
      mirror: params.get('mirror') !== '0',
    };
  }, []);
}
