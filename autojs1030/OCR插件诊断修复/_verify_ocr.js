/** 复验: 状态稳定性 + 二次识别速度 */
var PLUGIN = "io.github.supermonster003.autojs6.plugin.paddleocr.v6.medium";
function main() {
    let ai = context.getPackageManager().getApplicationInfo(PLUGIN, 0);
    console.log("stopped=" + ((ai.flags & android.content.pm.ApplicationInfo.FLAG_STOPPED) !== 0));
    let sp = context.getSharedPreferences("plugin_center_enable_state",
        android.content.Context.MODE_PRIVATE);
    console.log("enabledBit=" + sp.getBoolean("key_$_enabled_plugin_$_" + PLUGIN, true));
    ocr.mode = "paddle";
    let img = images.captureScreen();
    let t0 = Date.now();
    let res = ocr.paddle.detect(img);
    console.log("二次 detect: " + res.length + " 项, 耗时 " + (Date.now() - t0) + "ms");
    img.recycle();
    try { ocr.mode = "mlkit"; } catch (e) {}
    console.log("__DONE__");
}
try { main(); } catch (e) { console.error(e + "\n" + (e && e.stack || "")); console.log("__DONE__"); }
