/**
 * wxauto-1.js — 微信消息通知监听 → 解析好友名 → 搜索并进入聊天页 → 读取最新消息 → 自动回复
 *
 * 真机侦察结论 (HONOR DNP-AN00 · AutoJs6 6.7.0 · 微信反无障碍):
 *  - 微信全部窗口对无障碍返回空节点树 → 微信内部操作一律 OCR + 手势坐标, 禁用控件选择器
 *  - 搜索页中文输入: setClip + 长按粘贴(OCR 找"粘贴"); 备选讯飞剪贴板条
 *  - 主界面搜索图标固定比例坐标 (0.8366, 0.0801); 联系人结果项点击直达聊天页
 *  - mlkit 暗色主题有误字(如 虚→康/通讯录→通訊录), 匹配一律用字符集相似度容错
 *  - 需求2: 最新消息定位 = OCR最底左文本 + 像素带扫描(emoji/图片对OCR隐形);
 *    内容提取 = 长按气泡→弹框"复制"→剪贴板精确原文(emoji 得 [呲牙] 形式);
 *    粘贴 = 长按输入框→工具栏"粘贴"; 自动点发送; lastReplied 防重发
 *
 * 依赖权限: 无障碍(手势) + 通知使用权(events.observeNotification) + 截屏(OCR)
 * 常驻脚本: 不输出 __DONE__, 停止请在 AutoJs6 任务卡或 aj6 stopall
 */

var CFG = {
    WX_PKG: 'com.tencent.mm',
    AJ_PKG: 'com.xiaoyu.ai', // AutoJs6 自身包名 (剪贴板读回兜底时置前用)
    DEDUP_MS: 8000,          // 同 title+text 去重窗口
    POLL_MS: 700,            // OCR 轮询间隔
    OCR_WAIT_MS: 9000,       // OCR 等待超时(单步)
    HANDLE_GROUP: false,     // 群聊: false=跳过
    SIM_GATE: 0.34,          // OCR 相似度门槛 (字符集 Jaccard)
    SKIP_TITLES: ['微信', '微信支付', '微信团队', '服务通知', '微信运动', '腾讯新闻'],
    // 主界面搜索图标 (真机实测 1057,219 @1264x2736)
    POS_SEARCH_ICON: { x: 0.8366, y: 0.0801 },
    // 搜索框中心 (真机实测 673,222)
    POS_SEARCH_BOX: { x: 0.5324, y: 0.0811 },
    // 聊天页输入条中心 (真机实测 592,2518)
    POS_INPUT: { x: 0.468, y: 0.9205 },
    // ---- 需求2: 自动回复 ----
    AUTO_REPLY: true,        // 进入聊天页后自动回复
    REPLY_TEXT: '消息已收到', // 回复语; 最终文本 = 「{原文}」{REPLY_TEXT}
    REPLY_DRY_RUN: false,    // true=只粘贴不点发送 (自测用)
    SENTINEL: 'WXAUTO_SENTINEL_913', // 剪贴板哨兵
    BAND_DIST: 28,           // 像素带扫描: 与背景色距离阈值
    BAND_MIN_H: 60           // 隐形气泡最小高度(px)
};

var queue = [];
var processing = false;
var seen = {};               // 去重表 key -> timestamp
var stat = { recv: 0, ok: 0, fail: 0, skip: 0 };

/* ================= 基础工具 ================= */

function W() { return device.width; }
function H() { return device.height; }

function nowMs() { return Date.now(); }

function toastLog(msg) { console.log(msg); } // 用户要求: 不弹 toast (干扰 OCR), 全部走日志流

// 系统 toast 文案过滤 (ROM 隐私提示等, 防止混入 OCR 结果)
var TOAST_RE = /正在访问剪贴板|已复制|已停止运行|已粘贴/;

// 字符集 Jaccard 相似度, 抗 OCR 误字
function similarity(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.indexOf(b) >= 0 || b.indexOf(a) >= 0) return 1;
    var sa = {}, sb = {}, union = 0, inter = 0, k;
    for (k = 0; k < a.length; k++) sa[a.charAt(k)] = true;
    for (k = 0; k < b.length; k++) if (!sb[b.charAt(k)]) { sb[b.charAt(k)] = true; }
    var seenCh = {};
    for (k = 0; k < a.length; k++) if (!seenCh[a.charAt(k)]) { seenCh[a.charAt(k)] = true; union++; inter += (b.indexOf(a.charAt(k)) >= 0 ? 1 : 0); }
    for (k = 0; k < b.length; k++) if (!seenCh[b.charAt(k)]) { seenCh[b.charAt(k)] = true; union++; }
    return union === 0 ? 0 : inter / union;
}

