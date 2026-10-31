// 学際 予算・売上計算アプリ 網羅テスト
// 使い方: node test/run-tests.js <テスト対象のHTMLファイル>
// jsdom でブラウザ動作を再現し、バリデータ・計算・DOM操作・永続化・耐障害性を検証する。

const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs");
const path = require("path");

const target = process.argv[2];
if (!target) {
  console.error("使い方: node test/run-tests.js <HTMLファイル>");
  process.exit(2);
}
const html = fs.readFileSync(path.resolve(target), "utf8");
const STORAGE_KEY = "festivalBudgetApp_v2";

// ---------- 簡易テストフレームワーク ----------
const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, msg: e && e.message ? e.message : String(e) });
  }
}
function eq(actual, expected, label = "") {
  if (actual !== expected) {
    throw new Error(`${label} 期待値=${JSON.stringify(expected)} 実際=${JSON.stringify(actual)}`);
  }
}
function ok(cond, label = "") {
  if (!cond) throw new Error(label || "条件が満たされていません");
}

// ---------- ブラウザ起動ヘルパー ----------
function boot({ storage = null, getItemThrows = false, setItemThrows = false } = {}) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(e));
  const dom = new JSDOM(html, {
    url: "http://localhost/",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      window.__printed = 0;
      window.print = () => { window.__printed++; };
      if (storage) {
        for (const [k, v] of Object.entries(storage)) window.localStorage.setItem(k, v);
      }
      if (getItemThrows) window.Storage.prototype.getItem = () => { throw new Error("getItem失敗"); };
      if (setItemThrows) window.Storage.prototype.setItem = () => { throw new Error("quota"); };
    },
  });
  const w = dom.window;
  w.__errors = errors;
  return w;
}
const el = (w, id) => w.document.getElementById(id);
const txt = (w, id) => el(w, id).textContent.trim();
function setVal(w, id, v) {
  const e = el(w, id);
  e.value = v;
  e.dispatchEvent(new w.Event("input", { bubbles: true }));
}
const rows = (w) => [...w.document.querySelectorAll("#ingredientRows tr")];
function setRow(w, i, { name, qty, unit, price }) {
  const inp = rows(w)[i].querySelectorAll("input");
  const vals = [name, qty, unit, price];
  vals.forEach((v, k) => {
    if (v === undefined) return;
    inp[k].value = v;
    inp[k].dispatchEvent(new w.Event("input", { bubbles: true }));
  });
}
const rowErrs = (w, i) => [...rows(w)[i].querySelectorAll(".field-error")].map((d) => d.textContent);
const rowHasError = (w, i) => [...rows(w)[i].querySelectorAll("input")].map((x) => x.classList.contains("has-error"));
const click = (w, id) => el(w, id).click();
const SAMPLE_FIELDS = { price: "300", cups: "120", ml: "150", hours: "6", other: "0", waste: "10", available: "15000" };
function fill(w, o) { for (const [k, v] of Object.entries(o)) setVal(w, k, v); }
function sampleApp() { const w = boot(); click(w, "sample"); return w; }
const RESULT_IDS = ["materialTotal", "budget", "revenue", "profit", "costPerCup", "breakEven", "perHour", "totalVolume", "margin"];

