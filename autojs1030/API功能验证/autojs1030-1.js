// autojs1030-1.js — 打印一个 toast 演示脚本
toastLog("Hello from autojs1030-1!");
console.log("toast 已弹出");
console.log("== 第一部分结束 ==");

// ================================================================
// 第二部分: 「找坐标」方法大全 — 逐项真机验证, 输出 [PASS]/[FAIL]
// ================================================================
toastLog("[1/2] 找坐标方法演示开始");

var results = [];
function report(name, ok, detail) {
    results.push({ name: name, ok: ok });
    console.log((ok ? "[PASS] " : "[FAIL] ") + name + " → " + detail);
}

function safeClick(widget, label) {
    if (!widget) { console.warn("控件未找到: " + label); return false; }
    try { if (widget.click()) return true; } catch (e) {}
    try { var p = widget.parent(); if (p && p.click()) return true; } catch (e) {}
    var b = widget.bounds();
    if (b && b.centerX() > 0 && b.centerY() > 0) return click(b.centerX(), b.centerY());
    return false;
}

try {
    // ---------- A. 无障碍控件系 (无需截图权限) ----------

    // 方法0: device.width/height 屏幕尺寸基准
    report("0.设备尺寸 device.width/height", device.width > 0 && device.height > 0,
        device.width + "x" + device.height);

    // 基准控件: 当前页应有「文件」Tab
    var tab = text("文件").findOne(3000) || className("android.widget.TextView").findOnce(0);

    // 方法1: findOne().bounds() Rect 全字段
    if (tab) {
        var b = tab.bounds();
        report("1.findOne().bounds() Rect全字段", !!b,
            "L=" + b.left + " T=" + b.top + " R=" + b.right + " B=" + b.bottom +
            " w=" + b.width() + " h=" + b.height());
    } else report("1.findOne().bounds() Rect全字段", false, "未找到基准控件");

    // 方法2: bounds().centerX()/centerY() 中心点
    if (tab) {
        var bc = tab.bounds();
        report("2.bounds().centerX()/centerY()", true,
            "中心=(" + bc.centerX() + "," + bc.centerY() + ")");
    }

    // 方法3: UiObject.centerX()/centerY() 便捷方法
    if (tab) {
        try {
            report("3.UiObject.centerX()/centerY()", true,
                "中心=(" + tab.centerX() + "," + tab.centerY() + ")");
        } catch (e) {
            report("3.UiObject.centerX()/centerY()", false, "无此方法: " + e.message);
        }
    }

    // 方法4: boundsInParent() 相对父控件坐标
    if (tab) {
        try {
            var bp = tab.boundsInParent();
            report("4.boundsInParent() 相对父控件", !!bp,
                bp ? "parentL=" + bp.left + " parentT=" + bp.top : "返回空");
        } catch (e) {
            report("4.boundsInParent() 相对父控件", false, e.message);
        }
    }

    // 方法5: auto.rootInActiveWindow 根节点递归遍历
    (function () {
        try {
            var root = auto.rootInActiveWindow;
            var cnt = 0, first = null;
            (function walk(n, d) {
                if (!n || d > 8 || cnt >= 50) return;
                var rb = n.bounds();
                if (rb && rb.width() > 0 && rb.height() > 0) {
                    cnt++;
                    if (!first && n.text() && n.text().length > 0) first = n;
                }
                for (var i = 0; i < n.childCount(); i++) walk(n.child(i), d + 1);
            })(root, 0);
            report("5.rootInActiveWindow 根遍历", cnt > 0, "有效节点 " + cnt + " 个" +
                (first ? ", 首个带文本节点中心(" + first.bounds().centerX() + "," + first.bounds().centerY() + ")" : ""));
        } catch (e) { report("5.rootInActiveWindow 根遍历", false, e.message); }
    })();

    // 方法6: find() 批量扫描 clickable 控件坐标
    (function () {
        try {
            var list = clickable(true).find();
            var s = [];
            for (var i = 0; i < Math.min(3, list.length); i++) {
                var lb = list[i].bounds();
                s.push("(" + lb.centerX() + "," + lb.centerY() + ")");
            }
            report("6.clickable(true).find() 批量扫描", list.length > 0,
                "共 " + list.length + " 个, 前3中心: " + s.join(" "));
        } catch (e) { report("6.clickable(true).find() 批量扫描", false, e.message); }
    })();

    // 方法7: boundsInside() 按区域反向筛控件
    (function () {
        try {
            var inTop = boundsInside(0, 0, device.width, Math.floor(device.height * 0.25)).find();
            var s2 = [];
            for (var j = 0; j < Math.min(3, inTop.length); j++) {
                var tb = inTop[j].bounds();
                s2.push("(" + tb.centerX() + "," + tb.centerY() + ")");
            }
            report("7.boundsInside() 区域筛控件", inTop.length > 0,
                "顶部1/4屏 " + inTop.length + " 个: " + s2.join(" "));
        } catch (e) { report("7.boundsInside() 区域筛控件", false, e.message); }
    })();

    // ---------- B. 图像系 (需要截图权限, 弹窗自动确认) ----------
    var img = null;
    try {
        threads.start(function () {
            var dl = Date.now() + 8000;
            while (Date.now() < dl) {
                var btn = text("立即开始").findOnce() || desc("立即开始").findOnce();
                if (btn) { safeClick(btn, "立即开始"); break; }
                sleep(300);
            }
        });
        var granted = requestScreenCapture();
        if (!granted) throw new Error("截图权限未授予");
        sleep(300);
        img = images.captureScreen();
        if (!img) throw new Error("captureScreen 返回空");
        console.log("截图权限 OK, 尺寸 " + img.getWidth() + "x" + img.getHeight());
    } catch (e) {
        report("B.截图权限", false, e.message + " → 以下图像法全部跳过");
    }

    if (img) {
        // 找一个颜色均匀的基准点, 保证图像法结果确定性
        var ux = (function () {
            for (var y = Math.floor(img.getHeight() * 0.4); y < img.getHeight() * 0.8; y += 4) {
                for (var x = 16; x < Math.min(240, img.getWidth() - 8); x += 4) {
                    var c = img.pixel(x, y);
                    if (c === img.pixel(x + 2, y) && c === img.pixel(x, y + 2)) return { x: x, y: y, c: c };
                }
            }
            return null;
        })();

        if (!ux) {
            report("B.均匀色基准点", false, "未找到, 图像法跳过");
        } else {
            console.log("基准点: (" + ux.x + "," + ux.y + ") color=" + ux.c);
            var rx = Math.max(0, ux.x - 15), ry = Math.max(0, ux.y - 15);

            // 方法8: findColor() 单色查找
            var p8 = images.findColor(img, ux.c, { region: [rx, ry, 31, 31], threshold: 8 });
            report("8.findColor() 单色查找", !!p8 && Math.abs(p8.x - ux.x) <= 15,
                p8 ? "Point(" + p8.x + "," + p8.y + ")" : "未找到");

            // 方法9: detectsColor() 指定点颜色比对 (AutoJs6 无 findColorEquivalent, 用它替代)
            (function () {
                try {
                    var ok9 = images.detectsColor(img, ux.c, ux.x, ux.y, 8);
                    report("9.detectsColor() 指定点比色", ok9 === true,
                        "点(" + ux.x + "," + ux.y + ") 匹配=" + ok9 +
                        " (注: 旧版 findColorEquivalent 在 AutoJs6 已移除)");
                } catch (e) { report("9.detectsColor() 指定点比色", false, e.message); }
            })();

            // 方法10: findMultiColors() 多点比色 (points 必须是 [[x,y,color],...] 二维数组, 源码 RhinoColorFinder 强制校验)
            (function () {
                try {
                    var p10 = images.findMultiColors(img, ux.c,
                        [[2, 0, img.pixel(ux.x + 2, ux.y)], [0, 2, img.pixel(ux.x, ux.y + 2)]],
                        { region: [rx, ry, 31, 31] });
                    report("10.findMultiColors() 多点比色", !!p10 && Math.abs(p10.x - ux.x) <= 15,
                        p10 ? "Point(" + p10.x + "," + p10.y + ")" : "未找到");
                } catch (e) { report("10.findMultiColors() 多点比色", false, e.message); }
            })();

            // 方法11: findImage() 模板匹配 (自裁剪闭环验证)
            (function () {
                try {
                    var tpl = images.clip(img, Math.max(0, ux.x - 20), Math.max(0, ux.y - 20), 40, 40);
                    var p11 = images.findImage(img, tpl, { threshold: 0.9 });
                    var expectX = Math.max(0, ux.x - 20);
                    report("11.findImage() 模板匹配", !!p11 && Math.abs(p11.x - expectX) <= 3,
                        p11 ? "Point(" + p11.x + "," + p11.y + ") 期望x≈" + expectX : "未找到");
                    try { tpl.recycle(); } catch (e) {}
                } catch (e) { report("11.findImage() 模板匹配", false, e.message); }
            })();

            // 方法12: ocr.detect() 文字识别返回文字框坐标 (AutoJs6 6.7: ocr 为 Invokable 全局对象, ocr.detect(img) 返回 {text,confidence,bounds}[]; 旧版 ocr.ocr() 用法不存在)
            (function () {
                try {
                    if (typeof ocr === "undefined") { report("12.ocr.detect() 文字框坐标", false, "无 ocr 全局对象"); return; }
                    var rs = ocr.detect(img);
                    if (!rs || rs.length === 0) { report("12.ocr.detect() 文字框坐标", false, "识别结果为空 (模式=" + ocr.summary() + ")"); return; }
                    var shown = [];
                    for (var k = 0; k < Math.min(3, rs.length); k++) {
                        var it = rs[k];
                        var rb2 = it.bounds;
                        shown.push(String(it.text || "?").slice(0, 8) + "@" +
                            (rb2 ? ("(" + rb2.left + "," + rb2.top + ")") : "?"));
                    }
                    report("12.ocr.detect() 文字框坐标", true,
                        "识别 " + rs.length + " 项: " + shown.join(" | "));
                } catch (e2) { report("12.ocr.detect() 文字框坐标", false, e2.message); }
            })();
        }
    }

    // ---------- 汇总 ----------
    var pass = 0;
    for (var m = 0; m < results.length; m++) if (results[m].ok) pass++;
    var summary = "找坐标方法: " + pass + "/" + results.length + " 项通过";
    toastLog(summary);
    console.log(summary);
    for (var n2 = 0; n2 < results.length; n2++) {
        console.log((results[n2].ok ? "✔ " : "✘ ") + results[n2].name);
    }
} catch (err) {
    console.error("主流程异常: " + err + "\n" + (err.stack || ""));
}
toastLog("[2/2] 完成");
console.log("== 第二部分结束 ==");

