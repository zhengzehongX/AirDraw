import type {AppCommand} from '../app/AppCommandBus';
import type {Locale} from '../i18n';

/**
 * The voice vocabulary.
 *
 * Every entry has a stable internal `id`: transcripts are matched on aliases, but
 * feedback, tests and the cheat sheet all refer to the id, so renaming a spoken
 * phrase never breaks anything downstream. Matching is exact-or-colour — a command
 * is never decided by a fuzzy substring, because 「清空画布」 has to be said, not
 * hinted at.
 */
export type VoiceCommandEntry = { id: string; aliases: string[]; command: AppCommand };

const COLOURS: [string[], string][] = [
  [['红色', '红', 'red'], '#ef5350'],
  [['橙色', '橙', 'orange'], '#fb923c'],
  [['黄色', '黄', 'yellow'], '#facc15'],
  [['绿色', '绿', 'green'], '#4ade80'],
  [['青色', '青', 'cyan', 'turquoise'], '#22d3ee'],
  [['蓝色', '蓝', 'blue'], '#42a5f5'],
  [['紫色', '紫', 'purple'], '#a78bfa'],
  [['白色', '白', 'white'], '#f8fafc'],
  [['黑色', '黑', 'black'], '#111827'],
];

export const VOICE_COMMANDS: VoiceCommandEntry[] = [
  { id: 'menu.open', aliases: ['打开菜单', '显示菜单', 'open menu', 'show menu'], command: { type: 'OPEN_MENU' } },
  { id: 'menu.close', aliases: ['关闭菜单', '收起菜单', 'close menu', 'hide menu'], command: { type: 'CLOSE_MENU' } },
  { id: 'settings.open', aliases: ['打开设置', '系统设置', 'open settings'], command: { type: 'OPEN_SETTINGS' } },
  { id: 'mode.canvas', aliases: ['打开平面画板', '平面绘画', '二维画板', '打开画板', '二维', 'canvas mode', '2d'], command: { type: 'SWITCH_MODE', mode: 'CANVAS_DRAW' } },
  { id: 'mode.spatial', aliases: ['进入三维绘画', '三维绘画', '空间绘画', '三维', '3d mode', 'spatial'], command: { type: 'SWITCH_MODE', mode: 'SPATIAL_DRAW' } },
  { id: 'mode.model', aliases: ['进入模型模式', '模型模式', '模型操控', 'model mode'], command: { type: 'SWITCH_MODE', mode: 'MODEL_CONTROL' } },
  { id: 'page.next', aliases: ['下一页', '下一个', 'next page'], command: { type: 'NEXT_PAGE' } },
  { id: 'page.previous', aliases: ['上一页', '上一个', 'previous page'], command: { type: 'PREVIOUS_PAGE' } },
  { id: 'edit.undo', aliases: ['撤销', '恢复上一步', 'undo'], command: { type: 'UNDO' } },
  { id: 'edit.redo', aliases: ['重做', 'redo'], command: { type: 'REDO' } },
  { id: 'file.save', aliases: ['保存作品', '保存', 'save'], command: { type: 'SAVE' } },
  { id: 'gallery.open', aliases: ['打开作品库', '作品库', 'open gallery'], command: { type: 'OPEN_GALLERY' } },
  { id: 'help.open', aliases: ['打开帮助', '使用说明', '帮助', 'open help'], command: { type: 'OPEN_HELP' } },
  { id: 'language.switch', aliases: ['切换语言', '换语言', '英文界面', 'switch language', 'english'], command: { type: 'SET_LANGUAGE' } },
  { id: 'brush.bigger', aliases: ['笔刷大一点', '粗一点', '大一点', 'bigger brush'], command: { type: 'SET_BRUSH_SIZE', delta: 1 } },
  { id: 'brush.smaller', aliases: ['笔刷小一点', '细一点', '小一点', 'smaller brush'], command: { type: 'SET_BRUSH_SIZE', delta: -1 } },
  { id: 'colour.panel', aliases: ['选择颜色', '打开颜色面板', '颜色', 'pick colour', 'choose colour'], command: { type: 'OPEN_COLOR_PANEL' } },
  { id: 'view.center', aliases: ['居中作品', '居中', 'center artwork'], command: { type: 'CENTER_ARTWORK' } },
  // Board navigation goes through the same viewport controller the hands drive.
  { id: 'view.zoom.in', aliases: ['放大一点', '放大', '再大一点', 'zoom in'], command: { type: 'ZOOM_BOARD', factor: 1.25 } },
  { id: 'view.zoom.out', aliases: ['缩小一点', '缩小', '再小一点', 'zoom out'], command: { type: 'ZOOM_BOARD', factor: 0.8 } },
  { id: 'view.zoom.reset', aliases: ['恢复百分之百', '实际大小', '还原缩放', 'reset zoom'], command: { type: 'VIEW_RESET' } },
  { id: 'view.fit', aliases: ['显示全部', '看到全部', '全部显示', 'fit view', 'show everything'], command: { type: 'VIEW_FIT' } },
  { id: 'view.last', aliases: ['回到上次视图', '上一个视图', 'previous view'], command: { type: 'VIEW_LAST' } },
  { id: 'nav.canvas', aliases: ['返回画布', '回到画布', '回画布', 'back to canvas'], command: { type: 'RETURN_TO_CANVAS' } },
  { id: 'gestures.pause', aliases: ['暂停手势', '别识别手势', 'pause gestures'], command: { type: 'PAUSE_GESTURES', on: true } },
  { id: 'gestures.resume', aliases: ['继续手势', '恢复手势', 'resume gestures'], command: { type: 'PAUSE_GESTURES', on: false } },
  { id: 'view.exit', aliases: ['退出查看', '退出视角', 'exit view'], command: { type: 'EXIT_VIEW_MODE' } },
  { id: 'nav.home', aliases: ['返回首页', '返回主页', '返回', 'home', 'back'], command: { type: 'HOME' } },
  // Dangerous ones stay literal: no prefix, no synonym, and a confirmation on top.
  { id: 'canvas.clear', aliases: ['清空画布'], command: { type: 'CLEAR_CANVAS' } },
  { id: 'canvas.clear.confirmed', aliases: ['确认清空'], command: { type: 'CLEAR_CANVAS', confirmed: true } },
  { id: 'edit.cancel', aliases: ['取消', 'cancel'], command: { type: 'CANCEL' } },
];

