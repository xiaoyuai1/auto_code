/**
 * PaddleOCR v6 全档位插件修复 (medium/small/tiny 通用)
 * 根因链: 插件 stopped → 自动唤醒失败 (meta .WakeActivity 拼名 bug) → 插件中心记为未启用
 * 修复: 枚举全部已安装 v6.* 插件 → 真实 WakeActivity 唤醒 → 直写启用位 → detect 冒烟
 */

var PREFIX = "io.github.supermonster003.autojs6.plugin.paddleocr.v6.";

function isStopped(pkg) {
    try {
        let ai = context.getPackageManager().getApplicationInfo(pkg, 0);
        return (ai.flags & android.content.pm.ApplicationInfo.FLAG_STOPPED) !== 0;
    } catch (e) { return "ERR"; }
}

function wakePlugin(pkg) {
    var wakeComp = null;
    try {
        let acts = context.getPackageManager().getPackageInfo(pkg,
            context.getPackageManager().GET_ACTIVITIES).activities || [];
        for (let i = 0; i < acts.length; i++) {
            if (/WakeActivity$/.test(acts[i].name)) {
                wakeComp = new android.content.ComponentName(pkg, acts[i].name);
                break;
            }
        }
    } catch (e) {
        console.error("  枚举 Activity 失败: " + e);
        return false;
    }
    if (!wakeComp) { console.error("  未找到 WakeActivity"); return false; }
    try {
        context.startActivity(new android.content.Intent()
            .setComponent(wakeComp)
            .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK));
        sleep(2500);
        // 回到 AutoJs6
        try {
            context.startActivity(context.getPackageManager()
                .getLaunchIntentForPackage(context.getPackageName())
                .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (e2) {}
        return true;
    } catch (e) {
        console.error("  唤醒失败: " + String(e.message || e).split("\n")[0]);
        return false;
    }
}

function setEnableBit(pkg, value) {
    let sp = context.getSharedPreferences("plugin_center_enable_state",
        android.content.Context.MODE_PRIVATE);
    let key = "key_$_enabled_plugin_$_" + pkg;
    let before = sp.getBoolean(key, true);
    sp.edit().putBoolean(key, value).commit();
    console.log("  启用位 " + before + " -> " + sp.getBoolean(key, true));
}

function main() {
    console.show();

    // 1. 枚举已安装的 v6.* 插件
    let PM = context.getPackageManager();
    let pkgs = PM.getInstalledPackages(0);
    var targets = [];
    for (let i = 0; i < pkgs.size(); i++) {
        let p = String(pkgs.get(i).packageName);
        if (p.indexOf(PREFIX) === 0) targets.push(p);
    }
    console.log("[1/3] 发现 " + targets.length + " 个 v6 插件: " + targets.join(", "));

    // 2. 逐个修复
    console.log("[2/3] 逐个修复 ...");
    targets.forEach(function (pkg, idx) {
        console.log("── " + (idx + 1) + "/" + targets.length + " " + pkg.replace(PREFIX, "") + " ──");
        let s0 = isStopped(pkg);
        console.log("  stopped=" + s0);
        if (s0 === true) {
            if (wakePlugin(pkg)) console.log("  唤醒后 stopped=" + isStopped(pkg));
        }
        console.log("  写启用位:");
        setEnableBit(pkg, true);
    });

    // 3. detect 冒烟 (不区分档位, 仅验证通道可用)
    console.log("[3/3] paddle detect 冒烟 ...");
    try {
        ocr.mode = "paddle";
        let img = images.captureScreen();
        if (!img) { console.warn("截屏失败, 跳过冒烟 (不影响修复结果)"); }
        else {
            let t0 = Date.now();
            let res = ocr.paddle.detect(img);
            console.log("detect OK: " + res.length + " 项, " + (Date.now() - t0) + "ms");
            img.recycle();
        }
    } catch (e) {
        console.error("冒烟失败: " + String(e.message || e).split("\n")[0]);
    } finally {
        try { ocr.mode = "mlkit"; } catch (e3) {}
    }
    console.log("__DONE__");
}

try {
    main();
} catch (e) {
    console.error("修复脚本异常: " + e + "\n" + (e && e.stack || ""));
    console.log("__DONE__");
}
