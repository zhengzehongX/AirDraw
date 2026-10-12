import { currentLocale } from '../i18n';
/** Legacy labels are translated at their component boundary, never used as state. */
const EN: Record<string,string> = {
 '设置':'Settings','关闭':'Close','完成':'Done','摄像头与手':'Camera & hands','摄像头':'Camera',
 '运行中':'Ready','正在启动':'Starting','加载模型':'Loading model','已停止':'Stopped','不可用':'Unavailable','未启动':'Off','模拟信号':'Simulated input',
 '重新连接摄像头':'Reconnect camera','重新连接':'Reconnect','主用手':'Dominant hand','自动':'Auto','左手':'Left','右手':'Right',
 '指针灵敏度':'Pointer sensitivity','平滑':'Smooth','跟手':'Responsive','默认':'Default','捏合辅助':'Pinch assistance',
 '手势灵敏度':'Dock hold duration','张掌呼出工具栏的保持时长':'How long to hold an open palm',
 '画面与动效':'Appearance & motion','减弱动效':'Reduced motion','跟随系统':'System','开':'On','关':'Off',
 '互动玩具':'Interactive toys','超清':'Ultra','高':'High','均衡':'Balanced','省电':'Performance',
 '开发者模式':'Developer mode','打开后会显示追踪诊断信息':'Show tracking diagnostics','已开启':'On','已关闭':'Off',
 '语音助手':'Voice assistant','语音识别':'Speech recognition','单独申请麦克风权限':'Microphone permission is separate',
 '开启语音助手':'Enable voice assistant','关闭语音助手':'Disable voice assistant','开启':'Enable','唤醒短语':'Wake phrase',
 '你好，AirDraw':'你好，AirDraw','AirDraw，听我说':'AirDraw，听我说','中文':'中文',
 '语音反馈':'Spoken feedback','静音':'Muted','重新学习教程':'Replay tutorial','下次打开时会重新进入教程':'Start the interactive tutorial again',
 '重新开始':'Start again','摄像头画面只在本机处理，不会上传。':'Camera frames stay on this device.',
 '浏览器语音服务可能联网处理音频。摄像头与手势不受语音授权影响。':'Browser speech services may process audio online. Voice permission does not affect hand tracking.',
 '默认接触范围：指尖要几乎相触':'Default range: bring the fingertips close together',
};
export const settingsCopy=(source:string)=>{
 if(currentLocale()!=='en')return source;
 const assist=/^接触范围 \+(\d+)%：/.exec(source);
 if(assist)return `Contact assistance +${assist[1]}%`;
 return EN[source]??source;
};