// 全屏截图 + OCR → [{t, l, t_, r, b, cx, cy, conf}] (仅保留 y>topCut 的项)
var ocrSeq = 0;
function ocrGrab(topCut) {
    var img = images.captureScreen();
    if (!img) return [];
    var rs;
    try { rs = ocr.detect(img); } catch (e) { console.error('ocr.detect 异常: ' + e); rs = []; }
    var out = [];
    var cut = (topCut === undefined ? 0.03 : topCut) * H();
    for (var i = 0; i < rs.length; i++) {
        var r = rs[i];
        var t = String(r.label || r.text || '').trim();
        if (!t || TOAST_RE.test(t)) continue;
        var b = r.bounds;
        if (!b || b.bottom <= cut) continue;
        out.push({ t: t, l: b.left, top: b.top, r: b.right, b: b.bottom, cx: (b.left + b.right) / 2, cy: (b.top + b.bottom) / 2, conf: r.confidence || 0 });
    }
    return out;
}

function tapAt(x, y, label) {
    if (x <= 0 || y <= 0 || x > W() || y > H()) { console.warn('非法坐标跳过: ' + label); return false; }
    console.log('tap ' + label + ' @(' + Math.round(x) + ',' + Math.round(y) + ')');
    return click(x, y);
}

function longPressAt(x, y, ms) { return gesture(Math.max(600, ms || 700), [x, y], [x, y]); }

// 在 items 中找谓词命中的第一项
function findItem(items, fn) { for (var i = 0; i < items.length; i++) if (fn(items[i])) return items[i]; return null; }

/* ================= 通知解析 ================= */

// 返回 {name, text, title, group, raw} 或 null
function parseNotification(n) {
    var pkg = String(n.getPackageName() || '');
    console.log('[通知] pkg=' + pkg + ' title="' + n.getTitle() + '" text="' + n.getText() + '"');
    if (pkg !== CFG.WX_PKG) return null;
    var title = String(n.getTitle() || '').trim();
    var text = String(n.getText() || '').trim();
    console.log('[通知原始] title="' + title + '" text="' + text + '" number=' + n.number);
    stat.recv++;

    if (!title || CFG.SKIP_TITLES.indexOf(title) >= 0) {
        stat.skip++; console.log('[跳过] 系统通知或隐私模式(title="' + title + '")');
        return null;
    }
    // 折叠前缀 "[3条] " 剥离
    var body = text.replace(/^\[\d+条\]\s*/, '');
    // 群聊探测: text = "昵称: 消息" 且前缀不是 title 本身
    var m = body.match(/^([^:：]{1,25})[:：]\s*/);
    var isGroup = false, name = title;
    if (m && m[1] !== title && title.indexOf(m[1]) < 0) {
        isGroup = true;
        if (CFG.HANDLE_GROUP) name = m[1];
    }
    if (isGroup && !CFG.HANDLE_GROUP) {
        stat.skip++; console.log('[跳过] 群聊消息 (title="' + title + '")');
        return null;
    }
    return { name: name, text: body, title: title, group: isGroup, raw: n };
}

function dedupCheck(item) {
    var key = item.title + '|' + item.text;
    var t = nowMs();
    for (var k in seen) if (t - seen[k] > CFG.DEDUP_MS) delete seen[k];
    if (seen[key]) { console.log('[去重] 8s 内重复通知, 忽略'); return false; }
    seen[key] = t;
    return true;
}

/* ================= 微信操作 (OCR + 手势) ================= */

// 前台判定: currentPackage 可能滞后/失灵(引擎周期), 窗口枚举的包名元数据不受反无障碍屏蔽, 双信号
function weChatForeground() {
    if (currentPackage() === CFG.WX_PKG) return true;
    try {
        var ws = auto.service.getWindows();
        for (var i = 0; i < ws.size(); i++) {
            var w = ws.get(i);
            var r = w.getRoot();
            if (w.getType() === 1 && r && String(r.getPackageName()) === CFG.WX_PKG) return true;
        }
    } catch (e) {}
    return false;
}

