/**
 * wxauto-B.js — 微信通知监听 → 解析好友名 → 搜索进聊天页 → 读最新消息 → 自动回复  【B 模式·全程 Shizuku·统一高敏】
 * @mode: shizuku
 *
 * 迁移自 wxauto-1.js (A 模式), 遵循 AI_DEBUG_PROMPT §3C / LOCATING_GUIDE §8:
 *  - 全程零无障碍: 手势→shizuku input (tap/swipe/motionevent 长按), back/home→keyevent, 前台→dumpsys
 *  - 零 MediaProjection: 截屏→shizuku screencap (免授权免会话死)
 *  - OCR 主通道 = mlkit 快通道 (实测 ~0.65s, 异常落 paddle 备用, finally 恢复); 误字容错沿用字符集相似度 + 误字等价表
 *  - 定位仅 OCR > 找图; 单截图复用; 失败即停 (业务关键步骤重试上限后放弃, 宁停勿误)
 *  - ★剪贴板读回 v2 (1031 实证翻案): 本 ROM 后台 getClip 可直读, 哨兵≠内容即取回免绕行(省~4s+零闪屏);
 *    读为空才走「AutoJs6 置前→读→回切」兜底, 读到哨兵=复制未生效直接重试 (旧"安卓10+读不到"结论在本机不成立)
 *  - 通知监听保留 (通知使用权 ≠ 无障碍, B 模式可用)
 *  - ★前台列表页守望者 (1101): 微信前台不发系统通知 (P0 dumpsys 实锤: 消息到达而 numPostedByApp 零变化)
 *    → 双通道补全前台死区: 停列表页时轮询 标题 微信(N) 增量 (触发器, 裁片OCR ~0.2s) + 头像列红角标
 *    #FA5151 红像素扫描 (定位器), 直点该行进会话走回复链; 连发拼接默认关 (WATCH_JOIN_BURST, 只回
 *    最新一条) (决策: 启动弹框名单 / 4.5s 轮询 / 目标会话需保持非免打扰—免打扰不计入标题N)
 *  - ★统一列表直点路线 (1101 流程改版): 通知路径不再搜索好友——gotoListPage 回列表页(底部栏可见点
 *    微信tab/否则逐层back)→findRowsFor 行定位(名字+红角标)直点; 无角标不点(宁停勿误); 行离屏双击
 *    标题栏回顶重扫; raw.click() 降为兜底。搜索链封装 searchEnterChat() 封存不调用, 预留好友搜索
 *  - ★守望简化版 (1101 二次决策): 角标=唯一事实源, 可见行每帧必扫; 标题N仅作"存在未读"门槛(无状态);
 *    移除 基线/静默窗/增量状态机/竞态护栏/lastReplied 防重(每条消息都要收到并回复便于验证);
 *    名单行不在屏内→双击标题回顶+向下翻页搜索(≤6页, N变化才搜, 搜完回顶);
 *    启动单弹框: 名单(逗号分隔),轮询秒数 例"静水流虚,5"
 *
 * 依赖: Shizuku 服务+AutoJs6 抽屉开关 / 通知使用权 / 零件库 lib/shizuku-lib.js (相对 require, 经 debugp)
 * 试点: RUN_ONCE=true 为一次性自测 (处理完测试项输出 __DONE__ 退出); 常驻改为 false
 */

var B = require('./lib/shizuku-lib.js');

var CFG = {
    WX_PKG: 'com.tencent.mm',
    WX_ACTIVITY: 'com.tencent.mm/.ui.LauncherUI',
    AJ_ACTIVITY: 'com.xiaoyu.ai/org.autojs.autojs.ui.main.MainActivity',
    DEDUP_MS: 8000,
    POLL_MS: 700,
    OCR_WAIT_MS: 15000,      // OCR 轮询等待(paddle 单次 ~4s, 比A模式放宽)
    HANDLE_GROUP: false,
    SIM_GATE: 0.34,
    SKIP_TITLES: ['微信', '微信支付', '微信团队', '服务通知', '微信运动', '腾讯新闻'],
    POS_SEARCH_ICON: { x: 0.8366, y: 0.0801 },  // 真机实测 1057,219 @1264x2736 (沿用A模式标定)
    POS_SEARCH_BOX: { x: 0.5324, y: 0.0811 },
    POS_INPUT: { x: 0.468, y: 0.9205 },
    AUTO_REPLY: true,
    REPLY_TEXT: '消息已收到',
    REPLY_DRY_RUN: false,     // ★试点安全阀: true=只粘贴不发送; 全链路确认后改 false 实发
    SENTINEL: 'WXAUTO_B_SENTINEL_913',
    BAND_DIST: 28,
    BAND_MIN_H: 60,
    RUN_ONCE: false,          // ★试点: 一次性处理; 常驻改 false
    TEST_FLAG: '/sdcard/wxauto_b_test.txt',
    /* ★前台列表页守望者 (1101 P0 标定 @1264x2736) */
    WATCH_POLL_MS: 5000,      // 轮询间隔 (启动弹框可配, 默认 5s; 建议 3~10s)
    WATCH_SEARCH_PAGES: 6,    // 翻页搜索最大页数 (名单行不在屏内时向下翻页找)
    WATCH_MAX_BURST: 5,       // 连发多条拼接上限
    WATCH_COOLDOWN_MS: 60000, // 处理失败防重入冷却/目标; 成功处理后清零
    WATCH_BADGE_X0: 0.12,     // 头像列红角标扫描 x 区间 (P0: 红@x177-202)
    WATCH_BADGE_X1: 0.18,
    WATCH_BADGE_DY: 40,       // 红扫描 y=名称top±40 (P0: 红@top-20..+20, bbox 抖动±9px)
    WATCH_RED_R: 200,         // 红判定 r>200 (P0 实测 250,81,81)
    WATCH_RED_G: 130,         // g<130
    WATCH_RED_B: 130,         // b<130
    WATCH_RED_MIN: 20,        // 红像素命中阈值 (step4 稀疏采样)
    WATCH_STEP: 4,
    WATCH_JOIN_BURST: false,  // ★连发拼接开关 (决策 1101: 先只回最新一条; P4 启用时需另设计边界机制)
    /* ★统一列表直点路线 (1101 流程改版) */
    POS_TAB_WEIXIN: { x: 0.123, y: 0.934 },   // 底部"微信"tab 中心 (P0 实测 156,2555)
    POS_TITLE: { x: 0.5, y: 0.078 },          // 标题栏"微信"二字区 (双击回顶; P0 实测标题中心 631,214)
    POS_POPUP_EXPAND_X: 0.9                   // 半屏聊天弹框展开按钮 x (与弹框标题同行右端; y 跟随 OCR 标题行)
};

var queue = [];
var processing = false;
var seen = {};
var stat = { recv: 0, ok: 0, fail: 0, skip: 0 };
var watchNames = [];          // 守望名单 (启动弹框录入 / TEST_FLAG 自测)
var watchLastSearchN = -1;    // 上次翻页搜索时的标题未读数 (N 变化才再搜, 防站立未读反复滚动)
var watchCooldown = {};       // 防重入冷却 {name: untilMs}; 处理成功清零