export const normalizeVoice = (text: string) => text.toLowerCase().replace(/[\s，。！？、,.!?：:]/g, '');

const stripPoliteness = (value: string) => value.replace(/^(请|帮我|please)/, '');

/**
 * Colour words are matched inside a phrase (「选择红色」 works) but only when the
 * phrase is not about the background: 「背景颜色」 must never repaint the pen.
 */
function parseColour(value: string): AppCommand | null {
  if (/背景|底色|background/.test(value)) return null;
  for (const [words, colour] of COLOURS) {
    if (words.some((word) => value.includes(normalizeVoice(word)))) return { type: 'SET_COLOR', color: colour };
  }
  return null;
}

export function parseVoiceCommand(text: string): AppCommand | null {
  const value = stripPoliteness(normalizeVoice(text));
  if (!value) return null;
  const exact = VOICE_COMMANDS.find((entry) => entry.aliases.some((alias) => normalizeVoice(alias) === value));
  if (exact) return exact.command;
  // A colour command is allowed to carry a verb: 选择红色 / 换成蓝色 / set it red.
  const coloured = parseColour(value);
  if (coloured && /^(选择|换成|改成|set|use|try)/.test(value)) return coloured;
  return null;
}

/** What the pill shows and the synthesiser says after a command lands. */
const FEEDBACK: Record<string, Record<Locale, string>> = {
  'menu.open': { zh: '已打开菜单', en: 'Menu opened' },
  'menu.close': { zh: '已收起菜单', en: 'Menu closed' },
  'settings.open': { zh: '已打开设置', en: 'Settings opened' },
  'mode.canvas': { zh: '已打开平面画板', en: 'Canvas mode' },
  'mode.spatial': { zh: '已进入三维绘画', en: 'Spatial mode' },
  'mode.model': { zh: '已进入模型模式', en: 'Model mode' },
  'lab.open': { zh: '已打开互动玩具', en: 'PlayLab opened' },
  'page.next': { zh: '下一页', en: 'Next page' },
  'page.previous': { zh: '上一页', en: 'Previous page' },
  'edit.undo': { zh: '已撤销', en: 'Undone' },
  'edit.redo': { zh: '已重做', en: 'Redone' },
  'file.save': { zh: '已保存', en: 'Saved' },
  'gallery.open': { zh: '已打开作品库', en: 'Gallery opened' },
  'help.open': { zh: '已打开使用说明', en: 'Guide opened' },
  'theme.day': { zh: '已切换日间', en: 'Day theme' },
  'theme.night': { zh: '已切换夜间', en: 'Night theme' },
  'language.switch': { zh: '已切换界面语言', en: 'Interface language switched' },
  'brush.bigger': { zh: '笔刷变粗', en: 'Brush thicker' },
  'brush.smaller': { zh: '笔刷变细', en: 'Brush thinner' },
  'colour.panel': { zh: '已打开颜色面板', en: 'Colour panel opened' },
  'colour.set': { zh: '已选择颜色', en: 'Colour chosen' },
  'view.center': { zh: '已居中作品', en: 'Artwork centred' },
  'view.zoom.in': { zh: '已放大画板', en: 'Zoomed in' },
  'view.zoom.out': { zh: '已缩小画板', en: 'Zoomed out' },
  'view.zoom.reset': { zh: '已恢复百分之百', en: 'Back to 100%' },
  'view.fit': { zh: '已显示全部内容', en: 'Showing everything' },
  'view.pan': { zh: '已移动画板', en: 'Board moved' },
  'view.last': { zh: '已回到上次视图', en: 'Back to the previous view' },
  'nav.canvas': { zh: '已返回画布', en: 'Back to the canvas' },
  'gestures.pause': { zh: '已暂停手势', en: 'Gestures paused' },
  'gestures.resume': { zh: '已恢复手势', en: 'Gestures resumed' },
  'view.exit': { zh: '已退出查看', en: 'Left view mode' },
  'nav.home': { zh: '已返回首页', en: 'Back home' },
  'canvas.clear': { zh: '再确认一次就会清空', en: 'Say confirm to clear' },
  'canvas.clear.done': { zh: '已清空', en: 'Cleared' },
  'edit.cancel': { zh: '已取消', en: 'Cancelled' },
  'toy.open': { zh: '已打开玩具', en: 'Toy opened' },
};