function ensureWeChat() {
    if (weChatForeground()) return true;
    console.log('[1/5] 启动微信');
    for (var attempt = 0; attempt < 2; attempt++) {
        app.launch(CFG.WX_PKG);
        var dead = nowMs() + 10000;
        while (nowMs() < dead) {
            sleep(600);
            if (weChatForeground()) { sleep(1200); return true; }
        }
    }
    return false;
}

// 主界面特征: 底部 tab (发现/我/微信[通訊录可能被OCR成繁体]) ≥2项 或 顶部标题"微信"
function isMainPage() {
    var items = ocrGrab(0.02);
    var low = 0.9 * H();
    var hits = 0;
    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (it.cy >= low && (it.t.indexOf('发现') >= 0 || it.t === '我' || it.t.indexOf('微信') >= 0
            || (it.t.indexOf('通') >= 0 && it.t.indexOf('录') >= 0))) hits++;
        if (it.cy < 0.09 * H() && it.cy > 0.03 * H() && it.t.indexOf('微信') >= 0) hits++;
    }
    return hits >= 2;
}

function backToMain() {
    console.log('[2/5] 回到微信主界面');
    for (var i = 0; i < 5; i++) {
        if (isMainPage()) { console.log('  已在主界面'); return true; }
        back(); sleep(1300);
    }
    return isMainPage();
}

function openSearch() {
    console.log('[3/5] 打开搜索页');
    var dead = nowMs() + CFG.OCR_WAIT_MS;
    var tapped = false;
    while (nowMs() < dead) {
        // 搜索页特征: 提示语 "搜索本地或网络结果"
        var items = ocrGrab(0.02);
        var hint = findItem(items, function (it) { return it.t.indexOf('搜索') >= 0 && (it.t.indexOf('本地') >= 0 || it.t.indexOf('网络') >= 0) && it.cy < 0.12 * H(); });
        if (hint) { console.log('  搜索页已打开'); return true; }
        if (!tapped) {
            tapAt(CFG.POS_SEARCH_ICON.x * W(), CFG.POS_SEARCH_ICON.y * H(), '搜索图标');
            tapped = true;
        }
        sleep(CFG.POLL_MS);
    }
    return false;
}

// 搜索框区域是否已含目标文本 (OCR 相似度容错)
function boxHasText(name) {
    var items = ocrGrab(0.02);
    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (it.cy > 0.03 * H() && it.cy < 0.115 * H() && similarity(it.t, name) >= 0.4) return true;
    }
    return false;
}

// 搜索框输入(中文): A=讯飞"点击粘贴"条内容行(已真机验证) B=长按→粘贴气泡; 每次点击后验证
function pasteIntoBox(name) {
    setClip(name);
    sleep(400);
    if (boxHasText(name)) return true;
    for (var att = 0; att < 2; att++) {
        // A: 讯飞剪贴板条 (IME 活跃时 setClip 自动出现, 点内容行即粘贴)
        var items = ocrGrab(0.02);
        var bar = findItem(items, function (it) { return it.t.indexOf('点击粘贴') >= 0; });
        if (bar) {
            var content = findItem(items, function (it) { return it.cy > bar.b && it.cy < bar.b + 0.09 * H() && similarity(it.t, name) >= 0.5; });
            if (content) {
                tapAt(content.cx, content.cy, '讯飞条内容行');
                sleep(900);
                if (boxHasText(name)) return true;
            }
        }
        // B: 长按输入框 → 系统粘贴气泡 (排除讯飞"点击粘贴"头)
        longPressAt(CFG.POS_SEARCH_BOX.x * W(), CFG.POS_SEARCH_BOX.y * H(), 700);
        sleep(900);
        var pb = findItem(ocrGrab(0.02), function (it) {
            return it.t.indexOf('粘贴') >= 0 && it.t.indexOf('点击') < 0 && it.cy > 0.12 * H() && it.cy < 0.3 * H();
        });
        if (pb) {
            tapAt(pb.cx, pb.cy, '粘贴气泡');
            sleep(900);
            if (boxHasText(name)) return true;
        }
        // 重新聚焦输入框, 促使讯飞条出现
        tapAt(CFG.POS_SEARCH_BOX.x * W(), CFG.POS_SEARCH_BOX.y * H(), '搜索框');
        sleep(1200);
    }
    return boxHasText(name);
}

