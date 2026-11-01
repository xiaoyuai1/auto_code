// _t_recall.js — 紧急撤回刚发出的气泡 (2分钟窗口内)
console.log("__START__");
var B = require("./lib/shizuku-lib.js");
try {
    if (!B.bSelfCheck()) { console.log("__DONE__"); }
    else {
        B.sh("am start -n com.tencent.mm/.ui.LauncherUI"); // 前置任务→聊天页
        sleep(2500);
        var img = B.bScreencap("/sdcard/_recall.png");
        var rs = img ? B.bOcr(img) : [];
        if (img) img.recycle();
        // 找右侧自己的气泡 (含"消息已收到")
        var tgt = null;
        for (var i = 0; i < (rs || []).length; i++) {
            var it = rs[i], b = it.bounds;
            var cx = (b.left + b.right) / 2, cy = (b.top + b.bottom) / 2;
            if (it.text.indexOf("消息已收到") >= 0 && cx > 0.6 * device.width) {
                if (!tgt || cy > tgt.cy) tgt = { x: Math.round(cx), y: Math.round(cy) };
            }
        }
        console.log("目标气泡: " + JSON.stringify(tgt));
        if (!tgt) { console.log("未找到气泡(可能已撤回或页面变化)"); console.log("__DONE__"); }
        else {
            B.bLongPress(tgt.x, tgt.y, 950); sleep(1300);
            var img2 = B.bScreencap("/sdcard/_recall2.png");
            var rs2 = img2 ? B.bOcr(img2) : [];
            if (img2) img2.recycle();
            var rec = null;
            for (var k = 0; k < (rs2 || []).length; k++) {
                var b2 = rs2[k].bounds;
                if (rs2[k].text.indexOf("撤回") >= 0) rec = { x: Math.round((b2.left + b2.right) / 2), y: Math.round((b2.top + b2.bottom) / 2) };
            }
            console.log("撤回项: " + JSON.stringify(rec));
            if (rec) {
                B.bTap(rec.x, rec.y); sleep(1500);
                console.log("已点撤回");
            } else {
                console.log("弹框无撤回项(可能超时或非自己消息)");
            }
        }
    }
} catch (e) { console.error("异常: " + e); }
console.log("__DONE__");
