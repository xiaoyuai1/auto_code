console.log("__START__");
var B = require("./lib/shizuku-lib.js");
try {
    B.sh("am start -n com.tencent.mm/.ui.LauncherUI"); sleep(2500);
    var img = B.bScreencap("/sdcard/_peek.png");
    var rs = img ? B.bOcr(img) : [];
    if (img) img.recycle();
    var items = [];
    for (var i = 0; i < (rs || []).length; i++) {
        var b = rs[i].bounds;
        items.push({ t: rs[i].text, cy: Math.round((b.top + b.bottom) / 2) });
    }
    items.sort(function (a, b2) { return a.cy - b2.cy; });
    for (var k = 0; k < items.length; k++) console.log("  y=" + items[k].cy + " \"" + items[k].t + "\"");
} catch (e) { console.error("异常: " + e); }
console.log("__DONE__");
