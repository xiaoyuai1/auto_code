/**
 * 诊断 PaddleOCR v6 插件 bindService 失败原因
 * 1) 插件包是否安装 / 版本 / enabled 状态 / stopped 状态
 * 2) Service 是否存在且 exported
 * 3) 实际调用 ocr 相关 API 复现完整堆栈
 */

var PLUGIN = "io.github.supermonster003.autojs6.plugin.paddleocr.v6.medium";

function main() {
    let PM = context.getPackageManager();

    // 1. 包状态
    let pi = null;
    try {
        pi = PM.getPackageInfo(PLUGIN, android.content.pm.PackageManager.GET_ACTIVITIES
            | android.content.pm.PackageManager.GET_META_DATA);
    } catch (e) {
        console.error("PKG_NOT_FOUND: " + e);
        console.log("__DONE__");
        return;
    }
    let ai = pi.applicationInfo;
    console.log("verName=" + pi.versionName + " verCode=" + pi.versionCode);
    console.log("enabled=" + (ai.enabled ? "true" : "false(" + ai.enabledSetting + ")")
        + " stopped=" + ((ai.flags & android.content.pm.ApplicationInfo.FLAG_STOPPED) !== 0));
    console.log("flags=0x" + java.lang.Long.toHexString(ai.flags));
    console.log("metaData=" + (ai.metaData ? ai.metaData.keySet().toString() : "null"));

    // 2. 枚举插件包里的 Service
    let svcs = PM.getPackageInfo(PLUGIN, android.content.pm.PackageManager.GET_SERVICES).services || [];
    for (let i = 0; i < svcs.length; i++) {
        let s = svcs[i];
        console.log("SVC[" + i + "] " + s.name
            + " exported=" + s.exported + " enabled=" + s.enabled
            + " perm=" + (s.permission || "-"));
    }

    // 3. 复现: plugins.load + 实际 OCR 调用, 抓完整堆栈
    try {
        let m = plugins.load(PLUGIN);
        console.log("plugins.load OK: " + m);
        // v6 medium 插件对外暴露的工厂
        let keys = [];
        try { for (let k in m) keys.push(k); } catch (e2) {}
        console.log("module keys=[" + keys.join(",") + "]");
        // 尝试真正触发 bind (ocr 初始化)
        if (m && typeof m.createOCR === "function") {
            let engine = m.createOCR();
            console.log("createOCR OK: " + engine);
        } else if (m && m.OCR) {
            console.log("has m.OCR");
        }
    } catch (e) {
        console.error("REPRO_FAIL: " + e);
        console.error("STACK:\n" + (e && e.stack || "(no stack)"));
    }
    console.log("__DONE__");
}

try {
    main();
} catch (e) {
    console.error("诊断脚本异常: " + e + "\n" + (e && e.stack || ""));
    console.log("__DONE__");
}
