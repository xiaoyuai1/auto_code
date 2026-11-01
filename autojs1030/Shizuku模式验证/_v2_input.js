// _v2_input.js — Shizuku 输入族验证 (v2)
// 靶场: 系统设置页 + AutoJs6 主页 (低风险页面)
// 验证项: am启动/tap/BACK/swipe/长按/input text(ASCII+中文)/motionevent曲线/HOME
console.log("__START__");

const DUMP = "/sdcard/_v2_dump.xml";
let pass = 0, fail = 0;
function report(name, ok, detail) {
    if (ok) pass++; else fail++;
    console.log((ok ? "[PASS] " : "[FAIL] ") + name + " → " + detail);
}
function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
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
function textsOf(xml) {
    let out = [], re = /text="([^"]+)"/g, m;
    while ((m = re.exec(xml))) { if (m[1].length <= 40) out.push(m[1]); }
    return out;
}
function nodeBy(xml, keyword) {
    let m = xml.match(new RegExp('text="[^"]*' + keyword + '[^"]*"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"'));
    if (!m) return null;
    return { cx: Math.round((+m[1] + +m[3]) / 2), cy: Math.round((+m[2] + +m[4]) / 2) };
}
function focusNow() {
    let r = sh("dumpsys window 2>/dev/null | grep -E 'mCurrentFocus'");
    let s = String(r && r.result).trim();
    if (!s) s = String(sh("dumpsys activity activities 2>/dev/null | grep -E 'topResumedActivity'").result || "").trim();
    return s;
}
function tap(x, y) { return sh("input tap " + x + " " + y); }
function keyev(k) { return sh("input keyevent " + k); }