// 结果页分组头/干扰行 ("最常使用"=最近联系场景; "联系人"也是行副标题, 统一排除后按相似度找行)
var SECTION_HEADERS = ['联系人', '功能', '群聊', '聊天记录', '公众号', '小程序', '视频号', '朋友圈', '最近使用', '最常使用', '点击粘贴', '常用语', '搜索网络结果'];
function isHeaderText(t) {
    for (var i = 0; i < SECTION_HEADERS.length; i++) if (t.indexOf(SECTION_HEADERS[i]) >= 0) return true;
    return t.indexOf('包含') >= 0;
}

// 目标行优先: 排除分组头/群聊"包含:"行/讯飞条带/搜索框区后, 取与名字相似度最高项 (布局无关)
function pickContact(name) {
    console.log('[4/5] 在结果中定位 "' + name + '"');
    var dead = nowMs() + CFG.OCR_WAIT_MS;
    var logged = '';
    while (nowMs() < dead) {
        var items = ocrGrab(0.02);
        var bar = findItem(items, function (it) { return it.t.indexOf('点击粘贴') >= 0; });
        var barTop = bar ? bar.top : -1, barBot = bar ? bar.b + 0.09 * H() : -1;
        var cands = [];
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (isHeaderText(it.t)) continue;
            if (it.t.indexOf('包含') >= 0) continue;          // 群聊"包含: xxx"行
            if (barTop >= 0 && it.cy > barTop && it.cy < barBot) continue; // 讯飞条带
            if (it.cy < 0.11 * H()) continue;                 // 搜索框区
            cands.push(it);
        }
        var best = null, bestSim = 0;
        for (var k = 0; k < cands.length; k++) {
            var s = similarity(cands[k].t, name);
            if (cands[k].t.length > name.length + 5 && s < 1) continue; // 长度护栏防长行误命中
            if (s > bestSim) { bestSim = s; best = cands[k]; }
        }
        if (best && bestSim >= CFG.SIM_GATE) {
            console.log('  命中: "' + best.t + '" sim=' + bestSim.toFixed(2));
            tapAt(best.cx, best.cy, '联系人项');
            sleep(1800);
            return true;
        }
        // 结果页确认存在(任一分组头)才允许兜底首项
        var onResults = false;
        for (var j = 0; j < items.length; j++) {
            if (items[j].t.length <= 8 && isHeaderText(items[j].t) && items[j].t.indexOf('点击粘贴') < 0) { onResults = true; break; }
        }
        if (onResults && cands.length > 0) {
            console.warn('  相似度不足(最高 ' + bestSim.toFixed(2) + '), 兜底点击首项 "' + cands[0].t + '"');
            tapAt(cands[0].cx, cands[0].cy, '兜底首项');
            sleep(1800);
            return true;
        }
        if (!logged) { logged = cands.map(function (c) { return c.t; }).slice(0, 6).join('/'); console.log('  等待结果... 候选: ' + logged); }
        sleep(CFG.POLL_MS);
    }
    return false;
}

// 聊天页特征: 底部输入条("转文字"/"说话") 或 顶部标题与名字相似
function verifyChatPage(name) {
    var items = ocrGrab(0.02);
    var lowZone = 0.84 * H();
    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (it.cy >= lowZone && (it.t.indexOf('转文字') >= 0 || it.t.indexOf('说话') >= 0)) return true;
        if (it.cy < 0.09 * H() && it.cy > 0.03 * H() && similarity(it.t, name) >= 0.5) return true;
    }
    return false;
}

/* ================= 需求2: 读取最新消息并回复 (全机制真机验证 2026-10-31) ================= */

// 键盘是否弹出 (讯飞键盘特征)
function kbOpen() {
    return !!findItem(ocrGrab(0.02), function (it) {
        return it.t.indexOf('语音输入') >= 0 || it.t.indexOf('全屏输入') >= 0 || (it.t.indexOf('中') >= 0 && it.t.indexOf('英') >= 0);
    });
}

