// _v2d_input_fix3.js — v2 终版补测 (force-stop 复位法, 顺带验证 shell 特有权限)
console.log("__START__");

const DUMP = "/sdcard/_v2d_dump.xml";
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
    // ===== 0. force-stop 复位设置 (shell 特有能力验证) =====
    sh("input keyevent 3"); sleep(600);
    let rfs = sh("am force-stop com.android.settings");
    sh("am start -a android.settings.SETTINGS"); sleep(2200);
    let xml0 = dumpXml();
    let t0 = xml0 ? textsOf(xml0).join(",") : "";
    report("0.am force-stop+重启设置(复位到主页)", !!xml0 && t0.indexOf("搜索设置项") >= 0 && /WLAN|蓝牙/.test(t0), "code=" + (rfs && rfs.code) + " 首文本[" + t0.slice(0, 70) + "]");

    // ===== 1. tap[蓝牙] 内容变化判据 =====
    let n1 = xml0 ? nodeByText(xml0, "蓝牙") : null;
    if (n1) {
        sh("input tap " + n1.cx + " " + n1.cy); sleep(1700);
        let xml2 = dumpXml();
        let t2 = xml2 ? textsOf(xml2).join(",") : "";
        report("1.input tap[蓝牙]→内容变化", !!xml2 && t2 !== t0, "后[" + t2.slice(0, 60) + "]");
        sh("input keyevent 4"); sleep(1100);
    } else {
        report("1.input tap[蓝牙]", false, "主页无蓝牙文本: " + t0.slice(0, 80));
    }

    // ===== 2/3. 搜索框 ASCII + 中文 =====
    let xml3 = dumpXml();
    let ns = xml3 ? nodeByText(xml3, "搜索设置项") : null;
    if (ns) {
        sh("input tap " + ns.cx + " " + ns.cy); sleep(1600);
        sh("input text wifi_test_9x"); sleep(1300);
        let xml4 = dumpXml();
        report("2.input text ASCII(搜索框回显)", !!xml4 && xml4.indexOf("wifi_test_9x") >= 0, xml4 ? "回显ok" : "dump失败");
        sh("input text 中文测试蓝牙"); sleep(1300);
        let xml5 = dumpXml();
        let cn = !!(xml5 && xml5.indexOf("中文测试") >= 0);
        report("3.input text 中文", cn, cn ? "意外: 中文可输入" : "符合预期: 未上屏 → v6 走 setClip+粘贴");
        sh("input keyevent 4"); sleep(700); sh("input keyevent 4"); sleep(700);
    } else {
        report("2/3.input text", false, "未找到搜索框");
    }

    // ===== 4. AutoJs6 长按: BACK 出文件夹 → 长按 autojs1030 =====
    sh("am start -n com.xiaoyu.ai/org.autojs.autojs.ui.main.MainActivity"); sleep(1800);
    sh("input keyevent 4"); sleep(1000); // 若在 autojs1030 文件夹内则退回根列表
    let xml6 = dumpXml();
    let nf = xml6 ? nodeByText(xml6, "autojs1030") : null;
    if (!nf && xml6) console.log("  根列表文本: " + textsOf(xml6).slice(0, 14).join("|"));
    if (nf) {
        sh("input swipe " + nf.cx + " " + nf.cy + " " + nf.cx + " " + nf.cy + " 900"); sleep(1500);
        let xml7 = dumpXml();
        let menuHit = xml7 && /重命名|删除|属性|详情|快捷方式|压缩|发送|移动/.test(xml7);
        report("4.长按[autojs1030]弹菜单", !!menuHit, xml7 ? "弹层文本: " + (textsOf(xml7).slice(0, 14).join("|")).slice(0, 150) : "dump失败");
        sh("input keyevent 4"); sleep(900);
    } else {
        report("4.长按", false, "根列表未见 autojs1030");
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