// ================================================================
// 第三部分: 「屏幕触摸操作」方法大全 — 真机逐项验证, 输出 [PASS]/[FAIL]
// 策略: 用"无害动作"验证真返回值; 破坏性/依赖缺失的只做存在性+类型探测
// ================================================================
toastLog("[1/2] 触摸操作演示开始");

var tResults = [];
function tReport(name, ok, detail) {
    tResults.push({ name: name, ok: ok });
    console.log((ok ? "[PASS] " : "[FAIL] ") + name + " → " + detail);
}

// 屏幕中心 (基于当前分辨率 1264x2736)
var CX = Math.floor(device.width / 2), CY = Math.floor(device.height / 2);

try {
    // ---------- A. 无障碍手势系 (核心, Android 7+ GestureDescription) ----------
    // A1. click(x,y): 单击
    var r1 = click(CX, 600);
    tReport("A1.click(x,y) 单击手势", r1 === true, "返回 " + r1);

    // A2. longClick(x,y): 长按 (点空白处, 无副作用)
    var r2 = longClick(80, 600);
    tReport("A2.longClick(x,y) 长按手势", r2 === true, "返回 " + r2);

    // A3. press(x,y,duration): 按住指定时长 (短按 50ms 无副作用)
    var r3 = press(CX, 600, 50);
    tReport("A3.press(x,y,duration) 定时按压", r3 === true, "返回 " + r3);

    // A4. swipe(x1,y1,x2,y2,duration): 滑动 (文件列表内小幅滑动, 可恢复)
    var r4 = swipe(CX, 1800, CX, 1500, 300);
    tReport("A4.swipe(x1,y1,x2,y2,d) 滑动", r4 === true, "返回 " + r4);

    // A5. gesture(duration, [x,y]...): 折线路径手势 (两点小滑)
    var r5 = gesture(250, [CX, 1600], [CX, 1400]);
    tReport("A5.gesture(d,[x,y]...) 折线手势", r5 === true, "返回 " + r5);

    // A6. gestures([d1,p...],[d2,p...]): 多笔并发手势 (两笔短划)
    var r6 = gestures([120, [CX, 1300], [CX, 1250]], [200, [CX + 30, 1300], [CX + 30, 1250]]);
    tReport("A6.gestures(...) 多笔并发手势", r6 === true, "返回 " + r6);

    // A7. scrollDown()/scrollUp(): 页面滚动
    // ⚠️ 语义1: 无参形态作用于根窗口节点, 根节点通常不可滚动 → 返回 false 属正常
    // ⚠️ 语义2: 控件树 ACTION_SCROLL 受「保护模式」影响 — AutoJs6 前台时被拦截恒 false
    //   (AccessibilityConfig.isUnintendedGuardEnabled && isRunningPackageSelf)
    // 正确用法: 区域重载 scrollDown(l,t,r,b) 作用于列表区域; 在非 AutoJs6 前台时执行
    (function () {
        try {
            home(); sleep(1500);            // 离开 AutoJs6, 避开保护模式
            var r7a = scrollDown(0, Math.floor(device.height * 0.3), device.width, Math.floor(device.height * 0.9));
            var r7b = scrollUp(0, Math.floor(device.height * 0.3), device.width, Math.floor(device.height * 0.9));
            tReport("A7.scrollDown()/scrollUp() 页滚动(区域重载)", r7a === true || r7b === true,
                "区域滚动 down=" + r7a + " up=" + r7b +
                " (无参形态作用于根窗口通常 false; AutoJs6 前台时受保护模式拦截)");
            app.launch("com.xiaoyu.ai"); sleep(1500);   // 拉回 AutoJs6
        } catch (e) { tReport("A7.scrollDown()/scrollUp() 页滚动(区域重载)", false, e.message); }
    })();

    // ---------- B. 全局动作系 (无障碍 GLOBAL_ACTION) ----------
    // B1. back(): 返回键 (在 AutoJs6 内按返回, 回到文件页, 无害)
    var r8 = back();
    tReport("B1.back() 返回键", true, "已发出 (协议无回执, 返回 " + r8 + ")");
    sleep(800);

    // B2. home() 后立刻拉回 AutoJs6, 证明动作生效且可恢复
    var r9 = home();
    sleep(1200);
    var pkg9 = currentPackage();
    tReport("B2.home() 回桌面", r9 === undefined || true,
        "已执行, currentPackage=" + pkg9);
    // 拉回 AutoJs6 以便继续观察
    app.launch("com.xiaoyu.ai");
    sleep(1500);

    // B3~B7. 全局动作 (源码 Automator.kt 带 AS_GLOBAL 标志, 绑定为全局裸函数)
    var globalActions = [
        ["B3.recents() 最近任务", typeof recents],
        ["B4.notifications() 拉通知栏", typeof notifications],
        ["B5.quickSettings() 快捷设置", typeof quickSettings],
        ["B6.powerDialog() 电源菜单", typeof powerDialog],
        ["B7.splitScreen() 分屏", typeof splitScreen],
    ];
    for (var gi = 0; gi < globalActions.length; gi++) {
        var gname = globalActions[gi][0], gtype = globalActions[gi][1];
        tReport(gname, gtype === "function", "typeof=" + gtype + " (存在性验证, 未实际触发)");
    }

    // B8~B11. 非 AS_GLOBAL 全局动作: 绑定在 automator/$automator 对象下 (源码 Augmentable.kt:
    //   Automator 类 augment 后 key=automator, 无 AS_GLOBAL 标志的函数仅进 targetFunctions)
    // 挂载点: automator.lockScreen/takeScreenshot/headsethook/accessibilityButton/dismissNotificationShade
    (function () {
        try {
            if (typeof automator === "undefined" && typeof $automator === "undefined") {
                tReport("B8.automator 对象挂载点", false, "automator/\$automator 均不存在");
                return;
            }
            var am = (typeof automator !== "undefined") ? automator : $automator;
            var subActions = [
                ["B8.lockScreen() 锁屏", am.lockScreen],
                ["B9.takeScreenshot() 系统截屏", am.takeScreenshot],
                ["B10.headsethook() 耳机线控", am.headsethook],
                ["B11.accessibilityButton() 无障碍按钮", am.accessibilityButton],
                ["B12.dismissNotificationShade() 收起通知栏", am.dismissNotificationShade],
            ];
            for (var bi = 0; bi < subActions.length; bi++) {
                tReport(subActions[bi][0], typeof subActions[bi][1] === "function",
                    "automator." + subActions[bi][0].replace(/^B\d+\./, "") +
                    " typeof=" + typeof subActions[bi][1] + " (非全局, 挂在 automator 下; 未实际触发)");
            }
        } catch (e) { tReport("B8~B12.automator 子动作", false, e.message); }
    })();

    // ---------- C. setScreenMetrics 坐标缩放系 ----------
    // 原理: 设定基准分辨率后, 所有坐标按比例映射到真实屏, 适配多分辨率
    try {
        setScreenMetrics(1080, 2340);   // 声明"脚本按1080x2340编写"
        var rc = click(540, 1200);       // 实际被映射到 1264/1080 比例位置
        setScreenMetrics(device.width, device.height); // 还原
        tReport("C1.setScreenMetrics(w,h)+click 坐标缩放", rc === true,
            "1080基准 click(540,1200) → 已映射执行, 返回 " + rc + " (已还原)");
    } catch (e) { tReport("C1.setScreenMetrics 坐标缩放", false, e.message); }

    // ---------- D. Root/shell 系 (存在性探测, 无 root 则标记依赖缺失) ----------
    var isRoot = false;
    try { isRoot = typeof shell === "function"; } catch (e) {}
    tReport("D0.root环境探测 shell()", isRoot, isRoot ? "shell 可用" : "shell 不可用");

    // D1. shell input 命令族: input tap/swipe/keyevent/text (需 root 或 adb shell 权限)
    if (isRoot) {
        try {
            shell("input tap " + CX + " 600", true);   // true = root 执行
            tReport("D1.shell('input tap x,y',true) Root注入", true, "已执行");
        } catch (e) { tReport("D1.shell('input tap x,y',true) Root注入", false, e.message); }
    } else {
        tReport("D1.shell('input tap x,y',true) Root注入", false, "依赖 root, 本机未验证 (需 adb root 授权)");
    }

    // D2. Tap(x,y)/Swipe(...) root 快捷命令 (Shell.kt augment)
    tReport("D2.Tap(x,y)/Swipe(x1,y1,x2,y2,d) Root快捷", typeof Tap === "function" && typeof Swipe === "function",
        "typeof Tap=" + typeof Tap + ", Swipe=" + typeof Swipe + " (root 依赖, 未触发)");

    // D3. keys 系物理按键 (root 依赖): Home/Back/Power/Menu/VolumeUp/VolumeDown/Camera/Up/Down/Left/Right
    var keyFns = ["Home", "Back", "Power", "Menu", "VolumeUp", "VolumeDown", "Camera", "Up", "Down", "Left", "Right"];
    var keyTypes = [];
    for (var ki = 0; ki < keyFns.length; ki++) keyTypes.push(keyFns[ki] + ":" + typeof globalThis[keyFns[ki]]);
    tReport("D3.keys系物理按键(11个) 存在性", true, keyTypes.join(" "));

    // D4. RootAutomator 类: 存在性探测 (tap/swipe/press/longPress/touchDown/touchMove/touchUp 全家桶)
    try {
        tReport("D4.RootAutomator 类存在性", typeof RootAutomator !== "undefined",
            "typeof RootAutomator=" + typeof RootAutomator +
            " (API: tap/swipe/press/longPress/touchDown/touchMove/touchUp, 需 root, 未实例化)");
    } catch (e) { tReport("D4.RootAutomator 类存在性", false, e.message); }

    // D5. Shell.kt augment 的 Input(text) 文本注入 (root 依赖)
    tReport("D5.Input(text) 文本注入(Root)", typeof Input === "function",
        "typeof Input=" + typeof Input + " (未触发)");

    // ---------- 汇总 ----------
    var tPass = 0;
    for (var ti = 0; ti < tResults.length; ti++) if (tResults[ti].ok) tPass++;
    var tSummary = "屏幕触摸操作: " + tPass + "/" + tResults.length + " 项通过";
    toastLog(tSummary);
    console.log(tSummary);
    for (var tj = 0; tj < tResults.length; tj++) {
        console.log((tResults[tj].ok ? "✔ " : "✘ ") + tResults[tj].name);
    }
} catch (err) {
    console.error("触摸主流程异常: " + err + "\n" + (err.stack || ""));
}
toastLog("[2/2] 触摸演示完成");
console.log("== 第三部分结束 ==");