// 最底部左侧 OCR 文本项 (排除时间行/标题/输入条/导航)
function bottomLeftText() {
    var items = ocrGrab(0.02);
    var best = null;
    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (it.cy < 0.10 * H() || it.cy > 0.90 * H()) continue;
        var lp = it.l / W();
        if (lp >= 0.38) continue;
        if (/^\d{1,2}:\d{2}$/.test(it.t)) continue;
        if (!best || it.b > best.b) best = it;
    }
    return best;
}

// 滑动到底 + 惯性稳定检测 (连续2帧最底项相同), 返回最底文本项(可为null)
function scrollSettle() {
    swipe(0.5 * W(), 0.82 * H(), 0.5 * W(), 0.32 * H(), 350);
    var prev = null, stable = 0;
    for (var s = 0; s < 5 && stable < 2; s++) {
        sleep(900);
        var cur = bottomLeftText();
        if (cur && prev && cur.t === prev.t && Math.abs(cur.b - prev.b) < 8) stable++;
        else stable = 0;
        prev = cur;
    }
    return prev;
}

// 像素带扫描: 最后文本之下找 OCR 隐形气泡(emoji/图片), x=0.21W 列 vs 同行 0.6W 背景
// 返回 {cx, cy, fromBand} 目标长按坐标
function locateLatest(lastText) {
    var xB = Math.round(0.21 * W()), xBG = Math.round(0.6 * W());
    var yStart = (lastText ? lastText.b : Math.round(0.10 * H())) + 24;
    var yEnd = Math.round(0.90 * H());
    if (yStart < yEnd) {
        var img = images.captureScreen();
        if (img) {
            function dist(y) {
                var c1 = images.pixel(img, xB, y), c2 = images.pixel(img, xBG, y);
                var dr = ((c1 >> 16) & 255) - ((c2 >> 16) & 255);
                var dg = ((c1 >> 8) & 255) - ((c2 >> 8) & 255);
                var db = (c1 & 255) - (c2 & 255);
                return Math.sqrt(dr * dr + dg * dg + db * db);
            }
            var bands = [], inBand = false, bs = 0, gap = 0;
            for (var y = yStart; y <= yEnd; y += 6) {
                if (dist(y) > CFG.BAND_DIST) {
                    if (!inBand) { inBand = true; bs = y; }
                    gap = 0;
                } else if (inBand) {
                    gap += 6;
                    if (gap > 24) {
                        if (y - gap - bs >= CFG.BAND_MIN_H) bands.push({ top: bs, b: y - gap });
                        inBand = false; gap = 0;
                    }
                }
            }
            if (inBand && yEnd - bs >= CFG.BAND_MIN_H) bands.push({ top: bs, b: yEnd });
            if (bands.length > 0) {
                var t = bands[bands.length - 1]; // 最底带 = 最新消息
                console.log('  隐形气泡带 ' + bands.length + ' 条, 取最底: ' + t.top + '-' + t.b);
                return { cx: xB, cy: Math.round((t.top + t.b) / 2), fromBand: true };
            }
        }
    }
    if (lastText) return { cx: lastText.cx, cy: lastText.cy, fromBand: false };
    return null;
}

// 剪贴板读回 v2 (1031 实证本 ROM 后台 getClip 可直读): 新内容→直返 / 读到哨兵=复制未生效→''由调用方重试 /
// 读为空=可能读取被拒→「AutoJs6 置前→读→回切微信」兜底 (回切前置已有 task 恢复聊天页; 权限收紧/换机时不劣化)
function readClipVerified() {
    var c = '';
    try { c = String(getClip() || ''); } catch (e) { console.warn('  getClip 异常: ' + e); }
    if (c && c !== CFG.SENTINEL) return c;
    if (c === CFG.SENTINEL) { console.warn('  读到哨兵=复制未生效'); return ''; }
    console.warn('  后台直读为空, 走置前读回兜底');
    app.launch(CFG.AJ_PKG);
    sleep(1400);
    try { c = String(getClip() || ''); } catch (e) { console.warn('  getClip 异常: ' + e); }
    app.launch(CFG.WX_PKG); // 回切微信, 前置已有 task 自动恢复聊天页
    sleep(1600);
    return (c && c !== CFG.SENTINEL) ? c : '';
}

