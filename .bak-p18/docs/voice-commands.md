# Voice Assistant

## 使用

顶部麦克风按钮单独开启语音，默认中文。说出唤醒短语后进入约 8 秒指令窗口，也可把唤醒和命令放在同一句。**唤醒短语是设置项**：出厂问候语「你好，AirDraw」额外接受它的两种常见误听（“AirDraw”“AirDraw，听我说”）；一旦换成自定义短语，旧短语与裸词都不再唤醒。识别语言与界面语言互相独立：可以要英文菜单、说中文指令。

每条命令有一个稳定内部 id：匹配用别名，反馈、清单和测试都用 id，因此改措辞不会牵连下游。同一句话被识别器重复投递只执行一次（1.5 秒窗口），过了窗口再说算新的指令；助手自己播报后的 1.4 秒内不听输入，避免自我触发。

| 内部 id | 中文说法 | 英文说法 | 统一动作 |
| --- | --- | --- | --- |
| menu.open | 打开菜单 / 显示菜单 | open menu / show menu | OPEN_MENU |
| menu.close | 关闭菜单 / 收起菜单 | close menu / hide menu | CLOSE_MENU |
| settings.open | 打开设置 / 系统设置 | open settings | OPEN_SETTINGS |
| mode.canvas | 打开平面画板 / 平面绘画 / 二维画板 / 打开画板 / 二维 | canvas mode / 2d | SWITCH_MODE CANVAS_DRAW |
| mode.spatial | 进入三维绘画 / 三维绘画 / 空间绘画 / 三维 | 3d mode / spatial | SWITCH_MODE SPATIAL_DRAW |
| mode.model | 进入模型模式 / 模型模式 / 模型操控 | model mode | SWITCH_MODE MODEL_CONTROL |
| lab.open | 打开玩具 / 打开实验室 / 互动玩具 | open playlab / open toys | OPEN_PLAYLAB |
| toy.\* | 打开光球 / 粒子 / 流体 / 海洋 / 烟花 | orb / galaxy / fluid / ocean / fireworks | OPEN_TOY |
| page.next / page.previous | 下一页 / 上一页 | next page / previous page | NEXT_PAGE / PREVIOUS_PAGE |
| edit.undo / edit.redo | 撤销 / 重做 | undo / redo | UNDO / REDO |
| file.save | 保存作品 / 保存 | save | SAVE |
| gallery.open / help.open | 打开作品库 / 打开帮助（使用说明） | open gallery / open help | OPEN_GALLERY / OPEN_HELP |
| theme.day / theme.night | 切换白天 / 切换夜间 | day mode / night mode | SET_THEME |
| language.switch | 切换语言 / 换语言 / 英文界面 | switch language / english | SET_LANGUAGE |
| brush.bigger / brush.smaller | 笔刷大一点 / 粗一点 / 小一点 / 细一点 | bigger brush / smaller brush | SET_BRUSH_SIZE ±1 |
| colour.panel | 选择颜色 / 打开颜色面板 | pick colour / choose colour | OPEN_COLOR_PANEL |
| colour.set | 选择红色、换成蓝色…（颜色词可带动词） | set it red / use blue | SET_COLOR |
| view.center / view.exit | 居中作品 / 退出查看 | center artwork / exit view | CENTER_ARTWORK / EXIT_VIEW_MODE |
| nav.home | 返回首页 / 返回 | home / back | HOME |
| canvas.clear | **清空画布**（必须整句说出） | — | 进入 CONFIRMING |
| canvas.clear.confirmed | **确认清空** | — | CLEAR_CANVAS confirmed |
| edit.cancel | 取消 | cancel | CANCEL |

颜色词表：红 / 橙 / 黄 / 绿 / 青 / 蓝 / 紫 / 白 / 黑（red orange yellow green cyan blue purple white black）。「背景颜色」「打开背景颜色」不会改画笔颜色。

**安全边界**：清空、删除、重置一类破坏性命令不做模糊匹配 —— “把画布清了”不会被执行；`清空画布` 必须完整说出，再 `确认清空`，也可以 `取消`。确认面板同时支持 PINCH。确认期间其它低优先级指令暂停，超时自动取消。

语音只做应用内动作：不能替代浏览器原生权限弹窗、文件选择框，也不能用 gesture 绕过它们。

## 架构与隐私

`VoiceAssistantService → VoiceCommandRouter → AppCommandBus → App adapter`。语音不访问 React 组件；模式、撤销、保存、主题等手势入口也走同一命令总线。绘画中的撤销/保存排队到该笔结束，切换模式先释放抓取。旧专用工具、对象编辑和部分导航仍使用既有回调，全面总线迁移尚未完成。

SpeechProvider 可替换；WakeWordProvider 预留。默认封装 SpeechRecognition / webkitSpeechRecognition；麦克风拒绝和不支持都不影响摄像头。断连延迟重启，每分钟最多六次，随后显示重试，不无限循环。OFF / REQUESTING_PERMISSION / SLEEPING / WAKE_LISTENING / ACTIVE_LISTENING / PROCESSING / CONFIRMING / SUCCESS / ERROR 是统一状态协议；SLEEPING 为预留状态。

**浏览器语音可能把音频发送到浏览器厂商在线服务。** 本版本不是离线唤醒引擎，不宣称语音全部本地。摄像头与手部识别仍在浏览器本地进行。未接入 Vosk、Porcupine 或任何前端密钥。不支持语音时继续使用手势。

## 参考与许可证（2026-10-06核对）

| 项目 | 许可证 / 本阶段采用 |
| --- | --- |
| [annyang](https://github.com/TalAter/annyang) | MIT；参考确定性命令映射，未安装或复制源码 |
| [vosk-browser](https://github.com/ccoreilly/vosk-browser/blob/master/COPYING) | Apache-2.0；研究可插拔离线方案，未接入；模型许可证需另核对 |
| [vosk-api](https://github.com/alphacep/vosk-api/blob/master/COPYING) | Apache-2.0；未接入 |
| [Porcupine Web](https://github.com/Picovoice/porcupine/tree/master/binding/web) | 仓库 LICENSE Apache-2.0；Web SDK 要求 AccessKey，实际服务/模型使用条件另核对，未接入 |
| [Motion](https://github.com/motiondivision/motion) | MIT；沿用已安装 Motion，统一 DOM 动效 |

[MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition) 说明浏览器兼容性和服务端识别的可能性。自动化以模拟识别事件验证路由，尚未替代真人麦克风、噪声与口音测试。