/* ================= 基础工具 ================= */

function W() { return device.width; }
function H() { return device.height; }
function nowMs() { return Date.now(); }
function toastLog(msg) { console.log(msg); } // 零 toast 铁律: 全走日志流

var TOAST_RE = /正在访问剪贴板|已复制|已停止运行|已粘贴/;

function similarity(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.indexOf(b) >= 0 || b.indexOf(a) >= 0) return 1;
    var sa = {}, sb = {}, union = 0, inter = 0, k;
    for (k = 0; k < a.length; k++) sa[a.charAt(k)] = true;
    for (k = 0; k < b.length; k++) if (!sb[b.charAt(k)]) sb[b.charAt(k)] = true;
    var seenCh = {};
    for (k = 0; k < a.length; k++) if (!seenCh[a.charAt(k)]) { seenCh[a.charAt(k)] = true; union++; inter += (b.indexOf(a.charAt(k)) >= 0 ? 1 : 0); }
    for (k = 0; k < b.length; k++) if (!seenCh[b.charAt(k)]) { seenCh[b.charAt(k)] = true; union++; }
    return union === 0 ? 0 : inter / union;
}

// OCR 结果归一项 [{t,l,top,r,b,cx,cy}] (处理链与守望者共用; text/label 双字段容错)
function normItems(rs, topCut) {
    var out = [];
    var cut = (topCut === undefined ? 0.03 : topCut) * H();
    for (var i = 0; i < (rs || []).length; i++) {
        var r = rs[i];
        var t = String(r.text || r.label || '').trim();
        if (!t || TOAST_RE.test(t)) continue;
        var b = r.bounds;
        if (!b || b.bottom <= cut) continue;
        out.push({ t: t, l: b.left, top: b.top, r: b.right, b: b.bottom, cx: (b.left + b.right) / 2, cy: (b.top + b.bottom) / 2 });
    }
    return out;
}

// B 模式感知核心: screencap → OCR(mlkit→paddle 备) → 统一项
var ocrSeq = 0;
function ocrGrab(topCut, imgPath) {
    var t0 = nowMs();
    var img = B.bScreencap(imgPath || '/sdcard/_wxb_frame.png');
    if (!img) { console.warn('screencap 失败'); return []; }
    var rs;
    try { rs = B.bOcr(img); } catch (e) { console.error('bOcr 异常: ' + e); rs = []; }
    img.recycle();
    console.log('  [ocrGrab#' + (++ocrSeq) + '] ' + (nowMs() - t0) + 'ms ' + (rs ? rs.length : 0) + '项');
    return normItems(rs, topCut);
}

function tapAt(x, y, label) {
    if (x <= 0 || y <= 0 || x > W() || y > H()) { console.warn('非法坐标跳过: ' + label); return false; }
    console.log('tap ' + label + ' @(' + Math.round(x) + ',' + Math.round(y) + ')');
    return B.bTap(Math.round(x), Math.round(y));
}

function longPressAt(x, y, ms) { return B.bLongPress(Math.round(x), Math.round(y), Math.max(900, ms || 950)); }
function keyBack() { return B.bKey(4); }
function findItem(items, fn) { for (var i = 0; i < items.length; i++) if (fn(items[i])) return items[i]; return null; }

// ★B 模式剪贴板读回 v2: 后台直读优先 (1031 实证本 ROM 放行; 旧"安卓10+后台读不到"在本机不成立)
// 三分支: 新内容→直返(免绕行省~4s+零闪屏) / 读到哨兵=复制未生效→原样返回由调用方重试 / 为空→置前读回兜底
function bGetClip() {
    var c = '';
    try { c = String(getClip() || ''); } catch (e) { console.warn('getClip 异常: ' + e); }
    if (c && c !== CFG.SENTINEL) return c;
    if (c === CFG.SENTINEL) { console.warn('  读到哨兵=复制未生效'); return c; }
    console.warn('后台直读为空, 走置前读回兜底');
    B.sh('am start -n ' + CFG.AJ_ACTIVITY);
    sleep(1400);
    try { c = String(getClip() || ''); } catch (e) { console.warn('getClip 异常: ' + e); }
    B.sh('am start -n ' + CFG.WX_ACTIVITY); // task 前置, 回到聊天页
    sleep(1600);
    return c;
}

/* ================= 通知解析 (B 模式保留: 通知使用权≠无障碍) ================= */

function parseNotification(n) {
    var pkg = String(n.getPackageName() || '');
    console.log('[通知] pkg=' + pkg + ' title="' + n.getTitle() + '" text="' + n.getText() + '"');
    if (pkg !== CFG.WX_PKG) return null;
    var title = String(n.getTitle() || '').trim();
    var text = String(n.getText() || '').trim();
    stat.recv++;
    if (!title || CFG.SKIP_TITLES.indexOf(title) >= 0) { stat.skip++; return null; }
    var body = text.replace(/^\[\d+条\]\s*/, '');
    var m = body.match(/^([^:：]{1,25})[:：]\s*/);
    var isGroup = false, name = title;
    if (m && m[1] !== title && title.indexOf(m[1]) < 0) {
        isGroup = true;
        if (CFG.HANDLE_GROUP) name = m[1];
    }
    if (isGroup && !CFG.HANDLE_GROUP) { stat.skip++; console.log('[跳过] 群聊'); return null; }
    return { name: name, text: body, title: title, group: isGroup, raw: n };
}

function dedupCheck(item) {
    var key = item.title + '|' + item.text;
    var t = nowMs();
    for (var k in seen) if (t - seen[k] > CFG.DEDUP_MS) delete seen[k];
    if (seen[key]) { console.log('[去重] 忽略'); return false; }
    seen[key] = t;
    return true;
}

/* ================= 微信操作 (OCR + shizuku input) ================= */

// 前台判定: dumpsys (B 模式唯一通道; 禁 currentPackage/auto.service)
function weChatForeground() {
    return /com\.tencent\.mm/.test(B.bForeground());
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

// ★列表页判定 (1101 流程改版): 标题区有 微信/微信(N) + 底部导航栏在 — 替代旧 isMainPage
// (聊天页标题=联系人名, 其他tab标题=各自名 → 标题含"微信"即列表页; SKIP_TITLES 已排除"微信"作联系人)
function isListPage() {
    var items = ocrGrab(0.02);
    var titleHit = false, tabBar = false;
    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (it.top < 0.12 * H() && it.top > 0.03 * H() && it.t.indexOf('微信') >= 0) titleHit = true;
        if (it.cy > 0.9 * H() && (it.t.indexOf('通讯录') >= 0 || it.t.indexOf('发现') >= 0 || it.t === '我' || it.t.indexOf('微信') >= 0)) tabBar = true;
    }
    return titleHit && tabBar;
}

