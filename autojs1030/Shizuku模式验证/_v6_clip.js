// _v6_clip.js — Shizuku 中文输入验证 (v6): setClip→粘贴链路 + 剪贴板时序
console.log("__START__");

const PAYLOAD = "测试中文abc123";
const DUMP = "/sdcard/_v6_d.xml";
let pass = 0, fail = 0;
function report(name, ok, detail) {
    if (ok) pass++; else fail++;
    console.log((ok ? "[PASS] " : "[FAIL] ") + name + " → " + detail);
}
function sh(cmd) {
    let r = shizuku(cmd);
    if (!r || r.code !== 0) console.log("  [sh] '" + cmd.slice(0, 60) + "' code=" + (r && r.code) + " err=" + String(r && r.error).trim().slice(0, 80));
    return r;
}
function dumpXml(retry) {
    for (let i = 0; i < (retry || 3); i++) {
        let r = sh("uiautomator dump " + DUMP);
        if (r && r.code === 0 && files.exists(DUMP)) {
            let s = files.read(DUMP);
            if (s && s.indexOf("<node") >= 0) return s;
        }
        sleep(800);
    }
    return null;
}
function nodeByText(xml, exact) {
    let m = xml.match(new RegExp('text="' + exact + '"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"'));
    if (!m) return null;
    return { cx: Math.round((+m[1] + +m[3]) / 2), cy: Math.round((+m[2] + +m[4]) / 2) };
}

try {
    // 前置: 设置页搜索框
    sh("input keyevent 3"); sleep(600);
    sh("am force-stop com.android.settings");
    sh("am start -a android.settings.SETTINGS"); sleep(2000);
    let xml1 = dumpXml();
    let ns = xml1 ? nodeByText(xml1, "搜索设置项") : null;
    if (!ns) { report("前置搜索框", false, "未找到"); console.log("__DONE__"); }
    else {
        // ===== 方案1: 后台直接 setClip → PASTE =====
        setClip(PAYLOAD);
        sleep(400);
        let clipBack = "";
        try { clipBack = String(getClip()); } catch (eG) { clipBack = "<读取异常:" + eG.message + ">"; }
        console.log("  后台setClip读回: " + clipBack.slice(0, 40));
        sh("input tap " + ns.cx + " " + ns.cy); sleep(1600);
        sh("input keyevent 279"); sleep(1400); // KEYCODE_PASTE
        let xml2 = dumpXml();
        let plan1 = !!(xml2 && xml2.indexOf(PAYLOAD) >= 0);
        report("1.方案1: 后台setClip→279粘贴", plan1, "读回=" + (clipBack.indexOf(PAYLOAD) >= 0 ? "一致" : clipBack.slice(0, 25)) + " 回显=" + (plan1 ? "已上屏" : "未上屏"));

        // ===== 方案2: 前台 setClip (AutoJs6 置前) → 回搜索页 → PASTE =====
        if (!plan1) {
            sh("am start -n com.xiaoyu.ai/org.autojs.autojs.ui.main.MainActivity"); sleep(1500);
            setClip(PAYLOAD);
            sleep(500);
            let clipBack2 = "";
            try { clipBack2 = String(getClip()); } catch (eG2) { clipBack2 = "<读取异常:" + eG2.message + ">"; }
            sh("am start -a android.settings.SETTINGS"); sleep(1800); // 搜索页仍在task顶
            sh("input keyevent 279"); sleep(1400);
            let xml3 = dumpXml();
            let plan2 = !!(xml3 && xml3.indexOf(PAYLOAD) >= 0);
            report("2.方案2: 前台setClip→回切→279粘贴", plan2, "前台读回=" + (clipBack2.indexOf(PAYLOAD) >= 0 ? "一致" : clipBack2.slice(0, 25)) + " 回显=" + (plan2 ? "已上屏" : "未上屏"));
            if (!plan2) {
                // 方案3: 长按输入框 → 菜单粘贴 (dump找「粘贴」坐标)
                sh("input swipe 632 660 632 660 950"); sleep(1500); // 长按搜索输入框(顶部固定区)
                let xmlM = dumpXml();
                let mp = xmlM ? (function () {
                    let m = xmlM.match(/text="粘贴"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
                    return m ? { cx: Math.round((+m[1] + +m[3]) / 2), cy: Math.round((+m[2] + +m[4]) / 2) } : null;
                })() : null;
                if (mp) {
                    sh("input tap " + mp.cx + " " + mp.cy); sleep(1400);
                    let xml4 = dumpXml();
                    report("3.方案3: 长按菜单→粘贴", !!(xml4 && xml4.indexOf(PAYLOAD) >= 0), "菜单命中粘贴@(" + mp.cx + "," + mp.cy + ")");
                } else {
                    report("3.方案3: 长按菜单→粘贴", false, "长按菜单未出现或无「粘贴」项");
                }
            }
        }
        sh("input keyevent 4"); sleep(600); sh("input keyevent 4"); sleep(600);
    }
    sh("input keyevent 3");
    sh("rm -f " + DUMP);
} catch (e) {
    console.error("全局异常: " + e.message + " | " + e.stack);
    report("全局异常", false, e.message);
    try { shizuku("rm -f " + DUMP); shizuku("input keyevent 3"); } catch (e2) {}
}

console.log("== 汇总: PASS=" + pass + " FAIL=" + fail + " ==");
console.log("__DONE__");
