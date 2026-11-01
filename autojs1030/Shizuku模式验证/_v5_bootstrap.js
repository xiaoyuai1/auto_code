// _v5_bootstrap.js — Shizuku 自举族验证 (v5) — 无障碍自动开关全链路
// 阶段: 记录→对照(app-uid必败)→拉起(测延迟)→关闭(测延迟)→恢复原状 / 附appops投影预授权
console.log("__START__");

const SVC_PKG = "com.xiaoyu.ai";
const SVC_CLS = "org.autojs.autojs.core.accessibility.AccessibilityServiceUsher";
const KEY = "enabled_accessibility_services";
let pass = 0, fail = 0;
function report(name, ok, detail) {
    if (ok) pass++; else fail++;
    console.log((ok ? "[PASS] " : "[FAIL] ") + name + " → " + detail);
}
function sh(cmd) {
    let r = shizuku(cmd);
    if (!r || r.code !== 0) console.log("  [sh] '" + cmd.slice(0, 60) + "' code=" + (r && r.code) + " err=" + String(r && r.error).trim().slice(0, 90));
    return r;
}
function getSvc() { return String(sh("settings get secure " + KEY).result || "").trim(); }

try {
    // ===== 阶段0: 记录原状 =====
    let orig = getSvc();
    console.log("  原注册表: " + orig);
    console.log("  [恢复命令(PC)] adb shell settings put secure " + KEY + " '" + orig + "'");
    let svcBefore = auto.service;
    report("0.原状记录", orig.length > 0 && orig !== "null", "autoXjs在册=" + (orig.indexOf("autoxjs") >= 0) + " AutoJs6在册=" + (orig.indexOf(SVC_PKG) >= 0) + " auto.service=" + (svcBefore ? "非空" : "null"));

    // ===== 阶段1: 对照组 — app-uid shell() 写注册表应失败 =====
    let probeVal = (orig === "null" || !orig ? "" : orig) + ":PROBE_SHOULD_FAIL_XYZ";
    let r1 = shell("settings put secure " + KEY + " '" + probeVal + "'");
    let cur1 = getSvc();
    let denied = !r1 || r1.code !== 0 || cur1.indexOf("PROBE_SHOULD_FAIL") < 0;
    report("1.对照组: app-uid shell() 写注册表被拒", denied,
        "code=" + (r1 && r1.code) + " stderr=" + String(r1 && r1.error).trim().slice(0, 80) + " 注册表未变=" + (cur1.indexOf("PROBE_SHOULD_FAIL") < 0));

    // ===== 阶段2: shizuku 拉起 AutoJs6 无障碍 =====
    let list = orig === "null" || !orig ? "" : orig;
    list = list.split(":").filter(s => s && s.indexOf(SVC_PKG) < 0).join(":");
    let target = list ? list + ":" + SVC_PKG + "/" + SVC_CLS : SVC_PKG + "/" + SVC_CLS;
    let r2 = sh("settings put secure " + KEY + " '" + target + "'");
    let tPut = Date.now();
    let writeOk = r2 && r2.code === 0;
    let tWrite = -1;
    for (let i = 0; i < 20 && tWrite < 0; i++) { // 轮询写入生效 ≤2s
        if (getSvc().indexOf(SVC_PKG) >= 0) tWrite = Date.now() - tPut;
        else sleep(100);
    }
    // 轮询服务真正可用 ≤8s
    let svcOk = false, tSvc = -1;
    for (let i = 0; i < 40 && !svcOk; i++) {
        if (auto.service) {
            try { if (packageName("com.hihonor.android.launcher").findOnce()) svcOk = true; } catch (eQ) {}
        }
        if (!svcOk) sleep(200);
    }
    tSvc = Date.now() - tPut;
    report("2.shizuku拉起无障碍: 注册表写入", !!writeOk && tWrite >= 0,
        "code=" + (r2 && r2.code) + " 写入生效延迟=" + (tWrite >= 0 ? tWrite + "ms" : "未确认"));
    report("2b.shizuku拉起无障碍: 服务可用+控件实测", svcOk,
        "put→可用总延迟=" + tSvc + "ms auto.service=" + (auto.service ? "非空" : "null") + " 控件查询实测=" + (svcOk ? "通过" : "失败"));

    // ===== 阶段3: 关闭 AutoJs6 无障碍 (保留其他服务) =====
    let t3 = Date.now();
    let list2 = getSvc().split(":").filter(s => s && s.indexOf(SVC_PKG) < 0).join(":");
    let r3 = sh("settings put secure " + KEY + " '" + (list2 || '""') + "'");
    let offOk = false, tOff = -1;
    for (let i = 0; i < 25 && !offOk; i++) {
        if (!auto.service) { offOk = true; tOff = Date.now() - t3; }
        else sleep(200);
    }
    report("3.关闭无障碍+引擎存活", offOk && list2.indexOf("autoxjs") >= 0,
        "关闭生效延迟=" + (tOff >= 0 ? tOff + "ms" : "未确认") + " 其余服务保留=" + (list2.indexOf("autoxjs") >= 0) + " 脚本引擎=存活(日志继续输出)");

    // ===== 阶段4: 恢复原状 =====
    let r4 = sh("settings put secure " + KEY + " '" + (orig === "null" ? '""' : orig) + "'");
    let restored = getSvc() === orig;
    report("4.恢复原状", r4 && r4.code === 0 && restored, "复核=" + (restored ? "一致" : "差异! cur=" + getSvc()));

    // ===== 阶段5: appops 投影预授权 =====
    let ao0 = sh("appops get " + SVC_PKG + " PROJECT_MEDIA");
    console.log("  appops现状: " + String(ao0 && ao0.result).trim());
    let aoSet = sh("appops set " + SVC_PKG + " PROJECT_MEDIA allow");
    let ao1 = sh("appops get " + SVC_PKG + " PROJECT_MEDIA");
    report("5.appops PROJECT_MEDIA 预授权", aoSet && aoSet.code === 0 && String(ao1.result).indexOf("allow") >= 0,
        "set code=" + (aoSet && aoSet.code) + " 现状=" + String(ao1 && ao1.result).trim());

    sh("input keyevent 3");
} catch (e) {
    console.error("全局异常: " + e.message + " | " + e.stack);
    report("全局异常", false, e.message);
    try { shizuku("settings put secure " + KEY + " '" + orig + "'"); } catch (e2) {}
}

console.log("== 汇总: PASS=" + pass + " FAIL=" + fail + " ==");
console.log("__DONE__");