// ★回列表页 (1101): 底部栏可见→点微信tab一步直达; 否则(聊天页/子页)逐层back — 替代旧 backToMain
function gotoListPage() {
    console.log('[导航] 回微信列表页');
    for (var i = 0; i < 6; i++) {
        if (isListPage()) { console.log('  已在列表页'); return true; }
        var items = ocrGrab(0.02);
        var tabBar = false;
        for (var k = 0; k < items.length; k++) {
            if (items[k].cy > 0.9 * H() && (items[k].t.indexOf('通讯录') >= 0 || items[k].t.indexOf('发现') >= 0 || items[k].t === '我')) { tabBar = true; break; }
        }
        if (tabBar) {
            tapAt(CFG.POS_TAB_WEIXIN.x * W(), CFG.POS_TAB_WEIXIN.y * H(), '微信tab');
            sleep(1800);
        } else {
            keyBack(); sleep(1500);
        }
    }
    return isListPage();
}

// ★双击标题栏回顶 (1101 用户补充: 列表页双击"微信"标题区自动滚回顶部)
function scrollListTop() {
    var tx = Math.round(CFG.POS_TITLE.x * W()), ty = Math.round(CFG.POS_TITLE.y * H());
    tapAt(tx, ty, '标题栏(双击1)');
    sleep(130);
    tapAt(tx, ty, '标题栏(双击2)');
    sleep(1000);
}

function openSearch() {
    console.log('[3/5] 打开搜索页');
    var dead = nowMs() + CFG.OCR_WAIT_MS;
    var tapped = false;
    while (nowMs() < dead) {
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

function boxHasText(name) {
    var items = ocrGrab(0.02);
    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (it.cy > 0.03 * H() && it.cy < 0.115 * H() && similarity(it.t, name) >= 0.4) return true;
    }
    return false;
}

// 搜索框输入(中文): setClip(后台写已验证穿透) → 讯飞条/长按粘贴 (与A模式同策略)
function pasteIntoBox(name) {
    setClip(name);
    sleep(400);
    if (boxHasText(name)) return true;
    for (var att = 0; att < 2; att++) {
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
        longPressAt(CFG.POS_SEARCH_BOX.x * W(), CFG.POS_SEARCH_BOX.y * H(), 900);
        sleep(1000);
        var pb = findItem(ocrGrab(0.02), function (it) {
            return it.t.indexOf('粘贴') >= 0 && it.t.indexOf('点击') < 0 && it.cy > 0.12 * H() && it.cy < 0.3 * H();
        });
        if (pb) {
            tapAt(pb.cx, pb.cy, '粘贴气泡');
            sleep(900);
            if (boxHasText(name)) return true;
        }
        tapAt(CFG.POS_SEARCH_BOX.x * W(), CFG.POS_SEARCH_BOX.y * H(), '搜索框');
        sleep(1200);
    }
    return boxHasText(name);
}

var SECTION_HEADERS = ['联系人', '功能', '群聊', '聊天记录', '公众号', '小程序', '视频号', '朋友圈', '最近使用', '最常使用', '点击粘贴', '常用语', '搜索网络结果'];
function isHeaderText(t) {
    for (var i = 0; i < SECTION_HEADERS.length; i++) if (t.indexOf(SECTION_HEADERS[i]) >= 0) return true;
    return t.indexOf('包含') >= 0;
}

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
            if (it.t.indexOf('包含') >= 0) continue;
            if (barTop >= 0 && it.cy > barTop && it.cy < barBot) continue;
            if (it.cy < 0.11 * H()) continue;
            cands.push(it);
        }
        var best = null, bestSim = 0;
        for (var k = 0; k < cands.length; k++) {
            var s = similarity(cands[k].t, name);
            if (cands[k].t.length > name.length + 5 && s < 1) continue;
            if (s > bestSim) { bestSim = s; best = cands[k]; }
        }
        if (best && bestSim >= CFG.SIM_GATE) {
            console.log('  命中: "' + best.t + '" sim=' + bestSim.toFixed(2));
            tapAt(best.cx, best.cy, '联系人项');
            sleep(1800);
            return true;
        }
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

/* ================= 预留能力: 好友搜索进会话 (1101 封存, 全局无调用) ================= */
// 流程改版后通知/列表双通道均走列表直点; 本链路整体封装保留, 后续"好友搜索"场景直接调用 searchEnterChat(name)
function searchEnterChat(name) {
    console.log('[搜索链·预留] "' + name + '"');
    if (!openSearch()) { console.error('  搜索页未打开'); return false; }
    if (!pasteIntoBox(name)) { console.error('  搜索粘贴失败: "' + name + '"'); return false; }
    if (!pickContact(name)) { console.error('  未找到联系人: "' + name + '"'); return false; }
    return verifyChatPage(name);
}

/* ================= 统一进会话路线 (1101 流程改版) ================= */

// ★回列表页→行定位(名字+红角标)→直点进会话; raw 通知点击仅作兜底
// 无角标不点(宁停勿误): 名字在而角标无=消息已被手动读过, 不抢用户正在聊的会话
function enterChatFromList(name, raw, allowNoBadge) {
    if (!gotoListPage()) { console.error('未能回到微信列表页'); return false; }
    for (var attempt = 0; attempt < 2; attempt++) {
        var img = B.bScreencap('/sdcard/_wxb_watch.png');
        if (img) {
            var rs = [];
            try { rs = B.bOcr(img) || []; } catch (e) {}
            var hit = findRowsFor(normItems(rs, 0), img, [name]);
            img.recycle();
            if (hit) {
                console.log('  行定位命中 "' + hit.name + '" @(' + Math.round(hit.cx) + ',' + Math.round(hit.cy) + ')' + (hit.digit ? ' 未读' + hit.digit : ''));
                tapAt(hit.cx, hit.cy, '列表行-' + name);
                sleep(2000);
                if (verifyChatPage(name)) return true;
                console.warn('  点击后未见聊天页 att=' + attempt);
                continue;
            }
        }
        // 未命中: 名字在但无角标? 行不在屏内?
        var nameRow = findItem(ocrGrab(0.02), function (it) {
            return it.cy > 0.12 * H() && it.cy < 0.88 * H() && it.t.indexOf(':') < 0 && it.t.indexOf('：') < 0
                && ((it.t.indexOf(name) >= 0 || name.indexOf(it.t) >= 0) && it.t.length <= name.length + 2);
        });
        if (nameRow) {
            if (allowNoBadge) {
                // 通知路径豁免: 通知本身就是消息证明 (用户点通知打开会话已把角标读掉), 照点
                console.log('  命中名单行(无角标, 通知路径豁免), 照点');
                tapAt(nameRow.cx, nameRow.cy, '列表行-' + name);
                sleep(2000);
                if (verifyChatPage(name)) return true;
                console.warn('  点击后未见聊天页 att=' + attempt);
                continue;
            }
            console.warn('  目标行在但无红角标(消息可能已被手动读过), 宁停勿误不点');
            return false;
        }
        if (attempt === 0) {
            console.log('  目标行不在屏内, 双击标题栏回顶重扫');
            scrollListTop();
        }
    }
    if (raw) {
        console.warn('  行定位失败, 通知点击直达兜底');
        try { raw.click(); sleep(2500); } catch (e) { console.error('notification.click 异常: ' + e); }
        if (verifyChatPage(name)) return true;
    }
    return false;
}

