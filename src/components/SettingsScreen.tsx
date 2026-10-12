import {motionTokens} from '../design/motion';
import { motion, useMotionValue } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { settingsCopy as copy } from './settingsCopy';
import { type Preferences } from '../app/preferences';
import { SETTINGS_SCHEMA, type NumericSetting } from '../app/settingsSchema';
import { GESTURE_SCROLL_GAIN } from '../config';
import { interactionManager } from '../interaction/GestureInteractionManager';
import { useInteractive } from '../interaction/useInteractive';
import { currentLocale, setLanguage, useText } from '../i18n';
import { voiceCheatSheet } from '../voice/VoiceCommandRouter';
import type { TrackingLifecycle } from '../types/hand';
import styles from './SettingsScreen.module.css';
import {voiceAssistant} from '../voice/VoiceAssistantService';

const SCOPE = 'settings';

export type SettingsScreenProps = {
  preferences: Preferences;
  lifecycle: TrackingLifecycle;
  simulated: boolean;
  version: string;
  onChange: (patch: Partial<Preferences>) => void;
  onReconnectCamera: () => void;
  onResetTutorial: () => void;
  onResetAll: () => void;
  onClose: () => void;
  children?:React.ReactNode;
};

const CAMERA_LABEL: Record<TrackingLifecycle, string> = {
  running: '运行中',
  'starting-camera': '正在启动',
  'loading-model': '加载模型',
  stopped: '已停止',
  error: '不可用',
  idle: '未启动',
};

const CAMERA_TONE: Record<TrackingLifecycle, 'ok' | 'warn' | 'danger' | 'dim'> = {
  running: 'ok',
  'starting-camera': 'warn',
  'loading-model': 'warn',
  stopped: 'dim',
  error: 'danger',
  idle: 'dim',
};

/** Snapped to the step and to two decimals, so 1.0 stays exactly 1.0. */
function snap(value: number, min: number, max: number, step: number): number {
  const stepped = min + Math.round((value - min) / step) * step;
  return Math.round(Math.min(Math.max(stepped, min), max) * 100) / 100;
}

const pointerWord = (v: number) => (v < 0.9 ? '平滑' : v > 1.1 ? '跟手' : '默认');

type Option<T> = { value: T; label: string };

const HAND_OPTIONS: Option<Preferences['dominantHand']>[] = [
  { value: 'auto', label: '自动' },
  { value: 'Left', label: '左手' },
  { value: 'Right', label: '右手' },
];


const MOTION_OPTIONS: Option<Preferences['reducedMotion']>[] = [
  { value: 'system', label: '跟随系统' },
  { value: 'on', label: '开' },
  { value: 'off', label: '关' },
];

const LANGUAGE_OPTIONS: Option<Preferences['uiLanguage']>[] = [
  { value: 'system', label: '跟随系统' },
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
];


/**
 * Settings, sized for a hand and still operable without one: every slider is a real
 * range input (mouse, touch, arrow keys) wearing a custom track, and every control
 * is also a spatial target.
 *
 * The body scrolls by translating an inner container because a pinch-drag can
 * never reach a scrollbar — the same travel that moves the list also has to move
 * the hit boxes, so the region rects are invalidated on every step.
 */
