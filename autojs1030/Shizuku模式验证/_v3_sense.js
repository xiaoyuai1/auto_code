// _v3_sense.js — Shizuku 感知族验证 (v3)
// 验证项: screencap→images.read 链路+耗时 / uiautomator dump 耗时+解析 / dumpsys 前台判断 / 微信只读侦察
console.log("__START__");

const SHOT = "/sdcard/_v3_s.png";
const DUMP = "/sdcard/_v3_d.xml";
let pass = 0, fail = 0;
function report(name, ok, detail) {
    if (ok) pass++; else fail++;
    console.log((ok ? "[PASS] " : "[FAIL] ") + name + " → " + detail);
}
function sh(cmd) {
    let r = shizuku(cmd);
    if (!r || r.code !== 0) console.log("  [sh] '" + cmd.slice(0, 70) + "' code=" + (r && r.code) + " err=" + String(r && r.error).trim().slice(0, 70));
    return r;
}
function dumpXml() {
    let r = sh("uiautomator dump " + DUMP);
    if (r && r.code === 0 && files.exists(DUMP)) {
        let s = files.read(DUMP);
        if (s && s.indexOf("<node") >= 0) return s;
    }
    return null;
}

try {
    // ===== 1. screencap → images.read 链路 =====
    sh("am force-stop com.android.settings");
    sh("am start -a android.settings.SETTINGS"); sleep(2000);
    let times = [];
    let img = null;
    for (let i = 0; i < 3; i++) {
        let t0 = Date.now();
        let r = sh("screencap -p " + SHOT);
        times.push(Date.now() - t0);
        if (i === 0 && r && r.code === 0) {
            img = images.read(SHOT);
        }
    }
    let avgShot = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    if (img) {
        report("1.screencap→images.read", true, "尺寸=" + img.getWidth() + "x" + img.getHeight() + " 3次耗时=" + times.join(",") + "ms 均值=" + avgShot + "ms");
        img.recycle();
    } else {
        report("1.screencap→images.read", false, "images.read 失败 (耗时=" + times.join(",") + "ms)");
    }

    // ===== 2. uiautomator dump 耗时 + 解析 =====
    let dtimes = [];
    let xml = null;
    for (let i = 0; i < 3; i++) {
        let t0 = Date.now();
        xml = dumpXml();
        dtimes.push(Date.now() - t0);
    }
    let nodeCnt = xml ? (xml.match(/<node/g) || []).length : 0;
    let m = xml ? xml.match(/text="([^"]{2,12})"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/) : null;
    report("2.uiautomator dump+解析", !!xml && nodeCnt > 0,
        "nodes=" + nodeCnt + " 3次耗时=" + dtimes.join(",") + "ms 均值=" + Math.round(dtimes.reduce((a, b) => a + b, 0) / 3) + "ms 首节点=" + (m ? m[1] + "@(" + Math.round((+m[2] + +m[4]) / 2) + "," + Math.round((+m[3] + +m[5]) / 2) + ")" : "无"));

    // ===== 3. dumpsys 前台判断 =====
    let fw = sh("dumpsys window 2>/dev/null | grep -E 'mCurrentFocus'");
    let fa = sh("dumpsys activity activities 2>/dev/null | grep -E 'topResumedActivity|mResumedActivity'");
    let fwS = String(fw && fw.result || "").trim(), faS = String(fa && fa.result || "").trim();
    report("3.dumpsys 前台判断", /settings/i.test(fwS) || /settings/i.test(faS), "window=[" + fwS.split("\n").pop().trim().slice(0, 80) + "] activity=[" + faS.split("\n").pop().trim().slice(0, 80) + "]");

    // ===== 4. 微信只读侦察 (反无障碍取证) =====
    sh("am start -n com.tencent.mm/.ui.LauncherUI"); sleep(3000);
    let wxXml = dumpXml();
    let wxNodes = wxXml ? (wxXml.match(/<node/g) || []).length : 0;
    let wxTexts = [];
    if (wxXml) {
        let re = /text="([^"]{1,20})"/g, mm;
        while ((mm = re.exec(wxXml)) && wxTexts.length < 8) { if (mm[1].trim()) wxTexts.push(mm[1]); }
    }
    let wxShot = sh("screencap -p /sdcard/_v3_wx.png");
    report("4.微信dump侦察(只读)", wxXml !== null, "nodes=" + wxNodes + " 文本样本=[" + wxTexts.join("|") + "] screencap=" + (wxShot && wxShot.code === 0 ? "ok" : "fail"));
    sh("input keyevent 3");

    sh("rm -f " + SHOT + " " + DUMP);
} catch (e) {
    console.error("全局异常: " + e.message + " | " + e.stack);
    report("全局异常", false, e.message);
    try { shizuku("rm -f /sdcard/_v3_s.png /sdcard/_v3_d.xml"); shizuku("input keyevent 3"); } catch (e2) {}
}

console.log("== 汇总: PASS=" + pass + " FAIL=" + fail + " ==");
console.log("__DONE__");
