import {currentLocale} from '../i18n';
const EN:Record<string,string>={
 '请让整只手进入画面':'Bring your whole hand into view','重新定位主手':'Reacquiring dominant hand','已接触':'Contact held','让整只手正对摄像头':'Face your whole hand toward the camera','已松开':'Released','拇指和食指张开':'Fingers open','指尖接近':'Approaching',
 '张开拇指和食指':'Separate your thumb and index finger',
 '让整只手回到画面':'Bring your whole hand into view',
 '指尖靠近约半厘米或轻触':'Bring the fingertips close or lightly touch',
 '掌心正对镜头，重新捏合':'Face your palm toward the camera and try again',
 '减慢捏合，接触后保持片刻':'Close slowly and hold briefly',
 '让指尖真正接触，保持片刻':'Touch your fingertips and hold briefly',
 '保持接触，然后完全松开':'Hold contact, then fully release',
 '三次接触差异较大，请保持掌心朝前重试':'Samples differ too much. Keep your palm forward and retry',
 '请让主手进入画面':'Bring your dominant hand into view',
 '当前为查看模式':'View mode is active',
 '张开手，解除暂停':'Open your hand to resume',
 '指针移出工具区，再松开捏合':'Move outside the tools and release',
 '当前为模型操控模式':'Model control is active',
 '当前页面暂停绘画':'Drawing is paused on this page',
 '当前输入焦点在界面':'The interface has input focus',
 '先完全松开，再捏合落笔':'Fully release, then pinch to draw',
 '正在重新定位手部':'Reacquiring your hand',
 '正在绘画':'Drawing',
 '导出输入诊断':'Export input diagnostic',
};
export const handStatusCopy=(source:string)=>currentLocale()==='en'?EN[source]??source:source;