export function SettingsScreen(props: SettingsScreenProps): React.JSX.Element {
  const { preferences, lifecycle, simulated, version, onChange, onReconnectCamera, onResetTutorial, onResetAll, onClose } =
    props;
  const text = useText();
  const reduced = preferences.reducedMotion === 'on';
  const contentRef = useRef<HTMLDivElement | null>(null);
  const scrollY = useMotionValue(0);
  const travel = useRef(0);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const move = (dy: number) => {
    const viewport = bodyRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    const max = Math.max(0, content.offsetHeight - viewport.clientHeight);
    const next = Math.min(0, Math.max(-max, travel.current + dy));
    if (next === travel.current) return;
    travel.current = next;
    scrollY.set(next);
    interactionManager.invalidateRects();
  };

  const { ref: zoneRef } = useInteractive({
    id: 'settings-sheet',
    scope: SCOPE,
    magnet: 0,
    dragThreshold: 4,
    // The cursor is smoothed on purpose, so it covers well under the distance the hand did.
    // Without the gain, a 260 px gesture scrolled ~60 px and the last rows never came into reach.
    onDrag: (_point, delta) => move(delta.y * GESTURE_SCROLL_GAIN),
  });

  /**
   * The body keeps both refs: the gesture zone and the element that measures a viewport.
   *
   * The callback must be stable. A new function identity each render makes React
   * detach (null) and re-attach on every re-render — and a slider drag re-renders per
   * frame, so the gesture region would momentarily lose its element exactly while the
   * cursor is being measured against it.
   */
  const attachBody = useCallback((node: HTMLDivElement | null) => {
    bodyRef.current = node;
    (zoneRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
  }, [zoneRef]);

  const numeric = (key: NumericSetting['key']) => SETTINGS_SCHEMA[key] as NumericSetting;

  return (
    <div className={`${styles.stage} ad-scrim`} data-testid="settings">
      <div className={styles.inner}>
        <motion.section
          className={`${styles.sheet} ad-glass`}
          initial={{ opacity: 0, y: reduced ? 0 : 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduced ? 0 : -12 }}
          transition={reduced?{duration:0}:motionTokens.panel}
        >
          <header className={styles.head}>
            <h2 className="ad-title">{copy('设置')}</h2>
            <SettingButton id="settings-close" label="关闭" className={styles.close} onActivate={onClose}>
              <svg className="ad-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </SettingButton>
          </header>

          <div
            className={styles.body}
            data-testid="settings-body"
            tabIndex={0}
            ref={attachBody}
            onWheel={(event) => move(-event.deltaY)}
            onKeyDown={(event)=>{
              if(event.target!==event.currentTarget)return;
              const delta=event.key==='ArrowDown'?-64:event.key==='ArrowUp'?64:event.key==='PageDown'?-320:event.key==='PageUp'?320:event.key==='Home'?100000:event.key==='End'?-100000:0;
              if(delta){event.preventDefault();move(delta);}
            }}
          >
            <motion.div className={styles.content} style={{ y: scrollY }} ref={contentRef}>
              <p className={`${styles.section} ad-eyebrow`}>{copy('摄像头与手')}</p>
              <Row title="摄像头">
                <span className={styles.status} data-tone={simulated ? 'sim' : CAMERA_TONE[lifecycle]}>
                  <span className={styles.statusDot} aria-hidden="true" />
                  {copy(simulated ? '模拟信号' : CAMERA_LABEL[lifecycle])}
                </span>
                <SettingButton id="settings-reconnect" label="重新连接摄像头" onActivate={onReconnectCamera}>
                  {copy('重新连接')}
                </SettingButton>
              </Row>

              <Row title="主用手">
                <Segments
                  idPrefix="settings-hand"
                  value={preferences.dominantHand}
                  options={HAND_OPTIONS}
                  onPick={(dominantHand) => onChange({ dominantHand })}
                />
              </Row>

              <Row title="指针灵敏度" caption={pointerWord(preferences.pointerSensitivity)}>
                <Readout id="pointer" text={numeric('pointerSensitivity').format(preferences.pointerSensitivity)} />
                <SettingSlider
                  field="pointerSensitivity"
                  label="指针灵敏度"
                  value={preferences.pointerSensitivity}
                  onChange={(pointerSensitivity) => onChange({ pointerSensitivity })}
                />
              </Row>

              <Row title={text('settings.smoothing')} caption={text('settings.smoothingCaption')}>
                <Readout id="smoothing" text={numeric('pointerSmoothing').format(preferences.pointerSmoothing)} />
                <SettingSlider
                  field="pointerSmoothing"
                  label={text('settings.smoothing')}
                  value={preferences.pointerSmoothing}
                  onChange={(pointerSmoothing) => onChange({ pointerSmoothing })}
                />
              </Row>

              <Row title="捏合辅助" caption={preferences.pinchAssist === 0 ? '默认接触范围：指尖要几乎相触' : `接触范围 +${Math.round(preferences.pinchAssist * 45)}%：两指可以离得稍远也算捏合`}>
                <Readout id="assist" text={numeric('pinchAssist').format(preferences.pinchAssist)} />
                <SettingSlider
                  field="pinchAssist"
                  label="捏合辅助"
                  value={preferences.pinchAssist}
                  onChange={(pinchAssist) => onChange({ pinchAssist })}
                />
              </Row>

              <Row title="手势灵敏度" caption="张掌呼出工具栏的保持时长">
                <Readout id="hold" text={numeric('gestureHoldMs').format(preferences.gestureHoldMs)} />
                <SettingSlider
                  field="gestureHoldMs"
                  label="手势灵敏度"
                  value={preferences.gestureHoldMs}
                  onChange={(gestureHoldMs) => onChange({ gestureHoldMs })}
                />
              </Row>

              <p className={`${styles.section} ad-eyebrow`}>{copy('画面与动效')}</p>

              <Row title="减弱动效">
                <Segments
                  idPrefix="settings-motion"
                  value={preferences.reducedMotion}
                  options={MOTION_OPTIONS}
                  onPick={(reducedMotion) => onChange({ reducedMotion })}
                />
              </Row>

              <Row title={text('settings.languageUi')} caption={text('settings.languageUiCaption')}>
                <Segments
                  idPrefix="settings-ui-language"
                  value={preferences.uiLanguage}
                  options={LANGUAGE_OPTIONS}
                  onPick={(uiLanguage) => {
                    onChange({ uiLanguage });
                    setLanguage(uiLanguage);
                  }}
                />
              </Row>

              <Row title="开发者模式" caption="打开后会显示追踪诊断信息">
                <SettingButton
                  id="settings-dev"
                  label="开发者模式"
                  active={preferences.devMode}
                  onActivate={() => onChange({ devMode: !preferences.devMode })}
                >
                  {copy(preferences.devMode ? '已开启' : '已关闭')}
                </SettingButton>
              </Row>
              <p className={`${styles.section} ad-eyebrow`}>{copy('语音助手')}</p>
              <Row title="语音识别" caption="单独申请麦克风权限">
                <SettingButton id="settings-voice" label="开启语音助手" onActivate={()=>voiceAssistant.start()}>{copy('开启')}</SettingButton>
                <SettingButton id="settings-voice-off" label="关闭语音助手" onActivate={()=>voiceAssistant.stop()}>{copy('关闭')}</SettingButton>
              </Row>
              <Row title="唤醒短语"><Segments idPrefix="settings-wake" value={preferences.voiceWakePhrase} options={[{value:'你好，AirDraw',label:'你好，AirDraw'},{value:'AirDraw，听我说',label:'AirDraw，听我说'}]} onPick={voiceWakePhrase=>onChange({voiceWakePhrase})}/></Row>
              <Row title={text('settings.languageSpeech')} caption={text('settings.languageSpeechCaption')}>
                <Segments
                  idPrefix="settings-language"
                  value={preferences.voiceLanguage}
                  options={[{ value: 'zh-CN' as const, label: '中文' }, { value: 'en-US' as const, label: 'English' }]}
                  onPick={(voiceLanguage) => onChange({ voiceLanguage })}
                />
              </Row>
              <Row title="语音反馈"><SettingButton id="settings-voice-feedback" label="语音反馈" active={preferences.voiceFeedback} onActivate={()=>onChange({voiceFeedback:!preferences.voiceFeedback})}>{copy(preferences.voiceFeedback?'开':'静音')}</SettingButton></Row>
              <Row title={text('settings.volume')} caption={text('settings.volumeCaption')}>
                <Readout id="volume" text={numeric('voiceVolume').format(preferences.voiceVolume)} />
                <SettingSlider
                  field="voiceVolume"
                  label={text('settings.volume')}
                  value={preferences.voiceVolume}
                  onChange={(voiceVolume) => onChange({ voiceVolume })}
                />
              </Row>
              <p className={styles.cheatsheet} data-testid="voice-cheatsheet">
                <span className="ad-body">{text('voice.canSay')}</span>
                {voiceCheatSheet(currentLocale()).map((row) => (
                  <code key={row.id}>{row.phrase}</code>
                ))}
              </p>
              <p className="ad-caption">{copy('浏览器语音服务可能联网处理音频。摄像头与手势不受语音授权影响。')}</p>

              <Row title="重新学习教程" caption="下次打开时会重新进入教程">
                <SettingButton id="settings-reset-tutorial" label="重新学习教程" onActivate={onResetTutorial}>
                  {copy('重新开始')}
                </SettingButton>
              </Row>

              <Row title={text('settings.resetAll')} caption={text('settings.resetAllCaption')}>
                <SettingButton id="settings-reset-all" label={text('settings.resetAll')} onActivate={onResetAll}>
                  {text('common.restoreDefaults')}
                </SettingButton>
              </Row>

              <div className={styles.about}>
                {props.children}
                <span className={styles.aboutName}>AirDraw</span>
                <span className={styles.aboutVersion}>{version}</span>
                <span className="ad-caption">{copy('摄像头画面只在本机处理，不会上传。')}</span>
              </div>
            </motion.div>
          </div>

          <footer className={styles.foot}>
            <span className="ad-caption">{text('settings.instantApply')}</span>
            <SettingButton id="settings-done" label="完成" className={styles.done} onActivate={onClose}>
              {copy('完成')}
            </SettingButton>
          </footer>
        </motion.section>
      </div>
    </div>
  );
}

/** One preference: name on the left, whatever operates it on the right. */
function Row({ title, caption, children }: { title: string; caption?: string; children: React.ReactNode }) {
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <span className="ad-body">{copy(title)}</span>
        {caption && <span className="ad-caption">{copy(caption)}</span>}
      </div>
      <div className={styles.control}>{children}</div>
    </div>
  );
}

