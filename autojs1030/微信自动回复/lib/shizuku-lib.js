// shizuku-lib.js — B 模式(全程 Shizuku·统一高敏)零件库
// 依据: 本目录 验证报告.md (1031 真机全通) / 规范: AI_DEBUG_PROMPT §3C + LOCATING_GUIDE §8
// 用法: var B = require("./lib/shizuku-lib.js");  (经 debugp 执行, 相对引用可用)
// 铁律: 全程零无障碍/零 dump/零找色/零 MediaProjection; 定位仅 OCR(paddle) > 找图; 失败即停(2轮)

var TAG = "[B]";
function _log(s) { console.log(TAG + " " + s); }

// ============ 通道基础 ============
function sh(cmd) {
    try {
        var r = shizuku(cmd);
        if (!r || r.code !== 0) _log("sh失败 '" + cmd.slice(0, 60) + "' code=" + (r && r.code) + " err=" + String(r && r.error).trim().slice(0, 80));
        return r;
    } catch (e) {
        _log("sh异常 '" + cmd.slice(0, 60) + "': " + e.message);
        return null;
    }
}

// 自检头: true=可继续; false=fail-fast (调用方应退出)
function bSelfCheck() {
    if (typeof shizuku !== "function") {
        console.error(TAG + " shizuku 函数不存在 (检查 AutoJs6 抽屉 Shizuku 开关)");
        return false;
    }
    var r = sh("id");
    if (!r || String(r.result).indexOf("uid=2000") < 0) {
        console.error(TAG + " Shizuku 通道不可用 (服务未启动? 手机重启后需手动拉起 Shizuku)");
        return false;
    }
    var acc = String(sh("settings get secure enabled_accessibility_services").result || "").trim();
    if (acc && acc !== "null") console.warn(TAG + " [警示] 无障碍服务在册 (高敏场景请关注, 本脚本不代关): " + acc.slice(0, 100));
    _log("自检通过 uid=2000(shell)");
    return true;
}

// ============ 感知 ============
// 截屏 → Image (调用方负责 recycle); 失败返回 null
function bScreencap(path) {
    var p = path || "/sdcard/_b_frame.png";
    var r = sh("screencap -p " + p);
    if (!r || r.code !== 0) return null;
    return images.read(p);
}
// 前台窗口描述串 (dumpsys 双通道, 供验证/状态判断)
function bForeground() {
    var w = String(sh("dumpsys window 2>/dev/null | grep -E 'mCurrentFocus'").result || "").trim();
    var lines = w.split("\n");
    return lines[lines.length - 1].trim();
}

// ============ 输入 (全部 motionevent/input, 禁无障碍系) ============
function bTap(x, y) { return !!(sh("input tap " + x + " " + y)); }
function bSwipe(x1, y1, x2, y2, ms) { return !!(sh("input swipe " + x1 + " " + y1 + " " + x2 + " " + y2 + " " + (ms || 400))); }
// 长按: 必须 motionevent DOWN/UP; 零位移 swipe 会被当点击 (实测坑)
function bLongPress(x, y, ms) {
    if (!sh("input motionevent DOWN " + x + " " + y)) return false;
    sleep(ms || 950);
    return !!(sh("input motionevent UP " + x + " " + y));
}
function bKey(code) { return !!(sh("input keyevent " + code)); }
// 文本输入: setClip → (可选)点聚焦 → KEYCODE_PASTE 279; 返回是否执行成功 (上屏效果由业务验证)
function bPasteText(text, focusX, focusY) {
    setClip(String(text));
    sleep(300);
    if (focusX != null && !bTap(focusX, focusY)) return false;
    sleep(800);
    return !!bKey(279);
}