// 长按目标 → 弹框裁判: 有"复制"→哨兵验证取精确原文; 有转发/收藏无复制→非文本; 返回 {type,text/hint}
function copyViaPopup(tgt) {
    setClip(CFG.SENTINEL);
    sleep(400);
    for (var att = 0; att < 3; att++) {
        gesture(900, [tgt.cx, tgt.cy], [tgt.cx, tgt.cy]);
        sleep(1100);
        var its = ocrGrab(0.02);
        var cp = findItem(its, function (it) { return it.t.indexOf('复制') >= 0; }); // 合并项容错("复制 转发")
        var sig = findItem(its, function (it) { return it.t.indexOf('转发') >= 0 || it.t.indexOf('收藏') >= 0 || it.t.indexOf('多选') >= 0; });
        if (cp) {
            // 合并时"复制"在弹框最左列, 点左~12% 处
            var px = (cp.t.length > 6 || cp.t.indexOf('转发') >= 0) ? cp.l + 0.12 * (cp.r - cp.l) : cp.cx;
            tapAt(px, cp.cy, '弹框复制');
            sleep(900);
            var c = readClipVerified();
            if (c) return { type: 'text', text: c };
            console.warn('  剪贴板未变化 att=' + att);
        } else if (sig) {
            return { type: 'nontext', hint: sig.t };
        } else {
            console.warn('  弹框未出现 att=' + att);
        }
    }
    return { type: 'fail' };
}

// OCR 误字归一: 只留汉字 + 常见误字纠偏(微信字体 已→系统性误读为 己)
function cnorm(s) {
    return String(s).replace(/[^\u4e00-\u9fa5]/g, '').replace(/己/g, '已');
}

// 验证输入框已含回复文本: 归一化后包含/模糊匹配, 限左中区(排除右侧已发气泡)
function verifyBoxHasReply() {
    return findItem(ocrGrab(0.02), function (it) {
        var c = cnorm(it.t);
        return it.cx < 0.55 * W() && it.cy > 0.4 * H()
            && (c.indexOf(CFG.REPLY_TEXT) >= 0 || similarity(c, CFG.REPLY_TEXT) >= 0.6);
    });
}

// 输入框区残留项 (0.885~0.95H, 排除导航键; 键盘需先关闭)
function boxLeftoverItem() {
    return findItem(ocrGrab(0.02), function (it) {
        return it.cy > 0.885 * H() && it.cy < 0.95 * H() && it.cx < 0.6 * W();
    });
}

// 清理输入框残留: 长按→全选→剪切/删除; 两帧确认空才算空; 失败返回 false (调用方须放弃回复防误发)
function clearInputBox() {
    var l1 = boxLeftoverItem();
    var l2 = null;
    if (!l1) { sleep(600); l2 = boxLeftoverItem(); }
    if (!l1 && !l2) return true;
    var lv = l1 || l2;
    console.log('  输入框有残留 "' + lv.t + '", 自动清理');
    for (var att = 0; att < 2; att++) {
        longPressAt(CFG.POS_INPUT.x * W(), CFG.POS_INPUT.y * H(), 900);
        sleep(1100);
        var sel = findItem(ocrGrab(0.02), function (it) { return it.cy > 0.55 * H() && it.t.indexOf('全选') >= 0; });
        if (!sel) { console.warn('  未找到"全选" att=' + att); continue; }
        tapAt(sel.cx, sel.cy, '全选');
        sleep(900);
        var cut = findItem(ocrGrab(0.02), function (it) {
            return it.cy > 0.55 * H() && (it.t.indexOf('剪切') >= 0 || it.t.indexOf('删除') >= 0 || it.t.indexOf('清空') >= 0);
        });
        if (cut) {
            tapAt(cut.cx, cut.cy, '剪切/删除');
            sleep(800);
            if (!boxLeftoverItem()) return true;
            console.warn('  清理后仍有残留 att=' + att);
        } else {
            console.warn('  未找到"剪切/删除" att=' + att);
        }
    }
    return false;
}

