import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { LAB_VOLUME, labToWorld, type LabRuntime } from './runtime';
import { quality } from './quality';
import { notify } from '../app/feedback';
import { themeController } from '../theme/themeController';

/**
 * PlayLab inside the *existing* Canvas.
 *
 * Mounting a second `<Canvas>` per toy would mean a second WebGL context, a second
 * set of GPU resources and a second render loop — the thing this phase is not
 * allowed to do. The runtime borrows the scene, camera and renderer it is handed
 * and only ever adds a group.
 */
export function LabStage({ runtime, active, reducedMotion }: { runtime: LabRuntime; active: boolean; reducedMotion: boolean }) {
  const { scene, camera, gl } = useThree();
  const attached = useRef(false);
  // The quality governor only knows the picture is too expensive if someone counts
  // the frames. One sample per second, and it never touches recognition.
  const frames = useRef(0);
  const sampledAt = useRef(0);

  useEffect(() => {
    runtime.group.visible = active;
    if (active) runtime.resume();
    else runtime.pause();
    runtime.setActive(active);
  }, [runtime, active]);

  useFrame((_state, delta) => {
    if (!attached.current) {
      runtime.attach({
        id: 'orb',
        root: runtime.group,
        scene,
        camera,
        renderer: gl,
        volume: LAB_VOLUME,
        quality: quality.current,
        toWorld: labToWorld,
        notify: (message, tone) => notify(message, { tone: tone ?? 'neutral' }),
        emit: () => {},
      });
      attached.current = true;
    }
    if (active) runtime.update(delta, 1 - themeController.t, reducedMotion);
    frames.current += 1;
    sampledAt.current += delta;
    if (sampledAt.current >= 1) {
      quality.sample(frames.current / sampledAt.current);
      frames.current = 0;
      sampledAt.current = 0;
    }
  });

  return <primitive object={runtime.group} />;
}