// ★通知落地三态识别 (1101): 一帧 OCR 按 名字出现的高度带 判定 — 列表页/全屏聊天/半屏弹框
// 列表页判定必须先做 (列表行名也在中部带, 会被误判成弹框); 弹框标题居中, 加 cx 过滤排除左侧气泡
function resolveChatLanding(name) {
    var img = B.bScreencap('/sdcard/_wxb_watch.png');
    if (!img) return { type: 'other' };
    var rs = [];
    try { rs = B.bOcr(img) || []; } catch (e) {}
    var items = normItems(rs, 0);
    img.recycle();
    var titleWx = false, tabBar = false;
    for (var i = 0; i < items.length; i++) {
        var it0 = items[i];
        if (it0.top > 0.03 * H() && it0.top < 0.12 * H() && it0.t.indexOf('微信') >= 0) titleWx = true;
        if (it0.cy > 0.9 * H() && (it0.t.indexOf('通讯录') >= 0 || it0.t.indexOf('发现') >= 0 || it0.t === '我')) tabBar = true;
    }
    if (titleWx && tabBar) return { type: 'list' };
    for (var k = 0; k < items.length; k++) {
        var it = items[k];
        var isName = (it.t.indexOf(name) >= 0 || name.indexOf(it.t) >= 0) && it.t.length <= name.length + 2;
        if (!isName) continue;
        if (it.top > 0.03 * H() && it.top < 0.09 * H()) return { type: 'full' };                 // 顶部标题带=全屏聊天
        if (it.cy > 0.25 * H() && it.cy < 0.45 * H() && it.cx > 0.35 * W()) {                    // 中部居中带=半屏弹框标题
            return { type: 'popup', titleCy: it.cy };
        }
    }
    return { type: 'other' };
}

// 在当前(全屏)聊天页就地回复并退回列表页 — 落地直答共用收尾 (非文本分支在 autoReply 内已自back)
function replyInPlaceAndBack(item) {
    if (CFG.AUTO_REPLY) { try { autoReply(item); } catch (e) { console.error('[回复流程异常] ' + e); } }
    if (verifyChatPage(item.name)) { keyBack(); sleep(1500); }   // 回列表页接续守望
    console.log('[直答] 处理完毕, 已回列表页');
    return true;
}

/* ================= 读最新消息并回复 ================= */

function kbOpen() {
    return !!findItem(ocrGrab(0.02), function (it) {
        return it.t.indexOf('语音输入') >= 0 || it.t.indexOf('全屏输入') >= 0 || (it.t.indexOf('中') >= 0 && it.t.indexOf('英') >= 0);
    });
}

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

function scrollSettle() {
    B.bSwipe(0.5 * W(), 0.82 * H(), 0.5 * W(), 0.32 * H(), 350);
    var prev = null, stable = 0;
    for (var s = 0; s < 5 && stable < 2; s++) {
        sleep(1000);
        var cur = bottomLeftText();
        if (cur && prev && cur.t === prev.t && Math.abs(cur.b - prev.b) < 8) stable++;
        else stable = 0;
        prev = cur;
    }
    return prev;
}

// 像素带扫描 (与A模式同算法, 供图换 screencap)
function locateLatest(lastText, yEndOv) {
    var xB = Math.round(0.21 * W()), xBG = Math.round(0.6 * W());
    var yStart = (lastText ? lastText.b : Math.round(0.10 * H())) + 24;
    var yEnd = yEndOv || Math.round(0.90 * H());
    if (yStart < yEnd) {
        var img = B.bScreencap('/sdcard/_wxb_band.png');
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
            img.recycle();
            if (bands.length > 0) {
                var t = bands[bands.length - 1];
                console.log('  隐形气泡带 ' + bands.length + ' 条, 取最底: ' + t.top + '-' + t.b);
                return { cx: xB, cy: Math.round((t.top + t.b) / 2), top: t.top, b: t.b, fromBand: true };
            }
        }
    }
    if (lastText) return { cx: lastText.cx, cy: lastText.cy, fromBand: false };
    return null;
}

// 长按→弹框裁判→复制; ★剪贴板读回走 bGetClip() (置前读回切)
function copyViaPopup(tgt) {
    setClip(CFG.SENTINEL);
    sleep(400);
    for (var att = 0; att < 3; att++) {
        longPressAt(tgt.cx, tgt.cy, 950);
        sleep(1200);
        var its = ocrGrab(0.02);
        var cp = findItem(its, function (it) { return it.t.indexOf('复制') >= 0; });
        var sig = findItem(its, function (it) { return it.t.indexOf('转发') >= 0 || it.t.indexOf('收藏') >= 0 || it.t.indexOf('多选') >= 0; });
        if (cp) {
            var px = (cp.t.length > 6 || cp.t.indexOf('转发') >= 0) ? cp.l + 0.12 * (cp.r - cp.l) : cp.cx;
            tapAt(px, cp.cy, '弹框复制');
            sleep(900);
            var c = bGetClip();
            if (c && c !== CFG.SENTINEL) return { type: 'text', text: c };
            console.warn('  剪贴板未变化 att=' + att);
        } else if (sig) {
            return { type: 'nontext', hint: sig.t };
        } else {
            console.warn('  弹框未出现 att=' + att);
        }
    }
    return { type: 'fail' };
}

function cnorm(s) {
    return String(s).replace(/[^\u4e00-\u9fa5]/g, '').replace(/己/g, '已');
}

function verifyBoxHasReply() {
    return findItem(ocrGrab(0.02), function (it) {
        var c = cnorm(it.t);
        return it.cx < 0.55 * W() && it.cy > 0.4 * H()
            && (c.indexOf(CFG.REPLY_TEXT) >= 0 || similarity(c, CFG.REPLY_TEXT) >= 0.6);
    });
}

function boxLeftoverItem() {
    return findItem(ocrGrab(0.02), function (it) {
        if (it.cx >= 0.6 * W() || it.cx < 0.09 * W()) return false;   // ★左限排除语音图标OCR碎片 (")"@x68 通知路径回归实锤), 右限输入框区
        if (it.cy > 0.885 * H() && it.cy < 0.95 * H()) return true;   // 原单行残留区
        // ★多行拼接残留 (1101): 输入框随行数长高, 任一行含回复话术/收尾引号即判残留 (全选剪切会整框清掉)
        var c = cnorm(it.t);
        return it.cy > 0.75 * H() && it.cy < 0.95 * H()
            && (c.indexOf(CFG.REPLY_TEXT) >= 0 || it.t.indexOf('」') >= 0 || similarity(c, CFG.REPLY_TEXT) >= 0.6);
    });
}