function Readout({ id, text }: { id: string; text: string }) {
  return (
    <span className={`${styles.readout} ad-caption`} data-testid={`settings-readout-${id}`}>
      {text}
    </span>
  );
}

function Segments<T extends string>({
  idPrefix,
  value,
  options,
  onPick,
}: {
  idPrefix: string;
  value: T;
  options: Option<T>[];
  onPick: (value: T) => void;
}) {
  return (
    <div className={styles.segments} role="group">
      {options.map((option) => (
        <SettingButton
          key={option.value}
          id={`${idPrefix}-${option.value}`}
          label={option.label}
          active={value === option.value}
          onActivate={() => onPick(option.value)}
        >
          {copy(option.label)}
        </SettingButton>
      ))}
    </div>
  );
}

/**
 * A slider that answers a hand, a mouse, a finger and an arrow key.
 *
 * The visual track is drawn by the wrapper, which is the gesture region the cursor
 * is measured against; the native range input sits on top of it, invisible, so
 * pointer capture, keyboard steps and screen-reader announcements are the
 * browser's — not something this file has to get right.
 */
function SettingSlider({
  field,
  label,
  value,
  onChange,
}: {
  field: NumericSetting['key'];
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const descriptor = SETTINGS_SCHEMA[field] as NumericSetting;
  const { min, max, step, default: neutral, format } = descriptor;
  const [committed, setCommitted] = useState(false);
  const commitTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>()=>{if(commitTimer.current)clearTimeout(commitTimer.current);},[]);
  // The registered node is the measured node: a pinch maps the cursor's x inside
  // this box onto the range, so a ref on any other element would leave the drag
  // region without a box to aim at.
  const { ref, glow } = useInteractive({
    id: `settings-${field}`,
    scope: SCOPE,
    magnet: 10,
    dragThreshold: 2,
    onDrag: (point) => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      const u = Math.min(Math.max((point.x - rect.left) / rect.width, 0), 1);
      onChange(snap(min + u * (max - min), min, max, step));
    },
  });

  const commit = () => {
    setCommitted(true);
    if(commitTimer.current)clearTimeout(commitTimer.current);
    commitTimer.current=setTimeout(() => setCommitted(false), 900);
  };

  const u = (value - min) / (max - min);
  const neutralU = (neutral - min) / (max - min);
  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className={styles.slider}
      style={{ '--glow': glow } as unknown as React.CSSProperties}
      data-testid={`settings-slider-${field}`}
      data-committed={committed ? 'true' : 'false'}
      data-at-default={value === neutral ? 'true' : 'false'}
    >
      <span className={styles.sliderTrack} aria-hidden="true" />
      <span className={styles.sliderFill} style={{ width: `${u * 100}%` }} aria-hidden="true" />
      <span className={styles.sliderNeutral} style={{ left: `${neutralU * 100}%` }} aria-hidden="true" />
      <span className={styles.sliderKnob} style={{ left: `${u * 100}%` }} aria-hidden="true" />
      <input
        className={styles.sliderInput}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={copy(label)}
        aria-valuetext={`${format(value)} (${copy('默认')} ${format(neutral)})`}
        data-testid={`settings-input-${field}`}
        onChange={(event) => onChange(snap(Number(event.target.value), min, max, step))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
    </div>
  );
}

/** A spatial target that still answers a mouse click. */
function SettingButton({
  id,
  label,
  className,
  active,
  onActivate,
  children,
}: {
  id: string;
  label: string;
  className?: string;
  active?: boolean;
  onActivate: () => void;
  children: React.ReactNode;
}) {
  const { ref, scale, glow } = useInteractive({ id, scope: SCOPE, magnet: 10, onActivate });
  return (
    <motion.button
      ref={ref as React.RefObject<HTMLButtonElement>}
      type="button"
      className={`${styles.button} ad-press ${className ?? ''}`}
      style={{ scale, '--glow': glow } as unknown as React.CSSProperties}
      data-active={active ? 'true' : 'false'}
      onClick={onActivate}
      aria-label={copy(label)}
      aria-pressed={active ? true : undefined}
      data-testid={id}
    >
      {children}
    </motion.button>
  );
}