try {
    // ===== 第一部分: 系统设置页靶场 =====
    let f0 = focusNow();
    console.log("  初始焦点: " + f0);
    sh("am start -a android.settings.SETTINGS");
    sleep(1800);
    let f1 = focusNow();
    report("1.am启动设置页", /settings/i.test(f1), f1);

    let xml1 = dumpXml();
    report("2.uiautomator dump 基线", !!xml1, xml1 ? ("nodes=" + (xml1.match(/<node/g) || []).length + " 首几文本: " + textsOf(xml1).slice(0, 6).join("|")).slice(0, 150) : "dump 失败");

    // 3. tap: 点中部第一个有文本的列表项 → 焦点变化
    let t = null;
    if (xml1) {
        let cand = textsOf(xml1).filter(s => s.length >= 2 && s.length <= 12);
        for (let i = 0; i < cand.length; i++) {
            let n = nodeBy(xml1, esc(cand[i]));
            if (n && n.cy > 500 && n.cy < 2500) { t = n; t.label = cand[i]; break; }
        }
    }
    if (t) {
        tap(t.cx, t.cy);
        sleep(1600);
        let f2 = focusNow();
        report("3.input tap 命中[" + t.label + "]", !!f2 && f2 !== f1, "焦点→ " + f2);
        keyev(4); sleep(1200);
        let f3 = focusNow();
        report("4.keyevent BACK 返回", f3 === f1, "焦点还原: " + f3);
    } else {
        report("3.input tap", false, "未找到可点列表项");
        report("4.keyevent BACK", false, "跳过");
    }

    // 5. swipe 滚动 (设置主页)
    let xmlA = dumpXml();
    let ta = xmlA ? textsOf(xmlA).join(",") : "";
    sh("input swipe 632 2200 632 800 400");
    sleep(1200);
    let xmlB = dumpXml();
    let tb = xmlB ? textsOf(xmlB).join(",") : "";
    report("5.input swipe 滚动", !!xmlA && !!xmlB && ta !== tb, "前[" + ta.slice(0, 60) + "] 后[" + tb.slice(0, 60) + "]");

    // ===== 第二部分: AutoJs6 主页靶场 =====
    sh("monkey -p com.xiaoyu.ai -c android.intent.category.LAUNCHER 1");
    sleep(1800);
    let xmlC = dumpXml();
    let lp = null;
    if (xmlC) {
        let cand = textsOf(xmlC);
        for (let i = 0; i < cand.length; i++) {
            if (/^\d{4}-\d{2}-\d{2}/.test(cand[i])) continue;
            let n = nodeBy(xmlC, esc(cand[i]));
            if (n && n.cy > 500 && n.cy < 2400 && cand[i].length >= 3 && cand[i].length <= 30) { lp = n; lp.label = cand[i]; break; }
        }
    }
    if (lp) {
        sh("input swipe " + lp.cx + " " + lp.cy + " " + lp.cx + " " + lp.cy + " 900");
        sleep(1400);
        let xmlD = dumpXml();
        let menuHit = xmlD && /重命名|删除|属性|详情|快捷方式|运行|编辑|打开/.test(xmlD);
        report("6.长按(零位移swipe 900ms)[" + lp.label + "]", !!menuHit, xmlD ? "弹层文本: " + (textsOf(xmlD).slice(0, 12).join("|")).slice(0, 150) : "dump失败");
        keyev(4); sleep(900);
    } else {
        report("6.长按", false, "未找到条目");
    }

    // 7/8. input text: ASCII 与 中文 (搜索框)
    let xmlE = dumpXml();
    let sc = null;
    if (xmlE) {
        let m = xmlE.match(/content-desc="([^"]*(搜索|search)[^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i);
        if (m) sc = { cx: Math.round((+m[3] + +m[5]) / 2), cy: Math.round((+m[4] + +m[6]) / 2), desc: m[1] };
    }
    if (sc) {
        tap(sc.cx, sc.cy); sleep(1200);
        sh("input text locator_demo_9x");
        sleep(1200);
        let xmlF = dumpXml();
        report("7.input text ASCII", !!xmlF && xmlF.indexOf("locator_demo_9x") >= 0, "desc=" + sc.desc);
        sh("input text 中文测试蓝牙");
        sleep(1200);
        let xmlG = dumpXml();
        let cnShown = !!(xmlG && xmlG.indexOf("中文测试") >= 0);
        report("8.input text 中文", cnShown, cnShown ? "意外: 中文可输入" : "符合预期: 中文未上屏 → 用 setClip+粘贴链路 (v6 验证)");
        keyev(4); sleep(600); keyev(4); sleep(600);
    } else {
        report("7.input text ASCII", false, "未找到搜索入口(content-desc 无 搜索/search)");
        report("8.input text 中文", false, "跳过");
    }

    // 9. motionevent 曲线手势 (AutoJs6 主页列表滚动)
    let xmlPre = dumpXml();
    let tp = xmlPre ? textsOf(xmlPre).join(",") : "";
    let md = sh("input motionevent DOWN 632 2000");
    if (!md || md.code !== 0) {
        report("9.motionevent 曲线", false, "DOWN 不支持: " + String(md && md.error).trim().slice(0, 90));
    } else {
        for (let i = 1; i <= 8; i++) {
            sh("input motionevent MOVE 632 " + Math.round(2000 - 1200 * i / 8));
            sleep(16);
        }
        sh("input motionevent UP 632 800");
        sleep(1000);
        let xmlPost = dumpXml();
        let tq = xmlPost ? textsOf(xmlPost).join(",") : "";
        report("9.motionevent 曲线", !!xmlPost && tp !== tq, "滚动前[" + tp.slice(0, 50) + "] 后[" + tq.slice(0, 50) + "]");
    }

    // 10. HOME
    keyev(3); sleep(900);
    let fh = focusNow();
    report("10.keyevent HOME", /launcher/i.test(fh), fh);

    sh("rm -f " + DUMP);
} catch (e) {
    console.error("全局异常: " + e.message + " | " + e.stack);
    report("全局异常", false, e.message);
    try { shizuku("rm -f " + DUMP); shizuku("input keyevent 3"); } catch (e2) {}
}

console.log("== 汇总: PASS=" + pass + " FAIL=" + fail + " ==");
console.log("__DONE__");