// 输入框粘贴: 清残留(必须成功, 防旧文本误发) → 长按输入条 → 工具栏"粘贴"(合并项容错) → 验证; 重试前先验证(防重复粘贴)
function pasteIntoInput(text) {
    if (kbOpen()) { back(); sleep(800); }
    if (!clearInputBox()) {
        console.warn('  输入框残留清理失败, 为防误发旧文本, 放弃本次回复');
        return false;
    }
    setClip(text);
    sleep(500);
    for (var att = 0; att < 3; att++) {
        var pre = verifyBoxHasReply();
        if (pre) { console.log('  输入框验证: "' + pre.t + '"'); return true; }
        if (kbOpen()) { back(); sleep(800); } // 键盘开着时长按会落到键盘上, 必须先关
        longPressAt(CFG.POS_INPUT.x * W(), CFG.POS_INPUT.y * H(), 900);
        sleep(1100);
        var pt = findItem(ocrGrab(0.02), function (it) {
            return it.cy > 0.55 * H() && it.t.indexOf('粘贴') >= 0 && it.t.indexOf('点击') < 0;
        });
        if (pt) {
            // "粘贴"在项内的字符比例位置 (独立项→中心, 合并项→按比例)
            var frac = (pt.t.indexOf('粘贴') + 1) / pt.t.length;
            var px = pt.l + frac * (pt.r - pt.l);
            tapAt(px, pt.cy, '工具栏粘贴');
            sleep(1100);
            var hit = verifyBoxHasReply();
            if (hit) { console.log('  输入框验证: "' + hit.t + '"'); return true; }
            console.warn('  粘贴后未见目标文本 att=' + att);
        } else {
            console.warn('  未找到工具栏"粘贴" att=' + att);
        }
    }
    return false;
}

// 点"发送" (右侧按钮) 并验证发出气泡
function tapSend() {
    var dead = nowMs() + 6000;
    while (nowMs() < dead) {
        var send = findItem(ocrGrab(0.02), function (it) {
            return it.t.indexOf('发送') >= 0 && it.cx > 0.7 * W() && it.cy > 0.55 * H();
        });
        if (send) {
            tapAt(send.cx, send.cy, '发送');
            sleep(1500);
            return true;
        }
        sleep(700);
    }
    return false;
}

// 自动回复主编排: [6/7] 读取最新消息, [7/7] 回复发送; lastReplied 防重发
function autoReply(item) {
    console.log('[6/7] 读取最新消息');
    if (kbOpen()) { back(); sleep(800); }
    var lastText = scrollSettle();
    var tgt = locateLatest(lastText);
    if (!tgt) { console.warn('  未定位到任何好友消息, 跳过回复'); return false; }
    var res = copyViaPopup(tgt);
    if (res.type === 'nontext') {
        console.warn('  最新消息为图片等不支持类型("' + res.hint + '"), 按配置跳过回复');
        back(); sleep(600); // 关弹框
        return false;
    }
    if (res.type === 'fail') { console.warn('  复制失败(3次), 跳过回复'); return false; }
    var original = res.text;
    console.log('  最新消息原文(剪贴板): "' + original + '"');
    var store = storages.create('wxauto');
    if (store.get('last_' + item.name) === original) {
        console.log('  该消息已回复过, 跳过 (lastReplied 防重)');
        return true;
    }
    console.log('[7/7] 回复并发送');
    var composed = '「' + original + '」' + CFG.REPLY_TEXT;
    if (!pasteIntoInput(composed)) { console.error('  粘贴失败, 未发送'); return false; }
    if (CFG.REPLY_DRY_RUN) { console.log('  DRY_RUN: 跳过发送, 文本留在输入框'); return true; }
    if (!tapSend()) { console.error('  未找到发送按钮, 未发送'); return false; }
    store.put('last_' + item.name, original);
    var sent = findItem(ocrGrab(0.02), function (it) {
        var c = cnorm(it.t);
        return it.cx > 0.6 * W() && (c.indexOf(CFG.REPLY_TEXT) >= 0 || similarity(c, CFG.REPLY_TEXT) >= 0.6);
    });
    if (sent) console.log('  发送验证 ✓ 右侧气泡: "' + sent.t + '"');
    else console.log('  已点发送 (气泡OCR未及验证, 已记 lastReplied)');
    return true;
}

/* ================= 处理链 ================= */

