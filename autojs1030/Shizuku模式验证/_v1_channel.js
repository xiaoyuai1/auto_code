// _v1_channel.js — Shizuku 通道验证 (v1)
// 验证项: 1存在性 2活性+身份 3返回结构 4多行命令(数组/换行) 5耗时基线 6错误命令形态
// 铁律: 零 toast / report 模式 / 结尾 __DONE__
console.log("__START__");

function report(name, ok, detail) {
    console.log((ok ? "[PASS] " : "[FAIL] ") + name + " → " + detail);
}

try {
    // 1. 存在性
    let t1 = typeof shizuku;
    if (t1 !== "function") {
        report("1.shizuku全局函数存在", false, "typeof=" + t1 + " (检查抽屉 Shizuku 开关)");
        console.log("__DONE__");
    } else {
        report("1.shizuku全局函数存在", true, "typeof=" + t1);

        // 2. 活性 + 身份: id → uid=2000(shell)
        let r2 = shizuku("id");
        let d2 = "code=" + (r2 && r2.code) + " result=" + String(r2 && r2.result).trim() + " error=" + String(r2 && r2.error).trim();
        report("2.活性探测 id→uid=2000(shell)", !!(r2 && r2.code === 0 && String(r2.result).indexOf("uid=2000") >= 0), d2);

        // 3. 返回结构三字段
        let ok3 = !!(r2 && typeof r2.code === "number" && typeof r2.result === "string" && typeof r2.error === "string");
        report("3.返回结构 code/result/error", ok3, d2);

        // 4. 多行命令: 数组 与 \n 两种形态
        let r4a = shizuku(["echo line1", "echo line2"]);
        let ok4a = !!(r4a && r4a.code === 0 && String(r4a.result).indexOf("line1") >= 0 && String(r4a.result).indexOf("line2") >= 0);
        report("4a.多行命令-数组", ok4a, "result=" + String(r4a && r4a.result).trim().replace(/\n/g, "|"));
        let r4b = shizuku("echo m1\necho m2");
        let ok4b = !!(r4b && r4b.code === 0 && String(r4b.result).indexOf("m1") >= 0 && String(r4b.result).indexOf("m2") >= 0);
        report("4b.多行命令-\\n", ok4b, "result=" + String(r4b && r4b.result).trim().replace(/\n/g, "|"));

        // 5. 耗时基线: date 命令 5 次
        let times = [];
        let dateSample = "";
        for (let i = 0; i < 5; i++) {
            let t0 = Date.now();
            let rd = shizuku("date");
            times.push(Date.now() - t0);
            if (i === 0) dateSample = String(rd && rd.result).trim();
        }
        let avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
        report("5.耗时基线(5次均值)", avg < 2000, times.join(",") + "ms 均值=" + avg + "ms date=" + dateSample);

        // 6. 错误命令返回形态 (fail-fast 判定依据)
        let r6 = shizuku("cmd_not_exist_xyz_123");
        let d6 = "code=" + (r6 && r6.code) + " error=" + String(r6 && r6.error).trim().slice(0, 100);
        report("6.错误命令返回形态可判", !!(r6 && typeof r6.code === "number" && r6.code !== 0), d6);
    }
} catch (e) {
    console.error("全局异常: " + e.message + " | " + e.stack);
    report("通道异常", false, e.message);
}

console.log("__DONE__");