// ============ OCR (mlkit 主, paddle 备用, finally 恢复; 1031 改版: mlkit 实测快 4.5×) ============
// 返回 [{text, bounds}] 统一字段; 失败 null; 仅 mlkit 异常才落 paddle (空结果不落, 防判空步骤吃 paddle 3s)
function bOcr(img) {
    var rs = null;
    try {
        ocr.mode = "mlkit";
        rs = ocr.detect(img);
    } catch (eM) {
        _log("mlkit 异常落 paddle: " + String(eM.message || eM).slice(0, 60));
        try { ocr.mode = "paddle"; rs = ocr.paddle.detect(img); } catch (eP) { rs = null; }
    } finally { ocr.mode = "mlkit"; }
    if (!rs) return null;
    var out = [];
    for (var i = 0; i < rs.length; i++) {
        if (!rs[i].bounds) continue;
        out.push({ text: String(rs[i].label || rs[i].text || "").trim(), bounds: rs[i].bounds });
    }
    return out;
}
// 最小误字等价集 (实测坑沉淀, 可按项目扩展)
function _variants(w) {
    var map = { "搜索": ["搜素"], "浏览器": ["刘览器"], "蓝牙": ["監牙"] };
    return map[w] || [];
}
function _ocrMatch(list, want) {
    for (var i = 0; i < list.length; i++) if (list[i].text && list[i].text.indexOf(want) >= 0) return list[i];
    var vs = _variants(want);
    for (var j = 0; j < vs.length; j++)
        for (var k = 0; k < list.length; k++)
            if (list[k].text && list[k].text.indexOf(vs[j]) >= 0) return list[k];
    return null;
}
// OCR 定位: 命中返回 {x,y,text,anchorOnly:true}; 标签=锚点语义 (点击目标偏移由业务按 §8 修正)
function bLocateOcr(img, want) {
    var list = bOcr(img);
    if (!list) return null;
    var hit = _ocrMatch(list, want);
    if (!hit) return null;
    var b = hit.bounds;
    return { x: Math.round((b.left + b.right) / 2), y: Math.round((b.top + b.bottom) / 2), text: hit.text, anchorOnly: true };
}

// ============ 找图 (§5 参数体系; 模板开发期 AI 生产线产出并 debugp 预推) ============
function bLocateImage(img, tplPath, knownRegion) {
    var tpl = images.read(tplPath);
    if (!tpl) { _log("模板读取失败: " + tplPath); return null; }
    try {
        var opt = { threshold: 0.85 };
        if (knownRegion) opt.region = knownRegion;
        var hit = images.findImage(img, tpl, opt);
        if (!hit) return null;
        return { x: hit.x + Math.round(tpl.getWidth() / 2), y: hit.y + Math.round(tpl.getHeight() / 2) };
    } finally { tpl.recycle(); }
}

// ============ 两层调度 + 失败即停 ============
// target: {ocrText, tplPath, knownRegion, framePath}
// 命中返回 {x,y,layer,...}; 2 轮 (重截屏 1 次) 仍失败 → console.error 并返回 null (宁停勿误)
function bLocate(target) {
    target = target || {};
    for (var round = 1; round <= 2; round++) {
        var img = bScreencap(target.framePath);
        if (img) {
            try {
                if (target.ocrText) {
                    var o = bLocateOcr(img, target.ocrText);
                    if (o) { _log("OCR命中(轮" + round + "): " + o.text + "@(" + o.x + "," + o.y + ")"); return o; }
                }
                if (target.tplPath) {
                    var p = bLocateImage(img, target.tplPath, target.knownRegion);
                    if (p) { _log("找图命中(轮" + round + "): (" + p.x + "," + p.y + ")"); p.layer = "image"; return p; }
                }
            } finally { img.recycle(); }
        }
        _log("第" + round + "轮未命中" + (round < 2 ? ", 重截屏再试" : " → 失败即停"));
        if (round < 2) sleep(600);
    }
    console.error(TAG + " 定位失败(2轮): " + JSON.stringify({ ocrText: target.ocrText || null, tplPath: target.tplPath || null }));
    return null;
}

// 验证式点击: verifyFn() 返回 true 视为生效 (截图对比/OCR文本/dumpsys前台由业务实现)
function bTapVerify(hit, verifyFn) {
    if (!hit) return false;
    if (!bTap(hit.x, hit.y)) return false;
    sleep(1500);
    var ok = false;
    try { ok = verifyFn ? !!verifyFn() : true; } catch (e) { ok = false; }
    _log("点击" + (ok ? "生效" : "未生效") + " @(" + hit.x + "," + hit.y + ")");
    return ok;
}

module.exports = {
    sh: sh, bSelfCheck: bSelfCheck,
    bScreencap: bScreencap, bForeground: bForeground,
    bTap: bTap, bSwipe: bSwipe, bLongPress: bLongPress, bKey: bKey, bPasteText: bPasteText,
    bOcr: bOcr, bLocateOcr: bLocateOcr, bLocateImage: bLocateImage,
    bLocate: bLocate, bTapVerify: bTapVerify
};