function handleItem(item) {
    console.log('===== 处理: "' + item.name + '" =====');
    if (!device.isScreenOn()) {
        device.wakeUpIfNeeded(); sleep(900);
        if (!device.isScreenOn()) { console.error('屏幕无法点亮, 放弃本次处理'); return false; }
    }
    if (!ensureWeChat()) { console.error('微信未能到前台'); return false; }
    if (!backToMain()) { console.error('未能回到微信主界面'); return false; }
    if (!openSearch()) { console.error('搜索页未打开'); return false; }
    var pasted = pasteIntoBox(item.name);
    if (!pasted) {
        console.warn('粘贴失败, 尝试降级: 通知点击直达');
        if (item.raw) {
            try { item.raw.click(); sleep(2500); } catch (e) { console.error('notification.click 异常: ' + e); }
            if (verifyChatPage(item.name)) { toastLog('[5/5] 已进入 "' + item.name + '" 聊天页(通知直达)'); return true; }
        }
        console.error('粘贴失败且通知直达失败');
        return false;
    }
    if (!pickContact(item.name)) {
        console.warn('结果定位失败, 降级: 通知点击直达');
        if (item.raw) {
            try { item.raw.click(); sleep(2500); } catch (e) { console.error('notification.click 异常: ' + e); }
            if (verifyChatPage(item.name)) { toastLog('[5/5] 已进入 "' + item.name + '" 聊天页(通知直达) ✓'); return true; }
        }
        console.error('未找到联系人 "' + item.name + '" 且通知直达失败 (可能已删除或名称特殊)');
        return false;
    }
    var ok = verifyChatPage(item.name);
    if (ok) toastLog('[5/5] 已进入 "' + item.name + '" 聊天页 ✓');
    else {
        console.warn('聊天页特征未确认, 尝试通知点击直达兜底');
        if (item.raw) { try { item.raw.click(); sleep(2500); } catch (e) {} ok = verifyChatPage(item.name); }
        if (ok) toastLog('[5/5] 已进入 "' + item.name + '" 聊天页(兜底) ✓');
        else console.error('进入聊天页失败: "' + item.name + '"');
    }
    if (ok && CFG.AUTO_REPLY) {
        try { autoReply(item); } catch (e) { console.error('[回复流程异常] ' + e); }
    }
    return ok;
}

/* ================= 队列工作线程 ================= */

var worker = threads.start(function () {
    while (true) {
        if (queue.length > 0 && !processing) {
            processing = true;
            var item = queue.shift();
            var ok = false;
            try { ok = handleItem(item); } catch (e) { console.error('处理异常: ' + e); }
            if (ok) stat.ok++; else stat.fail++;
            processing = false;
            console.log('[统计] 收=' + stat.recv + ' 成功=' + stat.ok + ' 失败=' + stat.fail + ' 跳过=' + stat.skip);
        }
        sleep(400);
    }
});

/* ================= 主流程 ================= */

console.log('===== wxauto-1 启动 =====');
// 无障碍(手势)可用性
try { auto(); } catch (e) { console.error('无障碍服务未开启: ' + e); exit(); }
// 截屏授权 (OCR 依赖), 守护线程自动点授权框
threads.start(function () {
    var names = ['立即开始', 'START NOW', '允许'];
    for (var r = 0; r < 2; r++) for (var i = 0; i < names.length; i++) {
        var b = text(names[i]).findOne(1500);
        if (b) { try { b.click(); console.log('已自动点击截屏授权'); } catch (e) {} }
    }
});
if (!images.requestScreenCapture()) { console.error('截屏权限被拒绝, OCR 通道不可用'); exit(); }

try {
    events.observeNotification();
} catch (e) {
    console.error('通知服务未运行! 请到 设置→特殊应用权限→通知使用权 开启 AutoJs6 后重启本脚本 (' + e + ')');
    exit();
}
events.onNotification(function (n) {
    try {
        var item = parseNotification(n);
        if (item && dedupCheck(item)) {
            console.log('[入队] 好友="' + item.name + '" 队列长度=' + (queue.length + 1));
            queue.push(item);
        }
    } catch (e) { console.error('通知回调异常: ' + e); }
});

setInterval(function () { console.log('[心跳] 运行中, 队列=' + queue.length); }, 300000);

// 自测入口: 若存在 /sdcard/wxauto_test.txt (内容=好友名), 启动时模拟一条通知走全链路
var TEST_FLAG = '/sdcard/wxauto_test.txt';
if (files.exists(TEST_FLAG)) {
    var testName = String(files.read(TEST_FLAG)).trim();
    if (testName) {
        console.log('[自测] 模拟通知, 好友="' + testName + '"');
        queue.push({ name: testName, text: '(自测消息)', title: testName, group: false, raw: null });
    }
}
toastLog('wxauto-1 监听中: 微信单聊消息将自动打开对应聊天页');
