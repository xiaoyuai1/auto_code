/**
 * _t_clip_test.js — 后台 getClip 实证 v2 (排除前台混淆变量)
 * 方法: am start 微信 → sleep 4s → dumpsys 证明确实在微信前台 → 直接 getClip
 * 判读: 前台=com.tencent.mm 且 RESULT 非空 → 本 ROM 后台读剪贴板放行, bGetClip 置前中间站可免
 */
var B = require('./lib/shizuku-lib.js');
B.sh('am start -n com.tencent.mm/.ui.LauncherUI');
sleep(4000);
var fw = String(B.bForeground());
var c;
try { c = String(getClip() || '(空)'); } catch (e) { c = '异常:' + e; }
console.log('RESULT 前台=[' + fw + '] getClip=[' + c + ']');
console.log('__CLIP_DONE__');
