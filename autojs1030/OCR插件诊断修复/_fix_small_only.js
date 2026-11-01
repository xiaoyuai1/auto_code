// _fix_small_only.js — 定向修复: 停用 medium / 启用+唤醒 small / 冒烟验证耗时
var PREFIX = "io.github.supermonster003.autojs6.plugin.paddleocr.v6.";
var MEDIUM = PREFIX + "medium", SMALL = PREFIX + "small";

function setEnableBit(pkg, value) {
    let sp = context.getSharedPreferences("plugin_center_enable_state",
        android.content.Context.MODE_PRIVATE);
    let key = "key_$_enabled_plugin_$_" + pkg;
    let before = sp.getBoolean(key, true);
    sp.edit().putBoolean(key, value).commit();
    console.log("  " + pkg.replace(PREFIX, "") + " 启用位 " + before + " -> " + sp.getBoolean(key, true));
}
function wakePlugin(pkg) {
    let acts = context.getPackageManager().getPackageInfo(pkg,
        context.getPackageManager().GET_ACTIVITIES).activities || [];
    for (let i = 0; i < acts.length; i++) {
        if (/WakeActivity$/.test(acts[i].name)) {
            context.startActivity(new android.content.Intent()
                .setComponent(new android.content.ComponentName(pkg, acts[i].name))
                .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK));
            sleep(2500);
            try {
                context.startActivity(context.getPackageManager()
                    .getLaunchIntentForPackage(context.getPackageName())
                    .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (e2) {}
            return true;
        }
    }
    return false;
}

console.log("__START__");
setEnableBit(MEDIUM, false);   // 恢复用户选择: 仅 small
setEnableBit(SMALL, true);
wakePlugin(SMALL);
sleep(1000);

console.log("[冒烟] paddle detect (预期 ~3-4s 为 small; 11s+ 说明仍绑 medium)");
try {
    ocr.mode = "paddle";
    let img = images.captureScreen();
    let t0 = Date.now();
    let rs = ocr.paddle.detect(img);
    console.log("  detect OK: " + rs.length + " 项, " + (Date.now() - t0) + "ms");
    img.recycle();
} catch (e) {
    console.error("  detect 失败: " + String(e.message || e).split("\n")[0]);
} finally { ocr.mode = "mlkit"; }
console.log("__DONE__");
