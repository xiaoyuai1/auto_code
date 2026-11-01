// _v2e_input_fix4.js — ASCII截图取证 + 长按鲁棒导航 (退根重试)
console.log("__START__");

const DUMP = "/sdcard/_v2e_dump.xml";
const SHOT = "/sdcard/_v2e_search.png";
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
function textsOf(xml) {
    let out = [], re = /text="([^"]+)"/g, m;
    while ((m = re.exec(xml))) { if (m[1].length <= 40) out.push(m[1]); }
    return out;
}
function nodeByText(xml, exact) {
    let m = xml.match(new RegExp('text="' + exact + '"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"'));
    if (!m) return null;
    return { cx: Math.round((+m[1] + +m[3]) / 2), cy: Math.round((+m[2] + +m[4]) / 2) };
}

try {
    // ===== 1. ASCII 输入 + 截图取证 =====
    sh("input keyevent 3"); sleep(600);
    sh("am force-stop com.android.settings");
    sh("am start -a android.settings.SETTINGS"); sleep(2200);
    let xml1 = dumpXml();
    let ns = xml1 ? nodeByText(xml1, "搜索设置项") : null;
    if (ns) {
        sh("input tap " + ns.cx + " " + ns.cy); sleep(1800);
        sh("input text wifi_test_9x"); sleep(1500);
        let xml2 = dumpXml();
        sh("screencap -p " + SHOT);
        let inDump = !!(xml2 && xml2.indexOf("wifi_test_9x") >= 0);
        report("1.input text ASCII", inDump, "dump含=" + inDump + " (截图 _v2e_search.png 人工复核)");
        console.log("  dump文本: " + (xml2 ? textsOf(xml2).slice(0, 10).join("|") : "null"));
        sh("input keyevent 4"); sleep(700); sh("input keyevent 4"); sleep(700);
    } else {
        report("1.input text ASCII", false, "未找到搜索框");
    }

    // ===== 2. AutoJs6 长按: 循环退回根列表 =====
    sh("am start -n com.xiaoyu.ai/org.autojs.autojs.ui.main.MainActivity"); sleep(1800);
    sh("input tap 160 420"); sleep(900); // 文件 Tab 固定位置 (从截图换算)
    let nf = null, rootXml = null;
    for (let i = 0; i < 5 && !nf; i++) {
        let x = dumpXml();
        if (!x) break;
        nf = nodeByText(x, "autojs1030");
        if (nf) { rootXml = x; break; }
        console.log("  第" + (i + 1) + "次退回: " + textsOf(x).slice(0, 6).join("|"));
        sh("input keyevent 4"); sleep(1000);
    }
    if (nf) {
        sh("input swipe " + nf.cx + " " + nf.cy + " " + nf.cx + " " + nf.cy + " 900"); sleep(1600);
        let xml3 = dumpXml();
        let menuHit = xml3 && /重命名|删除|属性|详情|快捷方式|压缩|发送|移动/.test(xml3);
        report("2.长按[autojs1030]弹菜单", !!menuHit, xml3 ? "弹层文本: " + (textsOf(xml3).slice(0, 14).join("|")).slice(0, 150) : "dump失败");
        sh("input keyevent 4"); sleep(900);
    } else {
        report("2.长按", false, "5 次退回后仍在根列表未找到");
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