function clearInputBox(chatName) {
    var l1 = boxLeftoverItem();
    var l2 = null;
    if (!l1) { sleep(600); l2 = boxLeftoverItem(); }
    if (!l1 && !l2) return true;
    var lv = l1 || l2;
    console.log('  输入框有残留 "' + lv.t + '" @(' + Math.round(lv.cx) + ',' + Math.round(lv.cy) + '), 自动清理');
    for (var att = 0; att < 3; att++) {
        longPressAt(lv.cx, lv.cy, 950);   // ★长按残留文本本体 (固定POS可能落在文本右侧空白, 只出光标不出工具栏 — 1101 三测实锤)
        sleep(1200);
        var sel = findItem(ocrGrab(0.02), function (it) { return it.cy > 0.55 * H() && it.t.indexOf('全选') >= 0; });
        if (!sel) { console.warn('  未找到"全选" att=' + att); continue; }
        // ★合并项容错: 工具栏被 mlkit 合并成一项时整项中心=空白 (1101 首测实锤), 按字符偏移点"全选"本体
        var si = sel.t.indexOf('全选');
        var scw = (sel.r - sel.l) / Math.max(sel.t.length, 1);
        tapAt(sel.l + (si + 0.5) * scw, sel.cy, '全选[字符位]');
        sleep(900);
        var cut = findItem(ocrGrab(0.02), function (it) {
            return it.cy > 0.55 * H() && (it.t.indexOf('剪切') >= 0 || it.t.indexOf('删除') >= 0 || it.t.indexOf('清空') >= 0);
        });
        if (cut) {
            var ci = -1, ck = '';
            var kws = ['剪切', '删除', '清空'];
            for (var ki = 0; ki < kws.length; ki++) {
                if (ci < 0 && cut.t.indexOf(kws[ki]) >= 0) { ci = cut.t.indexOf(kws[ki]); ck = kws[ki]; }
            }
            var ccw = (cut.r - cut.l) / Math.max(cut.t.length, 1);
            tapAt(cut.l + (ci + ck.length * 0.5) * ccw, cut.cy, ck + '[字符位]');
            sleep(800);
            // ★禁 keyBack (剪切后手柄已自消, back 会退出会话 → 复查抓到列表页导航 tab 当假残留 — 1101 三测实锤)
            tapAt(0.5 * W(), 0.42 * H(), '空白区收手柄');   // 单击空白收掉光标/选择手柄
            sleep(600);
            if (chatName && !verifyChatPage(chatName)) { console.warn('  清理中意外离开会话, 放弃'); return false; }
            var rl = boxLeftoverItem();
            if (!rl) return true;
            console.warn('  清理后仍有残留 "' + rl.t + '" @(' + Math.round(rl.cx) + ',' + Math.round(rl.cy) + ') att=' + att);
        } else {
            console.warn('  未找到"剪切/删除" att=' + att);
        }
    }
    return false;
}

