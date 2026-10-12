import type { GestureName, PointerState } from '../types/drawing';
import type { TrackingLifecycle } from '../types/hand';

export type Tone = 'idle' | 'ok' | 'warn' | 'danger' | 'accent';

export type StatusChip = { label: string; tone: Tone; detail?: string };

export function describeLifecycle(lifecycle: TrackingLifecycle, simulated: boolean): StatusChip {
  if (simulated) return { label: '模拟手部信号', tone: 'accent', detail: 'simulate=1' };
  switch (lifecycle) {
    case 'running':
      return { label: '摄像头已连接', tone: 'ok' };
    case 'starting-camera':
      return { label: '正在请求摄像头…', tone: 'warn' };
    case 'loading-model':
      return { label: '正在加载识别模型…', tone: 'warn' };
    case 'error':
      return { label: '摄像头异常', tone: 'danger' };
    case 'stopped':
      return { label: '已停止', tone: 'idle' };
    default:
      return { label: '未启动', tone: 'idle' };
  }
}

export function describePointer(state: PointerState): StatusChip {
  switch (state) {
    case 'drawing':
      return { label: '捏合中 · 落笔', tone: 'accent' };
    case 'tracking':
      return { label: '已追踪 · 抬笔', tone: 'ok' };
    case 'lost':
      return { label: '手部短暂丢失', tone: 'warn' };
    default:
      return { label: '搜索手部中', tone: 'idle' };
  }
}

export const POINTER_HINT: Record<PointerState, string> = {
  searching: '举起一只手，掌心朝向摄像头',
  tracking: '拇指与食指捏合即可落笔',
  lost: '手部离开画面，笔画已暂停',
  drawing: '松开手指即抬笔',
};

export const GESTURE_LABEL: Record<GestureName, string> = {
  NONE: '无手势',
  POINT: '食指指向',
  PINCH: '捏合',
  OPEN_PALM: '张开手掌',
  FIST: '握拳',
  VICTORY: '剪刀手',
};

export const HOLD_ACTION_LABEL: Record<'undo' | 'clear', string> = {
  undo: '保持握拳以撤销上一笔',
  clear: '保持张掌以清空画布',
};