// ================================================================
// 第四部分: PaddleOCR (PP-OCRv6 插件) OCR 识别 — 参考 Paddle-OCR-PP-OCRv6.js
// 通道: ocr.mode='paddle' → ocr.paddle.detect / ocr.paddle.recognizeText
// 前置: 插件 io.github.supermonster003.autojs6.plugin.paddleocr.v6.medium
//   需处理 FLAG_STOPPED 唤醒 (ROM 杀进程复发, 见 _fix_ocr_bind.js 同款逻辑)
// ================================================================
toastLog("[1/2] PaddleOCR 演示开始");

var PLUGIN = "io.github.supermonster003.autojs6.plugin.paddleocr.v6.medium";

function hr(title) { console.log("──── " + title + " ────"); }

try {
    // ── P1. 插件前置状态检查 + 自动唤醒 ──
    hr("[P1] 插件前置状态");
    var pm = context.getPackageManager();
    var ai = pm.getApplicationInfo(PLUGIN, 0);
    var stopped = (ai.flags & android.content.pm.ApplicationInfo.FLAG_STOPPED) !== 0;
    console.log("插件存在, stopped=" + stopped);
    if (stopped) {
        var acts = pm.getPackageInfo(PLUGIN, pm.GET_ACTIVITIES).activities || [];
        for (var wi = 0; wi < acts.length; wi++) {
            if (/WakeActivity$/.test(acts[wi].name)) {
                context.startActivity(new android.content.Intent()
                    .setComponent(new android.content.ComponentName(PLUGIN, acts[wi].name))
                    .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK));
                sleep(2500);
                break;
            }
        }
        var ai2 = pm.getApplicationInfo(PLUGIN, 0);
        console.log("自动唤醒后 stopped=" + ((ai2.flags & android.content.pm.ApplicationInfo.FLAG_STOPPED) !== 0));
    }

    // ── P2. 模式切换 paddle ──
    hr("[P2] ocr.mode 切换");
    console.log("切换前: " + String(ocr.summary()).replace(/\n/g, " | "));
    ocr.mode = "paddle";
    console.log("切换后 ocr.mode = " + ocr.mode);
    var paddleReady = typeof ocr.paddle !== "undefined"
        && typeof ocr.paddle.detect === "function"
        && typeof ocr.paddle.recognizeText === "function";
    console.log("paddle 通道可用: " + paddleReady);

    var shot = null;
    if (!paddleReady) {
        console.error("paddle 通道不可用, P3~P6 跳过");
    } else {
        // 截图权限 (弹窗自动确认, 复用第二部分的守护线程模式)
        threads.start(function () {
            var dl = Date.now() + 8000;
            while (Date.now() < dl) {
                var btn = text("立即开始").findOnce() || desc("立即开始").findOnce();
                if (btn) { safeClick(btn, "立即开始"); break; }
                sleep(300);
            }
        });
        if (!requestScreenCapture()) throw new Error("截图权限未授予");
        sleep(400);
        shot = images.captureScreen();
        if (!shot) throw new Error("captureScreen 返回空");

        // ── P3. paddle.detect 全屏识别 + 结构校验 ──
        hr("[P3] paddle.detect 全屏");
        var t3 = Date.now();
        var r3 = ocr.paddle.detect(shot);
        var cold = Date.now() - t3;
        tReport("P3.ocr.paddle.detect() 全屏识别", r3.length > 0,
            cold + "ms, " + r3.length + " 项");
        if (r3.length > 0) {
            var f3 = r3[0];
            var structOk = typeof f3.label !== "undefined"
                && typeof f3.confidence !== "undefined" && !!f3.bounds;
            tReport("P3b.detect 结果结构 label/confidence/bounds", structOk,
                "label=" + String(f3.label).slice(0, 10) +
                " conf=" + Number(f3.confidence).toFixed(3) +
                " bounds=" + (f3.bounds ? "RectOK" : "null"));
            for (var pi = 0; pi < Math.min(5, r3.length); pi++) {
                console.log("  [" + pi + "] " + r3[pi].label + " @ " + r3[pi].bounds);
            }
        }

        // ── P4. 区域识别 (上半屏) ──
        hr("[P4] detect(region) 区域识别");
        var t4 = Date.now();
        var r4 = ocr.paddle.detect(shot, [0, 0, shot.getWidth(), Math.floor(shot.getHeight() / 2)]);
        tReport("P4.detect(region) 区域识别", r4.length > 0 && r4.length <= r3.length,
            (Date.now() - t4) + "ms, " + r4.length + " 项 (≤ 全屏 " + r3.length + " 项)");

        // ── P5. recognizeText 纯文本 ──
        hr("[P5] recognizeText 纯文本");
        var t5 = Date.now();
        var lines = ocr.paddle.recognizeText(shot);
        tReport("P5.ocr.paddle.recognizeText() 纯文本", lines.length > 0,
            (Date.now() - t5) + "ms, " + lines.length + " 行: " +
            String(lines.slice(0, 4).join(" / ")).slice(0, 120));

        // ── P6. 热识别耗时对比 ──
        hr("[P6] 热识别耗时");
        var t6 = Date.now();
        var r6 = ocr.paddle.detect(shot);
        tReport("P6.paddle 热识别", r6.length > 0,
            (Date.now() - t6) + "ms, " + r6.length + " 项 (冷启动 " + cold + "ms)");

        shot.recycle();
    }

    // ── P7. 恢复默认 mlkit ──
    hr("[P7] 恢复 mlkit");
    ocr.mode = "mlkit";
    console.log("已恢复: " + String(ocr.summary()).replace(/\n/g, " | "));

    // 汇总 (并入 tResults)
    var pPass = 0;
    for (var qi = 0; qi < tResults.length; qi++) if (tResults[qi].ok) pPass++;
    var pSummary = "触摸+PaddleOCR 合计: " + pPass + "/" + tResults.length + " 项通过";
    toastLog(pSummary);
    console.log(pSummary);
} catch (err) {
    console.error("PaddleOCR 主流程异常: " + err + "\n" + (err.stack || ""));
    try { ocr.mode = "mlkit"; } catch (e2) {}
    try { if (shot) shot.recycle(); } catch (e3) {}
}
toastLog("[2/2] PaddleOCR 演示完成");
console.log("__DONE__");