const idFor = (command: AppCommand): string => {
  switch (command.type) {
    case 'SWITCH_MODE':
      return command.mode === 'CANVAS_DRAW' ? 'mode.canvas' : command.mode === 'MODEL_CONTROL' ? 'mode.model' : 'mode.spatial';
    case 'OPEN_TOY':
      return 'toy.open';
    case 'SET_THEME':
      return command.theme === 'night' ? 'theme.night' : 'theme.day';
    case 'SET_COLOR':
      return 'colour.set';
    case 'SET_BRUSH_SIZE':
      return (command.delta ?? 0) < 0 ? 'brush.smaller' : 'brush.bigger';
    case 'CLEAR_CANVAS':
      return command.confirmed ? 'canvas.clear.done' : 'canvas.clear';
    case 'ZOOM_BOARD':
      return command.factor >= 1 ? 'view.zoom.in' : 'view.zoom.out';
    case 'PAN_BOARD':
      return 'view.pan';
    case 'PAUSE_GESTURES':
      return command.on === false ? 'gestures.resume' : 'gestures.pause';
    default:
      return { OPEN_MENU: 'menu.open', CLOSE_MENU: 'menu.close', OPEN_SETTINGS: 'settings.open', NEXT_PAGE: 'page.next', PREVIOUS_PAGE: 'page.previous', UNDO: 'edit.undo', REDO: 'edit.redo', SAVE: 'file.save', OPEN_GALLERY: 'gallery.open', OPEN_HELP: 'help.open', OPEN_PLAYLAB: 'mode.model', SET_LANGUAGE: 'language.switch', CENTER_ARTWORK: 'view.center', EXIT_VIEW_MODE: 'view.exit', HOME: 'nav.home', CANCEL: 'edit.cancel', OPEN_COLOR_PANEL: 'colour.panel', VIEW_FIT: 'view.fit', VIEW_RESET: 'view.zoom.reset', VIEW_LAST: 'view.last', RETURN_TO_CANVAS: 'nav.canvas' }[command.type] ?? '';
  }
};

export function commandFeedback(command: AppCommand, locale: Locale = 'zh'): string {
  const entry = FEEDBACK[idFor(command)];
  return entry ? entry[locale] : locale === 'zh' ? '好的' : 'OK';
}

/** The cheat sheet: what a person can actually say, in the language they read. */
export function voiceCheatSheet(locale: Locale): { id: string; phrase: string }[] {
  const picks = ['menu.open', 'nav.home', 'mode.canvas', 'mode.spatial', 'lab.open', 'edit.undo', 'file.save', 'settings.open', 'language.switch'];
  return picks.map((id) => {
    const entry = VOICE_COMMANDS.find((command) => command.id === id);
    const list = entry?.aliases ?? [];
    const phrase = locale === 'zh' ? list.find((alias) => /[一-龥]/.test(alias)) ?? list[0] : list.find((alias) => !/[一-龥]/.test(alias)) ?? list[0];
    return { id, phrase };
  });
}

/** Mis-heard variants of the shipped greeting, accepted only while it is the setting. */
const DEFAULT_WAKE_VARIANTS = ['airdraw听我说', 'airdraw'];
export function stripWakePhrase(text: string, phrase = '你好，AirDraw'): string | null {
  const value = normalizeVoice(text);
  const wanted = normalizeVoice(phrase);
  const aliases = wanted === normalizeVoice('你好，AirDraw') ? [wanted, ...DEFAULT_WAKE_VARIANTS] : [wanted];
  // Longest first: 「airdraw听我说」 must not be chopped by the shorter 「airdraw」.
  const hits = aliases.filter((alias) => alias && value.includes(alias)).sort((a, b) => b.length - a.length);
  for (const alias of hits) {
    const at = value.indexOf(alias);
    const rest = value.slice(at + alias.length);
    if (rest) return rest;
  }
  return hits.length > 0 ? '' : null;
}