function pasteIntoInput(text, chatName) {
    if (kbOpen()) { keyBack(); sleep(800); }
    if (!clearInputBox(chatName)) {
        console.warn('  输入框残留清理失败, 为防误发旧文本, 放弃本次回复');
        return false;
    }
    setClip(text);
    sleep(500);
    for (var att = 0; att < 3; att++) {
        var pre = verifyBoxHasReply();
        if (pre) { console.log('  输入框验证: "' + pre.t + '"'); return true; }
        if (kbOpen()) { keyBack(); sleep(800); }
        longPressAt(CFG.POS_INPUT.x * W(), CFG.POS_INPUT.y * H(), 950);
        sleep(1200);
        var pt = findItem(ocrGrab(0.02), function (it) {
            return it.cy > 0.55 * H() && it.t.indexOf('粘贴') >= 0 && it.t.indexOf('点击') < 0;
        });
        if (pt) {
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

function tapSend() {
    var dead = nowMs() + 8000;
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

function autoReply(item) {
    console.log('[6/7] 读取最新消息');
    if (kbOpen()) { keyBack(); sleep(800); }
    // ★需求 1101: 进会话首要判断输入框, 有残留先清 (长按残留→全选→剪切) — 再走读最后一条/回复链
    if (!clearInputBox(item.name)) { console.warn('  进场清理失败, 为防误发放弃本轮回复'); return false; }
    var lastText = scrollSettle();
    var tgt = locateLatest(lastText);
    if (!tgt) { console.warn('  未定位到任何好友消息, 跳过回复'); return false; }
    var res = copyViaPopup(tgt);
    if (res.type === 'nontext') {
        console.warn('  最新消息为图片等不支持类型("' + res.hint + '"), 按配置跳过回复');
        keyBack(); sleep(600);
        return false;
    }
    if (res.type === 'fail') { console.warn('  复制失败(3次), 跳过回复'); return false; }
    var original = res.text;
    console.log('  最新消息原文(剪贴板): "' + original + '"');
    // ★lastReplied 防重已移除 (1101 用户决策: 每条消息都要收到并回复便于验证; 防循环由 角标消失+冷却 承担)
    // ★连发多条拼接 (决策 1101): 自底向上 OCR 行走逐条长按复制, 换行拼成一段回复
    //   纯文本气泡无隐形带 (带仅供 emoji/图片), 故用 OCR 行走; 重复=同气泡上一行→上移排除线继续
    //   停止: 条数达 want / 非文本消息 / 行走 guard 上限 (P4 启用拼接时需另设计边界机制)
    if (CFG.WATCH_JOIN_BURST && item.viaList && (item.unreadN || 1) > 1) {
        var prevTop = (tgt.fromBand && tgt.top) ? tgt.top : (lastText ? lastText.top : 0);
        if (prevTop > 0) {
            var texts = [original];
            var want = Math.min(item.unreadN, CFG.WATCH_MAX_BURST);
            var guard = 0;
            while (texts.length < want && prevTop > 0.15 * H() && guard++ < 12) {
                var its = ocrGrab(0.02);
                var cand = null;
                for (var bi = 0; bi < its.length; bi++) {
                    var bt = its[bi];
                    if (bt.b >= prevTop - 8) continue;                       // 只看已复制气泡之上
                    if (bt.cx > 0.45 * W() || bt.cx < 0.06 * W()) continue;  // 排除右侧自己/居中时间·系统行/头像列
                    if (bt.cy < 0.12 * H() || bt.cy > 0.86 * H()) continue;  // 排除顶栏/输入区
                    if (/^\d{1,2}:\d{2}$/.test(bt.t)) continue;
                    if (bt.t.length > 60) continue;
                    if (!cand || bt.b > cand.b) cand = bt;
                }
                if (!cand) break;
                var r2 = copyViaPopup({ cx: cand.cx, cy: cand.cy });
                if (r2.type !== 'text') { console.log('  上方消息为非文本, 停止拼接 (已集 ' + texts.length + ' 条)'); break; }
                if (texts.indexOf(r2.text) >= 0) { prevTop = cand.top; continue; }   // 同气泡上一行, 上移排除线
                texts.push(r2.text);
                console.log('  拼接收集 #' + texts.length + ': "' + r2.text + '"');
                prevTop = cand.top;
            }
            if (texts.length > 1) {
                texts.reverse();   // 收集为新→旧, 反转为时间正序
                original = texts.join('\n');
                console.log('  拼接 ' + texts.length + ' 条: "' + original.replace(/\n/g, '⏎') + '"');
            }
        }
    }
    console.log('[7/7] 回复并发送');
    var composed = '「' + original + '」' + CFG.REPLY_TEXT;
    if (!pasteIntoInput(composed, item.name)) { console.error('  粘贴失败, 未发送'); return false; }
    if (CFG.REPLY_DRY_RUN) { console.log('  DRY_RUN: 跳过发送, 文本留在输入框'); return true; }
    if (!tapSend()) { console.error('  未找到发送按钮, 未发送'); return false; }
    // 验证须取**最底部**匹配 (历史回复气泡也含同文本, findItem 首项会抓到老气泡 — 1031 试点教训)
    var its = ocrGrab(0.02), sent = null;
    for (var vi = 0; vi < its.length; vi++) {
        var c = cnorm(its[vi].t);
        if (its[vi].cx > 0.6 * W() && (c.indexOf(CFG.REPLY_TEXT) >= 0 || similarity(c, CFG.REPLY_TEXT) >= 0.6)) {
            if (!sent || its[vi].b > sent.b) sent = its[vi];
        }
    }
    if (sent) console.log('  发送验证 ✓ 右侧气泡: "' + sent.t + '"');
    else console.log('  已点发送 (气泡OCR未及验证)');
    return true;
}

/* ================= 处理链 ================= */

function handleItem(item) {
    console.log('===== 处理: "' + item.name + '"' + (item.viaList ? ' [列表页直点]' : ' [通知]') + ' =====');
    if (!device.isScreenOn()) {
        device.wakeUpIfNeeded(); sleep(900);
        if (!device.isScreenOn()) { console.error('屏幕无法点亮, 放弃本次处理'); return false; }
    }
    if (!ensureWeChat()) { console.error('微信未能到前台'); return false; }
    // ★viaList 快速链 (1101): 守望者已有行坐标, 免重扫直点; 失败降级列表重扫
    //   (竞态护栏已随 N 状态机一并移除: 角标=事实源, 处理中新到消息由"只回最新"语义自然覆盖)
    if (item.viaList && weChatForeground()) {
        tapAt(item.rowX, item.rowY, '列表行-' + item.name);
        sleep(2000);
        if (verifyChatPage(item.name)) {
            console.log('[快速链] 已进入 "' + item.name + '" 聊天页 ✓');
            if (CFG.AUTO_REPLY) { try { autoReply(item); } catch (e) { console.error('[回复流程异常] ' + e); } }
            if (verifyChatPage(item.name)) { keyBack(); sleep(1500); }   // 回列表页接续守望 (非文本分支已自back)
            console.log('[快速链] 处理完毕, 已回列表页');
            return true;
        }
        console.warn('[快速链] 直点未进聊天页, 降级列表重扫');
    }
    // ★通知落地分流 (1101): 点通知可能落 全屏聊天/半屏弹框/列表页 三态, 能直答就直答不绕列表
    //   半屏态绝不直接跑回复链 (scrollSettle/输入框标定全是全屏几何) → 必须先展开成全屏
    if (!item.viaList && weChatForeground()) {
        sleep(2500);   // ★留出用户点通知的时间窗 (点击会开弹框/全屏并清角标, 先让落地态稳定再判)
        var land = null;
        for (var li = 0; li < 3; li++) {
            land = resolveChatLanding(item.name);
            if (land.type !== 'other') break;
            sleep(1500);   // 未知态: 弹框可能在动画中, 稍候重判
        }
        if (land.type === 'full') {
            console.log('[落地] 全屏聊天已在目标会话, 就地直答');
            return replyInPlaceAndBack(item);
        }
        if (land.type === 'popup') {
            console.log('[落地] 半屏弹框, 展开为全屏');
            tapAt(CFG.POS_POPUP_EXPAND_X * W(), land.titleCy, '弹框展开');
            sleep(2000);
            if (verifyChatPage(item.name)) {
                console.log('[落地] 已展开为全屏, 就地直答');
                return replyInPlaceAndBack(item);
            }
            console.warn('[落地] 展开后未见聊天页, 退回统一列表路线');
        }
    }
    // ★统一列表直点路线 (1101 流程改版): 通知路径不再搜索——回列表页按行定位直点, raw 仅兜底
    var ok = enterChatFromList(item.name, item.raw, !item.viaList);
    if (!ok && !item.viaList) {
        // ★兜底恢复: 失败时屏幕可能停在 半屏弹框/全屏聊天 (用户点通知所致) — 再判一次能直答就直答, 否则清场不留卡死弹框
        var land2 = resolveChatLanding(item.name);
        if (land2.type === 'full') { console.log('[落地恢复] 全屏聊天, 就地直答'); return replyInPlaceAndBack(item); }
        if (land2.type === 'popup') {
            console.log('[落地恢复] 半屏弹框, 展开为全屏');
            tapAt(CFG.POS_POPUP_EXPAND_X * W(), land2.titleCy, '弹框展开');
            sleep(2000);
            if (verifyChatPage(item.name)) return replyInPlaceAndBack(item);
        }
        keyBack(); sleep(1000);   // 清场: 关掉弹框/退出怪页面, 不留卡死态
    }
    if (!ok) { console.error('进入聊天页失败: "' + item.name + '"'); return false; }
    console.log('[5/5] 已进入 "' + item.name + '" 聊天页 ✓');
    if (CFG.AUTO_REPLY) {
        try { autoReply(item); } catch (e) { console.error('[回复流程异常] ' + e); }
    }
    if (verifyChatPage(item.name)) { keyBack(); sleep(1500); }   // 回列表页接续守望 (非文本分支已自back)
    return true;
}

/* ================= 前台列表页守望者 (1101 P0 标定) ================= */
// 触发器: 标题 微信(N) 增量 (P0: bbox~(546,189) 逐跳全中, 检测延迟≤1个轮询周期)
// 定位器: 头像列红角标 #FA5151 (250,81,81) 红像素扫描; 角标数字 mlkit 时读时不读→仅作未读数加成

function parseTitleN(items) {
    var cut = 0.12 * H();
    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (it.top >= cut) continue;
        var m = it.t.match(/微信\s*[（(]?\s*(\d+)/);
        if (m) return parseInt(m[1], 10);
    }
    return null;   // 非列表页(聊天页/其他tab)自然静默
}

// 红角标扫描: x 固定头像列 (不随名称 bbox 漂移, P0 见合并噪声"一静水流虚"左缘 -33px), y=名称top±40
function badgeRed(img, nameTop) {
    if (!img) return false;
    var x0 = Math.round(CFG.WATCH_BADGE_X0 * W()), x1 = Math.round(CFG.WATCH_BADGE_X1 * W());
    var y0 = nameTop - CFG.WATCH_BADGE_DY, y1 = nameTop + CFG.WATCH_BADGE_DY;
    var hits = 0;
    for (var x = x0; x <= x1; x += CFG.WATCH_STEP) {
        for (var y = y0; y <= y1; y += CFG.WATCH_STEP) {
            if (y < 0 || y >= H()) continue;
            var c = images.pixel(img, x, y);
            if (((c >> 16) & 255) > CFG.WATCH_RED_R && ((c >> 8) & 255) < CFG.WATCH_RED_G && (c & 255) < CFG.WATCH_RED_B) {
                hits++;
                if (hits >= CFG.WATCH_RED_MIN) return true;
            }
        }
    }
    return false;
}

// 角标数字 (opportunistic: P0 实测 3/4 未读出 5 读出; 读到当未读数, 读不到走 N 增量)
function badgeDigit(items, nm) {
    var best = null;
    for (var i = 0; i < items.length; i++) {
        var d = items[i];
        if (!/^\d{1,2}$/.test(d.t)) continue;
        if (d.r <= nm.l && d.top > nm.top - 120 && d.b < nm.b + 60) best = parseInt(d.t, 10);
    }
    return best;
}

// 名单行名称匹配 (不含角标判定) — findRowsFor 与翻页搜索"行在无角标"检查共用
// 排除: 标题区/底部tab (cy 带通), 群预览"名:内容"/草稿行 (含冒号), 时间行; 容合并噪声("一静水流虚")
function matchNameRow(it, names) {
    if (it.cy < 0.12 * H() || it.cy > 0.88 * H()) return null;
    if (it.t.indexOf(':') >= 0 || it.t.indexOf('：') >= 0) return null;
    for (var w = 0; w < names.length; w++) {
        var wn = names[w];
        if ((it.t.indexOf(wn) >= 0 || wn.indexOf(it.t) >= 0) && it.t.length <= wn.length + 2) return wn;
    }
    return null;
}

// ★行定位(泛化 1101): names=守望名单(守望通道) 或 [通知好友名](通知通道); 名称匹配 + 红角标确认
function findRowsFor(items, img, names) {
    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var nm = matchNameRow(it, names);
        if (!nm) continue;
        if (badgeRed(img, it.top)) {
            return { name: nm, cx: Math.max(it.cx, 0.28 * W()), cy: it.cy, digit: badgeDigit(items, it) };
        }
    }
    return null;
}

function findWatchRow(items, img) { return findRowsFor(items, img, watchNames); }

// 守望入队统一出口 (角标为准: 启动存量/回落残留/N增量 三路共用)
function enqueueWatch(hit, unread) {
    watchCooldown[hit.name] = nowMs() + CFG.WATCH_COOLDOWN_MS;
    queue.push({ name: hit.name, text: '(列表页触发)', title: hit.name, group: false, raw: null,
        viaList: true, rowX: hit.cx, rowY: hit.cy, unreadN: unread });
    stat.recv++;
    console.log('[守望] 入队 "' + hit.name + '" 行(' + Math.round(hit.cx) + ',' + Math.round(hit.cy) + ') 未读~' + unread + ' 队列=' + queue.length);
}

// ★守望主循环 (1101 简化版: 角标=唯一事实源, 标题N仅作"存在未读"门槛; 无基线/静默窗/增量状态机)
function watchTick() {
    if (!device.isScreenOn()) return;   // 灭屏场景交给通知通道
    if (!weChatForeground()) return;
    var img = B.bScreencap('/sdcard/_wxb_watch.png');   // 独立帧路径, 防与处理链竞态
    if (!img) { console.warn('[守望] screencap 失败'); return; }
    var rs = [];
    try { rs = B.bOcr(img) || []; } catch (e) { console.error('[守望] bOcr 异常: ' + e); }
    var items = normItems(rs, 0);
    // ① 可见扫描: 名单行+红角标 → 直接入队 (每帧必扫; 红像素扫描毫秒级)
    var hit = findWatchRow(items, img);
    img.recycle();
    if (hit) {
        if (nowMs() < (watchCooldown[hit.name] || 0)) { console.log('[守望] "' + hit.name + '" 冷却中, 跳过'); return; }
        enqueueWatch(hit, hit.digit || 1);
        return;
    }
    // ② 翻页搜索门槛: 存在未读(N≥1)且 N 有变化才滚列表 (站立未读搜过一次即止, 防反复滚动骚扰)
    var n = parseTitleN(items);
    if (n === null || n < 1) return;
    if (n === watchLastSearchN) return;
    console.log('[守望] 可见未命中但存在未读 N=' + n + ', 回顶+翻页搜索名单行');
    scrollListTop();   // 新消息行必跳顶部, 先回顶重扫
    for (var page = 0; page <= CFG.WATCH_SEARCH_PAGES; page++) {
        if (page > 0) {
            B.bSwipe(Math.round(0.5 * W()), Math.round(0.72 * H()), Math.round(0.5 * W()), Math.round(0.30 * H()), 400);
            sleep(1200);
        }
        var img2 = B.bScreencap('/sdcard/_wxb_watch.png');
        if (!img2) continue;
        var rs2 = [];
        try { rs2 = B.bOcr(img2) || []; } catch (e) {}
        var its2 = normItems(rs2, 0);
        var hit2 = findWatchRow(its2, img2);
        if (hit2) {
            img2.recycle();
            if (nowMs() < (watchCooldown[hit2.name] || 0)) { console.log('[守望] "' + hit2.name + '" 冷却中, 跳过'); return; }
            console.log('[守望] 翻页第' + page + '页命中');
            enqueueWatch(hit2, hit2.digit || 1);
            return;   // 坐标在当前滚动位有效, worker 立即点击 (processing 互斥保证期间不再滚动)
        }
        // 名单行在但无角标 = 消息已被手动读过, 宁停勿误不点
        var nameRow = findItem(its2, function (it) { return matchNameRow(it, watchNames) !== null; });
        img2.recycle();
        if (nameRow) { console.log('[守望] 翻页命中名单行但无角标(已被手动读), 停止搜索'); break; }
    }
    scrollListTop();   // 搜索结束回顶复位
    watchLastSearchN = n;   // 记录已搜过的未读数, N 变化才再搜
}

/* ================= 队列工作线程 ================= */

var processedOnce = false;
var worker = threads.start(function () {
    while (true) {
        if (queue.length > 0 && !processing) {
            processing = true;
            var item = queue.shift();
            var ok = false;
            try { ok = handleItem(item); } catch (e) { console.error('处理异常: ' + e); }
            if (ok) { stat.ok++; watchCooldown[item.name] = 0; } else stat.fail++;   // 成功清冷却; 失败保留防角标残留死循环
            processedOnce = true;
            processing = false;
            console.log('[统计] 收=' + stat.recv + ' 成功=' + stat.ok + ' 失败=' + stat.fail + ' 跳过=' + stat.skip);
            if (CFG.RUN_ONCE) {
                sleep(1000);
                console.log('__DONE__');
                exit();
            }
        } else if (CFG.RUN_ONCE && processedOnce && queue.length === 0) {
            console.log('__DONE__');
            exit();
        }
        sleep(400);
    }
});

// ★前台列表页守望者线程: processing 时静默 (不与处理链抢截屏/点击); 名单未录入前置空转
var watcher = threads.start(function () {
    sleep(2500);   // 等名单录入/通知监听就绪
    console.log('[守望] 前台列表页守望启动 (间隔 ' + CFG.WATCH_POLL_MS + 'ms)');
    while (true) {
        if (!processing && watchNames.length > 0) {
            try { watchTick(); } catch (e) { console.error('[守望] 异常: ' + e); }
        }
        sleep(CFG.WATCH_POLL_MS);
    }
});

/* ================= 主流程 ================= */

console.log('===== wxauto-B 启动 (B模式·全程Shizuku·统一高敏) =====');
// B 模式自检头 (§3C): shizuku 活性 fail-fast; 无障碍现状仅警示
if (!B.bSelfCheck()) { console.error('B 模式自检失败, 退出'); exit(); }

// ★启动配置表单 (1101: 单弹框升级为多字段表单——dialogs.build customView + ui.inflate + threads.disposable 官方阻塞桥接)
// 返回 {namesText, secText, dry, once, group} 或 null(取消); 布局加一行 XML + 读取加一行即扩展
function showConfigForm(stW) {
    // 预填: 双 key 优先, 兼容迁移旧单行 watch_cfg ('名单,秒数')
    var preNames = stW.get('watch_names');
    if (preNames == null) {
        var legacy = String(stW.get('watch_cfg') || '');
        var legacySec = (legacy.match(/(\d{1,2})\s*$/) || [])[1];
        if (legacySec) stW.put('watch_sec', legacySec);
        preNames = legacy.replace(/[,，、;；\s]*\d{1,2}\s*$/, '') || '静水流虚';
    }
    var formXml = '<vertical padding="16">'
        + '<text text="守望名单 (多人用逗号分隔)" textSize="14"/>'
        + '<input id="cfgNames" marginTop="4"/>'
        + '<text text="轮询秒数 (建议3~10, 默认5)" textSize="14" marginTop="12"/>'
        + '<input id="cfgSec" inputType="number" marginTop="4"/>'
        + '<checkbox id="cfgDry" text="DRY_RUN 只填入不发送 (验证用)" marginTop="12"/>'
        + '<checkbox id="cfgOnce" text="RUN_ONCE 处理一条后退出 (单次自测)" marginTop="6"/>'
        + '<checkbox id="cfgGroup" text="群聊消息也处理 (HANDLE_GROUP)" marginTop="6"/>'
        + '</vertical>';
    var view = ui.inflate(formXml);
    view.cfgNames.setText(String(preNames));
    view.cfgSec.setText(String(stW.get('watch_sec') || '5'));
    view.cfgDry.setChecked(stW.get('cfg_dry_run') == true);
    view.cfgOnce.setChecked(stW.get('cfg_run_once') == true);
    view.cfgGroup.setChecked(stW.get('cfg_group') == true);
    var disp = threads.disposable();
    var sent = false;
    dialogs.build({
        title: '守望配置',
        customView: view,
        positive: '确定',
        negative: '取消',
        cancelable: false,
        canceledOnTouchOutside: false
    }).on('positive', function () {
        if (sent) return;
        sent = true;
        disp.setAndNotify({
            namesText: String(view.cfgNames.getText() || ''),
            secText: String(view.cfgSec.getText() || ''),
            dry: view.cfgDry.isChecked(),
            once: view.cfgOnce.isChecked(),
            group: view.cfgGroup.isChecked()
        });
    }).on('negative', function () {
        if (sent) return;
        sent = true;
        disp.setAndNotify(null);
    }).on('cancel', function () {
        if (sent) return;
        sent = true;
        disp.setAndNotify(null);
    }).show();
    return disp.blockedGet();
}

// ★守望配置录入 (决策 1101: 表单全配置——名单/轮询秒数/DRY_RUN/RUN_ONCE/群聊; TEST_FLAG 自测时免交互)
var testFlagMode = files.exists(CFG.TEST_FLAG);
if (testFlagMode) {
    var testName = String(files.read(CFG.TEST_FLAG)).trim();
    if (!testName) { console.error('TEST_FLAG 内容为空, 退出'); exit(); }
    watchNames = [testName];
    console.log('[自测] TEST_FLAG 命中, 名单=[' + testName + '] 轮询=' + Math.round(CFG.WATCH_POLL_MS / 1000) + 's DRY_RUN=' + CFG.REPLY_DRY_RUN);
} else {
    var stW = storages.create('wxauto');
    var cfgForm = null;
    try { cfgForm = showConfigForm(stW); } catch (e) { console.error('配置表单异常: ' + e); }
    if (!cfgForm) { console.log('未录入配置(取消), 退出'); exit(); }
    var parts = String(cfgForm.namesText).split(/[,，、;；\s]+/);
    for (var pi = 0; pi < parts.length; pi++) if (parts[pi]) watchNames.push(parts[pi]);
    if (watchNames.length === 0) { console.error('守望名单为空, 退出'); exit(); }
    var sec = parseInt(cfgForm.secText, 10);
    if (isNaN(sec)) sec = 5;
    if (sec < 2) sec = 2;
    if (sec > 60) sec = 60;
    CFG.WATCH_POLL_MS = sec * 1000;
    CFG.REPLY_DRY_RUN = cfgForm.dry === true;
    CFG.RUN_ONCE = cfgForm.once === true;
    CFG.HANDLE_GROUP = cfgForm.group === true;
    stW.put('watch_names', watchNames.join(','));
    stW.put('watch_sec', String(sec));
    stW.put('cfg_dry_run', CFG.REPLY_DRY_RUN);
    stW.put('cfg_run_once', CFG.RUN_ONCE);
    stW.put('cfg_group', CFG.HANDLE_GROUP);
    console.log('[守望] 名单: ' + watchNames.join(', ') + ' | 轮询: ' + sec + 's | DRY_RUN=' + CFG.REPLY_DRY_RUN + ' RUN_ONCE=' + CFG.RUN_ONCE + ' 群聊=' + CFG.HANDLE_GROUP);
}

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

// 试点自测入口: TEST_FLAG 命中时模拟一条通知入队走全链路 (名单已在启动段读取)
if (testFlagMode) {
    console.log('[自测] 模拟通知, 好友="' + watchNames[0] + '" DRY_RUN=' + CFG.REPLY_DRY_RUN);
    queue.push({ name: watchNames[0], text: '(自测消息)', title: watchNames[0], group: false, raw: null });
}
toastLog('wxauto-B 监听中 (B模式): 单聊自动回复+列表页守望 (' + watchNames.join('/') + ' 轮询' + Math.round(CFG.WATCH_POLL_MS / 1000) + 's); RUN_ONCE=' + CFG.RUN_ONCE + ' DRY_RUN=' + CFG.REPLY_DRY_RUN + ' 群聊=' + CFG.HANDLE_GROUP);