// =====================================================================
// 1. バリデータ単体テスト
// =====================================================================
{
  const w = boot();
  const V = w.eval("Validators");

  test("strictInt: 正常値(0, 1, 最大値)", () => {
    eq(V.strictInt("0", 0), null);
    eq(V.strictInt("1", 1), null);
    eq(V.strictInt("100000", 1, 100000), null);
    eq(V.strictInt("123456789"), null);
  });
  test("strictInt: 未入力(空文字/null/undefined)", () => {
    ok(V.strictInt("").includes("未入力"));
    ok(V.strictInt(null).includes("未入力"));
    ok(V.strictInt(undefined).includes("未入力"));
  });
  test("strictInt: 空白(半角/全角/タブ/改行/前後/途中)", () => {
    for (const s of [" 1", "1 ", "1 2", "\t1", "1\n", "　1", "1　"]) {
      ok(V.strictInt(s) && V.strictInt(s).includes("空白"), `空白 ${JSON.stringify(s)}`);
    }
  });
  test("strictInt: 形式不正(先頭ゼロ/小数/全角/符号/指数/16進/文字/カンマ)", () => {
    for (const s of ["01", "00", "1.5", "1.", ".5", "１２", "-1", "+1", "1e3", "0x10", "abc", "1,000", "¥100", "100円", "Infinity", "NaN", "-0"]) {
      ok(V.strictInt(s) && V.strictInt(s).includes("半角の整数"), `形式 ${JSON.stringify(s)}`);
    }
  });
  test("strictInt: 範囲境界(min-1 / min / max / max+1)", () => {
    ok(V.strictInt("0", 1).includes("1 以上"));
    eq(V.strictInt("1", 1), null);
    eq(V.strictInt("100", 1, 100), null);
    ok(V.strictInt("101", 1, 100).includes("100 以下"));
    ok(V.strictInt("99999999999999999999", 0, 1000).includes("以下"));
  });
  test("strictPositiveFloat: 正常値", () => {
    for (const s of ["1", "0.5", "10.25", "0.0001", "100", "0.123456"]) eq(V.strictPositiveFloat(s), null, s);
  });
  test("strictPositiveFloat: 未入力・空白・形式不正", () => {
    ok(V.strictPositiveFloat("").includes("未入力"));
    ok(V.strictPositiveFloat(null).includes("未入力"));
    ok(V.strictPositiveFloat(" 1").includes("空白"));
    for (const s of ["1.", ".5", "00.5", "01", "1.5.2", "1,5", "-1", "１.５", "1e2", "abc", "+1"]) {
      ok(V.strictPositiveFloat(s) && V.strictPositiveFloat(s).includes("半角の正数"), s);
    }
  });
  test("strictPositiveFloat: 範囲境界", () => {
    ok(V.strictPositiveFloat("0").includes("以上"));
    ok(V.strictPositiveFloat("0.00009").includes("以上"));
    eq(V.strictPositiveFloat("0.1", 0.1, 168), null);
    ok(V.strictPositiveFloat("0.09", 0.1, 168).includes("0.1 以上"));
    eq(V.strictPositiveFloat("168", 0.1, 168), null);
    ok(V.strictPositiveFloat("168.01", 0.1, 168).includes("168 以下"));
  });
  test("strictPercentage: 正常値(0/100/小数2桁)", () => {
    for (const s of ["0", "100", "100.00", "0.00", "5.5", "12.25", "99.99"]) eq(V.strictPercentage(s), null, s);
  });
  test("strictPercentage: 不正値", () => {
    ok(V.strictPercentage("").includes("未入力"));
    ok(V.strictPercentage(" 5").includes("空白"));
    for (const s of ["5.123", "5.", ".5", "-1", "１０", "10%", "05", "abc"]) ok(V.strictPercentage(s), s);
    ok(V.strictPercentage("100.01").includes("100"));
    ok(V.strictPercentage("101").includes("100"));
  });
  test("strictText: 正常値と境界(最大長ちょうど)", () => {
    eq(V.strictText("豚肉", 40), null);
    eq(V.strictText("あ".repeat(40), 40), null);
    eq(V.strictText(" 先頭空白は許容 ", 40), null);
  });
  test("strictText: 空欄・空白のみ・長すぎ", () => {
    for (const s of ["", "   ", "　", "\t", null, undefined]) ok(V.strictText(s) && V.strictText(s).includes("空欄"), JSON.stringify(s));
    ok(V.strictText("あ".repeat(41), 40).includes("40文字以内"));
    ok(V.strictText("a".repeat(31)).includes("30文字以内"));
  });
  test("escapeHtml: 特殊文字5種と非文字列", () => {
    const esc = w.eval("escapeHtml");
    eq(esc(`<a href="x" onclick='y'>&</a>`), "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
    eq(esc(5), "5");
    eq(esc(""), "");
  });
  test("yen: 通常・四捨五入・NaN/Infinity・-0", () => {
    const yen = w.eval("yen");
    eq(yen(0), "¥0");
    eq(yen(1234.5), "¥1,235");
    eq(yen(1234.4), "¥1,234");
    eq(yen(1000000), "¥1,000,000");
    eq(yen(NaN), "¥0");
    eq(yen(Infinity), "¥0");
    eq(yen(-0.4), "¥0", "-0が「¥-0」と表示されない");
  });
}

// =====================================================================
// 2. 初期表示
// =====================================================================
test("初期表示(保存なし): 材料4行・スクリプトエラーなし", () => {
  const w = boot();
  eq(w.__errors.length, 0, "jsdomError");
  eq(rows(w).length, 4);
  eq(rows(w)[0].querySelectorAll("input")[0].value, "豚肉");
});
test("初期表示(保存なし): 販売条件が空欄なのでエラー表示になる(現仕様の確認)", () => {
  const w = boot();
  eq(el(w, "globalErrorBanner").style.display, "block");
  eq(el(w, "printBtn").disabled, true);
  for (const id of RESULT_IDS) eq(txt(w, id), "エラー", id);
  eq(el(w, "difference").value, "エラー");
});
test("全てのID参照が実在する(スクリプト内 $(\"..\") と err-*)", () => {
  const w = boot();
  const ids = new Set([...html.matchAll(/\$\("([^"]+)"\)/g)].map((m) => m[1]).filter((s) => s !== "err-"));
  for (const id of ids) ok(el(w, id), `id=${id} が存在しない`);
  for (const id of Object.keys(SAMPLE_FIELDS)) ok(el(w, "err-" + id), `err-${id} が存在しない`);
});
test("label の for と input の id が対応している", () => {
  const w = boot();
  for (const l of w.document.querySelectorAll("label[for]")) ok(el(w, l.getAttribute("for")), l.getAttribute("for"));
});

// =====================================================================
// 3. サンプル値での計算結果(全出力項目)
// =====================================================================
test("サンプル: 全ての計算結果が手計算と一致", () => {
  const w = sampleApp();
  eq(el(w, "globalErrorBanner").style.display, "none");
  eq(el(w, "printBtn").disabled, false);
  eq(txt(w, "materialTotal"), "¥10,100", "材料費合計");
  eq(txt(w, "budget"), "¥11,110", "必要予算");
  eq(txt(w, "revenue"), "¥36,000", "売上");
  eq(txt(w, "profit"), "¥24,890", "利益");
  eq(txt(w, "costPerCup"), "¥93", "1杯原価");
  eq(txt(w, "breakEven"), "38杯", "損益分岐点");
  eq(txt(w, "perHour"), "20杯／時間", "販売ペース");
  eq(txt(w, "totalVolume"), "19.8 L", "必要総量");
  eq(txt(w, "margin"), "69.1%", "利益率");
  eq(el(w, "difference").value, "+3,890", "差額");
  eq(txt(w, "budgetMessage"), "予算内です。必要予算に対して ¥3,890 の余裕があります。");
});
test("サンプル: 各行の小計表示", () => {
  const w = sampleApp();
  const subs = rows(w).map((tr) => tr.querySelector(".subtotal").textContent);
  eq(JSON.stringify(subs), JSON.stringify(["¥3,600", "¥3,500", "¥1,200", "¥1,800"]));
});
test("利益が黒字なら緑、赤字なら赤で表示", () => {
  const w = sampleApp();
  const green = w.getComputedStyle(el(w, "profit")).color;
  setVal(w, "price", "50");
  const red = w.getComputedStyle(el(w, "profit")).color;
  ok(green !== red, "色が切り替わる");
  eq(el(w, "profit").style.color, "rgb(180, 35, 24)", "赤字は #b42318");
  setVal(w, "price", "300");
  eq(el(w, "profit").style.color, "rgb(23, 99, 58)", "黒字は #17633a");
});
test("赤字: 利益・利益率・損益分岐点", () => {
  const w = sampleApp();
  setVal(w, "price", "50");
  eq(txt(w, "revenue"), "¥6,000");
  // 6,000 − 11,110 = −5,110(負号の位置は現仕様の「¥-5,110」でも「-¥5,110」でも許容)
  ok(txt(w, "profit").includes("5,110") && txt(w, "profit").includes("-"), "利益: " + txt(w, "profit"));
  eq(txt(w, "breakEven"), "223杯");
  eq(txt(w, "margin"), "-85.2%");
});
test("予算超過: 差額と警告メッセージ", () => {
  const w = sampleApp();
  setVal(w, "available", "100");
  eq(el(w, "difference").value, "−11,010");
  eq(txt(w, "budgetMessage"), "予算を ¥11,010 超えています。材料・数量・その他費用を見直してください。");
});
test("予算ちょうど(整数コスト): 予算内・差額+0", () => {
  const w = sampleApp();
  fill(w, { waste: "0", other: "0", available: "10100" });
  eq(txt(w, "budget"), "¥10,100");
  eq(el(w, "difference").value, "+0");
  ok(txt(w, "budgetMessage").startsWith("予算内です"));
});
test("円未満の端数: 差額は円単位に丸めて判定・表示が一致(11111.1円に対し予算11111円→余裕¥0、11110円→¥1超過)", () => {
  const w = sampleApp();
  setRow(w, 0, { name: "A", qty: "1", unit: "式", price: "10101" });
  while (rows(w).length > 1) rows(w)[rows(w).length - 1].querySelector(".remove").click();
  fill(w, { waste: "10", other: "0", available: "11111" });
  eq(txt(w, "budget"), "¥11,111");
  eq(el(w, "difference").value, "+0");
  eq(txt(w, "budgetMessage"), "予算内です。必要予算に対して ¥0 の余裕があります。");
  setVal(w, "available", "11110");
  eq(el(w, "difference").value, "−1");
  eq(txt(w, "budgetMessage"), "予算を ¥1 超えています。材料・数量・その他費用を見直してください。");
});
test("浮動小数誤差: 材料10000円・ロス10%・予算11000円ぴったりは「予算内」", () => {
  const w = sampleApp();
  setRow(w, 0, { name: "A", qty: "1", unit: "式", price: "10000" });
  click(w, "addRow"); // 余計な行が増えるので削除して1行にする
  while (rows(w).length > 1) rows(w)[rows(w).length - 1].querySelector(".remove").click();
  fill(w, { waste: "10", other: "0", available: "11000" });
  eq(txt(w, "budget"), "¥11,000");
  eq(el(w, "difference").value, "+0", "差額表示");
  ok(txt(w, "budgetMessage").startsWith("予算内です"), "メッセージ: " + txt(w, "budgetMessage"));
});
test("浮動小数誤差: 損益分岐点が割り切れる場合に1杯多くならない(11000/1000=11杯)", () => {
  const w = sampleApp();
  setRow(w, 0, { name: "A", qty: "1", unit: "式", price: "10000" });
  while (rows(w).length > 1) rows(w)[rows(w).length - 1].querySelector(".remove").click();
  fill(w, { waste: "10", other: "0", price: "1000", cups: "100" });
  eq(txt(w, "breakEven"), "11杯");
});
test("端数: 損益分岐点は切り上げ(37.03→38)", () => {
  const w = sampleApp();
  eq(txt(w, "breakEven"), "38杯");
});
test("ロス率0%/100%の計算", () => {
  const w = sampleApp();
  setVal(w, "waste", "0");
  eq(txt(w, "budget"), "¥10,100");
  eq(txt(w, "totalVolume"), "18 L");
  setVal(w, "waste", "100");
  eq(txt(w, "budget"), "¥20,200");
  eq(txt(w, "totalVolume"), "36 L");
});
test("その他費用が必要予算に加算される", () => {
  const w = sampleApp();
  setVal(w, "other", "1000");
  eq(txt(w, "budget"), "¥12,110");
});
test("販売ペース: 割り切れない場合は小数1桁", () => {
  const w = sampleApp();
  setVal(w, "hours", "7");
  eq(txt(w, "perHour"), "17.1杯／時間");
  setVal(w, "hours", "0.1");
  eq(txt(w, "perHour"), "1,200杯／時間");
});
test("桁区切り: 大きな値", () => {
  const w = sampleApp();
  fill(w, { price: "100000", cups: "1000000" });
  eq(txt(w, "revenue"), "¥100,000,000,000");
});
test("結果は入力ごとに再計算される(冪等)", () => {
  const w = sampleApp();
  const snap = () => RESULT_IDS.map((i) => txt(w, i)).join("|");
  const a = snap();
  setVal(w, "cups", "120");
  eq(snap(), a);
  setVal(w, "cups", "240");
  ok(snap() !== a);
  setVal(w, "cups", "120");
  eq(snap(), a);
});

// =====================================================================
// 4. 販売条件の入力検証(各フィールド × 境界値)
// =====================================================================
const FIELD_BOUNDS = {
  price:     { okVals: ["1", "300", "100000"],           ngVals: ["", "0", "100001", "300.5", "３００", " 300", "abc", "-1", "0300"] },
  cups:      { okVals: ["1", "120", "1000000"],           ngVals: ["", "0", "1000001", "1.5", "１２０", "12 0", "-5"] },
  ml:        { okVals: ["1", "150", "150.5", "10000"],    ngVals: ["", "0", "0.9", "10000.1", "150mL", "1,5", ".5", "１５０"] },
  hours:     { okVals: ["0.1", "6", "168"],               ngVals: ["", "0", "0.09", "168.1", "6時間", "-1", "６"] },
  other:     { okVals: ["0", "500", "100000000"],         ngVals: ["", "100000001", "-1", "1.5", "00", "５００"] },
  waste:     { okVals: ["0", "10", "10.5", "100", "100.00"], ngVals: ["", "100.01", "101", "-1", "10.555", "10%", "１０"] },
  available: { okVals: ["0", "15000", "100000000"],       ngVals: ["", "100000001", "-1", "1.5", "１５０００", " 15000"] },
};
for (const [id, { okVals, ngVals }] of Object.entries(FIELD_BOUNDS)) {
  test(`${id}: 有効値は受理され、赤枠/エラー文が出ない`, () => {
    for (const v of okVals) {
      const w = sampleApp();
      setVal(w, id, v);
      eq(el(w, id).classList.contains("has-error"), false, `${id}=${JSON.stringify(v)} has-error`);
      eq(txt(w, "err-" + id), "", `${id}=${JSON.stringify(v)} エラー文`);
      eq(el(w, "globalErrorBanner").style.display, "none", `${id}=${JSON.stringify(v)} バナー`);
    }
  });
  test(`${id}: 無効値は拒否され、赤枠・エラー文・全結果「エラー」・印刷無効`, () => {
    for (const v of ngVals) {
      const w = sampleApp();
      setVal(w, id, v);
      eq(el(w, id).classList.contains("has-error"), true, `${id}=${JSON.stringify(v)} has-error`);
      ok(txt(w, "err-" + id).length > 0, `${id}=${JSON.stringify(v)} エラー文が空`);
      eq(el(w, "globalErrorBanner").style.display, "block", `${id}=${JSON.stringify(v)} バナー`);
      eq(el(w, "printBtn").disabled, true, `${id}=${JSON.stringify(v)} 印刷`);
      for (const r of RESULT_IDS) eq(txt(w, r), "エラー", `${id}=${JSON.stringify(v)} ${r}`);
      eq(el(w, "difference").value, "エラー");
      ok(txt(w, "budgetMessage").includes("エラー"), "メッセージ");
    }
  });
}
test("複数フィールドが同時に不正でも、それぞれ独立してエラーが出る", () => {
  const w = sampleApp();
  fill(w, { price: "x", cups: "y", waste: "z" });
  for (const id of ["price", "cups", "waste"]) ok(txt(w, "err-" + id).length > 0, id);
  for (const id of ["ml", "hours", "other", "available"]) eq(txt(w, "err-" + id), "", id);
});
test("エラー修正後は結果とバナーが復帰する", () => {
  const w = sampleApp();
  setVal(w, "price", "abc");
  eq(txt(w, "profit"), "エラー");
  setVal(w, "price", "300");
  eq(el(w, "globalErrorBanner").style.display, "none");
  eq(el(w, "printBtn").disabled, false);
  eq(txt(w, "profit"), "¥24,890");
  eq(el(w, "price").classList.contains("has-error"), false);
});
test("エラーメッセージ文面(price)", () => {
  const w = sampleApp();
  setVal(w, "price", "");
  eq(txt(w, "err-price"), "未入力です。数値を入力してください。");
  setVal(w, "price", "300.5");
  eq(txt(w, "err-price"), "半角の整数のみ入力可能です（小数・全角・記号不可）。");
  setVal(w, "price", "100001");
  eq(txt(w, "err-price"), "100000 以下の数値を入力してください。");
});

// =====================================================================
// 5. 材料行の操作・検証
// =====================================================================
test("材料を追加: 初期値(数量1/単位個/単価0)で材料名のみエラー", () => {
  const w = sampleApp();
  click(w, "addRow");
  eq(rows(w).length, 5);
  const inp = rows(w)[4].querySelectorAll("input");
  eq(inp[1].value, "1"); eq(inp[2].value, "個"); eq(inp[3].value, "0");
  eq(JSON.stringify(rowHasError(w, 4)), JSON.stringify([true, false, false, false]));
  eq(rowErrs(w, 4)[0], "空欄にすることはできません。");
  eq(rows(w)[4].querySelector(".subtotal").textContent, "エラー");
  eq(el(w, "globalErrorBanner").style.display, "block");
});
test("追加した行に材料名を入れると計算が復帰し、単価0なら小計¥0", () => {
  const w = sampleApp();
  click(w, "addRow");
  setRow(w, 4, { name: "氷" });
  eq(rows(w)[4].querySelector(".subtotal").textContent, "¥0");
  eq(el(w, "globalErrorBanner").style.display, "none");
  eq(txt(w, "materialTotal"), "¥10,100");
});
test("材料を削除: 合計から差し引かれる", () => {
  const w = sampleApp();
  rows(w)[0].querySelector(".remove").click();
  eq(rows(w).length, 3);
  eq(txt(w, "materialTotal"), "¥6,500");
});
test("エラー行を削除するとエラーが解消する", () => {
  const w = sampleApp();
  click(w, "addRow");
  eq(el(w, "globalErrorBanner").style.display, "block");
  rows(w)[4].querySelector(".remove").click();
  eq(el(w, "globalErrorBanner").style.display, "none");
});
test("材料を全て削除: 表のエラー表示・全結果エラー", () => {
  const w = sampleApp();
  while (rows(w).length) rows(w)[0].querySelector(".remove").click();
  eq(txt(w, "err-table"), "材料・品目を最低1件以上追加してください。");
  eq(el(w, "globalErrorBanner").style.display, "block");
  eq(txt(w, "materialTotal"), "エラー");
  click(w, "addRow");
  eq(txt(w, "err-table"), "");
});
const ROW_CASES = [
  // [項目index, 値, 有効?]
  [0, "あ".repeat(40), true], [0, "あ".repeat(41), false], [0, "", false], [0, "   ", false], [0, "　", false],
  [1, "0.001", true], [1, "0.0009", false], [1, "100000", true], [1, "100000.1", false], [1, "0", false],
  [1, "-1", false], [1, "1,5", false], [1, "１", false], [1, " 1", false], [1, "", false], [1, "1e2", false],
  [2, "x".repeat(10), true], [2, "x".repeat(11), false], [2, "", false], [2, "  ", false],
  [3, "0", true], [3, "10000000", true], [3, "10000001", false], [3, "1.5", false], [3, "", false],
  [3, "-1", false], [3, "０", false], [3, "01", false], [3, "1 0", false],
];
const ROW_FIELDS = ["name", "qty", "unit", "price"];
test("材料行: 各項目の境界値(名前40字/単位10字/数量0.001〜100000/単価0〜10000000)", () => {
  for (const [idx, val, valid] of ROW_CASES) {
    const w = sampleApp();
    setRow(w, 0, { [ROW_FIELDS[idx]]: val });
    const flags = rowHasError(w, 0);
    eq(flags[idx], !valid, `${ROW_FIELDS[idx]}=${JSON.stringify(val)} has-error`);
    eq(rowErrs(w, 0)[idx].length > 0, !valid, `${ROW_FIELDS[idx]}=${JSON.stringify(val)} エラー文`);
    eq(rows(w)[0].querySelector(".subtotal").textContent === "エラー", !valid, `${ROW_FIELDS[idx]}=${JSON.stringify(val)} 小計`);
    eq(el(w, "globalErrorBanner").style.display, valid ? "none" : "block", `${ROW_FIELDS[idx]}=${JSON.stringify(val)} バナー`);
  }
});
test("材料行: 小数数量の小計と合計(2.5×1000, 0.1×3, 前後空白つき名前はtrim)", () => {
  const w = sampleApp();
  setRow(w, 0, { name: "  水  ", qty: "2.5", price: "1000" });
  eq(rows(w)[0].querySelector(".subtotal").textContent, "¥2,500");
  setRow(w, 1, { qty: "0.1", price: "3" });
  eq(rows(w)[1].querySelector(".subtotal").textContent, "¥0");
  eq(txt(w, "materialTotal"), "¥" + Math.round(2500 + 0.1 * 3 + 1200 + 1800).toLocaleString("ja-JP"));
});
test("材料行: 複数行が同時にエラーでも各行・各セルに個別表示", () => {
  const w = sampleApp();
  setRow(w, 0, { name: "" });
  setRow(w, 2, { qty: "abc", price: "x" });
  eq(JSON.stringify(rowHasError(w, 0)), JSON.stringify([true, false, false, false]));
  eq(JSON.stringify(rowHasError(w, 2)), JSON.stringify([false, true, false, true]));
  eq(JSON.stringify(rowHasError(w, 1)), JSON.stringify([false, false, false, false]));
});
test("極端値: 数量100000×単価10000000でも表示が崩れない", () => {
  const w = sampleApp();
  setRow(w, 0, { qty: "100000", price: "10000000" });
  eq(rows(w)[0].querySelector(".subtotal").textContent, "¥1,000,000,000,000");
  eq(el(w, "globalErrorBanner").style.display, "none");
});

// =====================================================================
// 6. ボタン動作
// =====================================================================
test("サンプルに戻す: 値・行・エラー状態が初期化される", () => {
  const w = sampleApp();
  fill(w, { price: "abc", cups: "5" });
  setRow(w, 0, { name: "" });
  click(w, "addRow");
  click(w, "sample");
  eq(rows(w).length, 4);
  for (const [k, v] of Object.entries(SAMPLE_FIELDS)) eq(el(w, k).value, v, k);
  eq(el(w, "globalErrorBanner").style.display, "none");
  eq(txt(w, "profit"), "¥24,890");
  eq(el(w, "price").classList.contains("has-error"), false);
});
test("印刷ボタン: 正常時のみ window.print が呼ばれる", () => {
  const w = sampleApp();
  click(w, "printBtn");
  eq(w.__printed, 1);
  setVal(w, "price", "x");
  click(w, "printBtn");
  eq(w.__printed, 1, "エラー中は呼ばれない");
  setVal(w, "price", "300");
  click(w, "printBtn");
  eq(w.__printed, 2);
});

// =====================================================================
// 7. localStorage 永続化と耐障害性
// =====================================================================
test("正常入力のたびに保存される(fields/items)", () => {
  const w = sampleApp();
  setVal(w, "cups", "77");
  const saved = JSON.parse(w.localStorage.getItem(STORAGE_KEY));
  eq(saved.fields.cups, "77");
  eq(saved.items.length, 4);
  eq(saved.items[0].name, "豚肉");
});
test("エラー状態では保存されず、最後の正常状態が残る", () => {
  const w = sampleApp();
  setVal(w, "cups", "77");
  setVal(w, "cups", "abc");
  eq(JSON.parse(w.localStorage.getItem(STORAGE_KEY)).fields.cups, "77");
});
test("保存データの復元(往復)", () => {
  const a = sampleApp();
  fill(a, { cups: "77", price: "250" });
  setRow(a, 1, { name: "キャベツ", qty: "2.5", unit: "玉", price: "180" });
  const b = boot({ storage: { [STORAGE_KEY]: a.localStorage.getItem(STORAGE_KEY) } });
  eq(el(b, "cups").value, "77");
  eq(el(b, "price").value, "250");
  eq(rows(b)[1].querySelectorAll("input")[0].value, "キャベツ");
  eq(txt(b, "revenue"), "¥" + (77 * 250).toLocaleString("ja-JP"));
  eq(b.__errors.length, 0);
});
test("XSS: 保存された材料名のHTMLは要素化されず文字列として復元", () => {
  const evil = `"><img src=x id=pwn onerror="window.__xss=1"><script>window.__xss=2</script>`;
  const saved = JSON.stringify({ fields: SAMPLE_FIELDS, items: [{ name: evil, qty: "1", unit: "個", price: "1" }] });
  const w = boot({ storage: { [STORAGE_KEY]: saved } });
  eq(el(w, "pwn"), null, "img要素が生成された");
  eq(w.__xss, undefined, "スクリプト実行された");
  eq(rows(w)[0].querySelectorAll("input")[0].value, evil);
});
test("XSS: 単位・数量・単価に引用符を含んでも属性が壊れない", () => {
  const saved = JSON.stringify({ fields: SAMPLE_FIELDS, items: [{ name: "a", qty: `1" id="pwn2`, unit: `'x"`, price: `1" data-x="1` }] });
  const w = boot({ storage: { [STORAGE_KEY]: saved } });
  eq(el(w, "pwn2"), null);
  eq(rows(w)[0].querySelectorAll("input")[1].value, `1" id="pwn2`);
});
test("破損JSON: 例外にならず初期材料で起動", () => {
  const w = boot({ storage: { [STORAGE_KEY]: "{not json" } });
  eq(w.__errors.length, 0);
  eq(rows(w).length, 4);
});
test("保存データが {} / null / 配列 / 文字列 でも起動できる", () => {
  for (const s of ["{}", "null", "[]", '"abc"', "123", "true"]) {
    const w = boot({ storage: { [STORAGE_KEY]: s } });
    eq(w.__errors.length, 0, s);
    eq(rows(w).length, 4, s);
  }
});
test("items が空配列なら初期材料にフォールバック", () => {
  const w = boot({ storage: { [STORAGE_KEY]: JSON.stringify({ fields: SAMPLE_FIELDS, items: [] }) } });
  eq(rows(w).length, 4);
});
test("items が配列でない(文字列/オブジェクト/数値)でもクラッシュしない", () => {
  for (const items of ["abc", { a: 1 }, 5, true]) {
    const w = boot({ storage: { [STORAGE_KEY]: JSON.stringify({ fields: SAMPLE_FIELDS, items }) } });
    eq(w.__errors.length, 0, JSON.stringify(items));
    ok(rows(w).length > 0, "行が描画される: " + JSON.stringify(items));
  }
});
test("items に null/数値/文字列が混ざってもクラッシュしない", () => {
  const w = boot({ storage: { [STORAGE_KEY]: JSON.stringify({ fields: SAMPLE_FIELDS, items: [null, 5, "x", { name: "ok", qty: "1", unit: "個", price: "1" }] }) } });
  eq(w.__errors.length, 0);
  ok(rows(w).length > 0);
});
test("items の項目欠落で「undefined」という文字が表示されない", () => {
  const w = boot({ storage: { [STORAGE_KEY]: JSON.stringify({ fields: SAMPLE_FIELDS, items: [{ qty: "1" }] }) } });
  for (const i of rows(w)[0].querySelectorAll("input")) ok(!/undefined|null/.test(i.value), "値=" + i.value);
});
test("fields に未知のキーや非文字列値があってもクラッシュしない", () => {
  const w = boot({ storage: { [STORAGE_KEY]: JSON.stringify({ fields: { ...SAMPLE_FIELDS, nonexistent: "x", cups: 99, ml: null }, items: [{ name: "a", qty: "1", unit: "個", price: "1" }] }) } });
  eq(w.__errors.length, 0);
  eq(el(w, "cups").value, "99");
});
test("fields が文字列/配列/null でもクラッシュしない", () => {
  for (const f of ["abc", [1, 2], null, 5]) {
    const w = boot({ storage: { [STORAGE_KEY]: JSON.stringify({ fields: f, items: [{ name: "a", qty: "1", unit: "個", price: "1" }] }) } });
    eq(w.__errors.length, 0, JSON.stringify(f));
    ok(rows(w).length > 0);
  }
});
test("localStorage.getItem が例外を投げても起動できる", () => {
  const w = boot({ getItemThrows: true });
  eq(w.__errors.length, 0);
  eq(rows(w).length, 4);
});
test("localStorage.setItem が例外(容量超過等)でも計算は継続", () => {
  const w = boot({ setItemThrows: true });
  click(w, "sample");
  eq(w.__errors.length, 0);
  eq(txt(w, "profit"), "¥24,890");
  setVal(w, "cups", "130");
  eq(txt(w, "revenue"), "¥39,000");
});

// =====================================================================
// 8. 厳密オラクルとのランダム照合(BigIntによる誤差なしの計算と比較)
// =====================================================================
{
  let seed = 20261029;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const scaled = (s, scale) => { const [i, f = ""] = s.split("."); return BigInt(i + f.padEnd(scale, "0")); };
  const QTY = ["1", "2", "3", "0.5", "1.5", "2.25", "0.125", "10", "120"];
  const PRICE = ["10", "100", "250", "500", "1200", "3500", "15", "10000"];
  const WASTE = ["0", "5", "10", "12.5", "7.25", "15", "20", "100", "0.5"];
  const OTHER = ["0", "100", "500", "1000", "250"];
  const SELL = ["50", "100", "200", "250", "300", "500", "1000", "120"];
  const CUPS = ["1", "10", "50", "100", "120", "333", "1000"];
  const w = sampleApp();
  const failures = [];
  const N = 400;
  for (let n = 0; n < N; n++) {
    const items = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => ({ qty: pick(QTY), price: pick(PRICE) }));
    const waste = pick(WASTE), other = pick(OTHER), sell = pick(SELL), cups = pick(CUPS);
    // 厳密コスト(スケール 10^7)
    const materialS = items.reduce((a, it) => a + scaled(it.qty, 3) * BigInt(it.price), 0n);
    const costS = materialS * (10000n + scaled(waste, 2)) + BigInt(other) * 10000000n;
    const costFloor = costS / 10000000n;
    const exactInt = costS % 10000000n === 0n;
    const avail = pick([exactInt ? costFloor : costFloor + 1n, costFloor, costFloor + 1n, costFloor > 0n ? costFloor - 1n : 0n]);
    // 画面に設定
    while (rows(w).length < items.length) click(w, "addRow");
    while (rows(w).length > items.length) rows(w)[rows(w).length - 1].querySelector(".remove").click();
    items.forEach((it, i) => setRow(w, i, { name: "m" + i, qty: it.qty, unit: "g", price: it.price }));
    fill(w, { waste, other, price: sell, cups, available: String(avail) });
    const label = JSON.stringify({ items, waste, other, sell, cups, avail: String(avail) });
    // 損益分岐点 = ceil(cost / price)
    const denom = BigInt(sell) * 10000000n;
    const expBE = (costS + denom - 1n) / denom;
    const gotBE = txt(w, "breakEven");
    if (gotBE !== Number(expBE).toLocaleString("ja-JP") + "杯") failures.push(`損益分岐点 ${label} 期待=${expBE}杯 実際=${gotBE}`);
    // 予算判定
    const diffS = avail * 10000000n - costS;
    const msg = txt(w, "budgetMessage");
    if (diffS >= 0n && !msg.startsWith("予算内")) failures.push(`予算内のはずが超過表示 ${label} → ${msg}`);
    // 不足が0.5円ちょうどの場合は「円単位に丸めた表示」と判定を一致させる仕様のため対象外(0.5円超の不足のみ検証)
    if (diffS < -5000000n && !msg.startsWith("予算を")) failures.push(`超過のはずが予算内表示 ${label} → ${msg}`);
    // 必要予算の表示が厳密値の±0.5円以内
    const shown = Number(txt(w, "budget").replace(/[^\d-]/g, ""));
    const exact = Number(costS) / 1e7;
    if (Math.abs(shown - exact) > 0.5001) failures.push(`必要予算表示 ${label} 期待≈${exact} 実際=${shown}`);
  }
  test(`ランダム照合 ${N} ケース(損益分岐点/予算判定/必要予算)が厳密計算と一致`, () => {
    if (failures.length) throw new Error(`${failures.length}件不一致。例: ${failures.slice(0, 3).join(" ／ ")}`);
  });
}

// =====================================================================
// 結果出力
// =====================================================================
const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok ? "" : "\n        → " + r.msg}`);
console.log(`\n合計 ${results.length} 件: 成功 ${passed} / 失敗 ${failed.length}`);
process.exit(failed.length ? 1 : 0);