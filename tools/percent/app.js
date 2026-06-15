/* ============================================
   パーセント計算機 : app.js
   バニラJS / 外部依存なし
   - ダーク/ライト切替（localStorage保存）
   - Proフラグ判定（広告非表示などの分岐の起点）
   - 5モードのパーセント計算（①AのB% ②AはBの何% ③増減率 ④割引/割増 ⑤分数/小数変換）
   - 入力値はサーバーに送信・保存しない（表示設定のみ保存）
   ============================================ */

(function () {
  "use strict";

  const STORAGE_KEY_THEME = "tf_theme"; // "light" | "dark"
  const STORAGE_KEY_PRO = "tf_pro";     // "1" で Pro 有効（擬似フラグ）

  /* ---------- テーマ切替 ---------- */
  function initTheme() {
    const toggle = document.getElementById("theme-toggle");
    const root = document.documentElement;

    const saved = localStorage.getItem(STORAGE_KEY_THEME);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initial = saved || (prefersDark ? "dark" : "light");
    applyTheme(initial);

    if (toggle) {
      toggle.addEventListener("click", () => {
        const current = root.getAttribute("data-theme") === "dark" ? "dark" : "light";
        const next = current === "dark" ? "light" : "dark";
        applyTheme(next);
        localStorage.setItem(STORAGE_KEY_THEME, next);
      });
    }

    function applyTheme(theme) {
      if (theme === "dark") {
        root.setAttribute("data-theme", "dark");
        if (toggle) {
          toggle.setAttribute("aria-pressed", "true");
          toggle.innerHTML = '<span aria-hidden="true">☀️</span>';
        }
      } else {
        root.removeAttribute("data-theme");
        if (toggle) {
          toggle.setAttribute("aria-pressed", "false");
          toggle.innerHTML = '<span aria-hidden="true">🌙</span>';
        }
      }
    }
  }

  /* ---------- Pro判定（広告非表示など） ---------- */
  function isPro() {
    return localStorage.getItem(STORAGE_KEY_PRO) === "1";
  }

  function applyProState() {
    if (isPro()) {
      document.body.classList.add("is-pro");
      document.querySelectorAll(".ad-slot").forEach((el) => {
        el.style.display = "none";
      });
    }
  }

  /* ---------- 開発用Pro切替ボタン ---------- */
  function initDevProToggle() {
    const btn = document.getElementById("dev-pro-toggle");
    if (!btn) return;
    btn.addEventListener("click", () => {
      const next = isPro() ? "0" : "1";
      localStorage.setItem(STORAGE_KEY_PRO, next);
      location.reload();
    });
  }

  window.ToolFactory = { isPro: isPro };

  /* ============================================
     パーセント計算機本体
     ============================================ */

  let dom = {};

  function initTool() {
    dom = {
      tabs: Array.from(document.querySelectorAll(".mode-tab")),
      panels: {
        of: document.getElementById("panel-of"),
        what: document.getElementById("panel-what"),
        change: document.getElementById("panel-change"),
        discount: document.getElementById("panel-discount"),
        fraction: document.getElementById("panel-fraction"),
      },
      // ①AのB%はいくつ
      ofA: document.getElementById("of-a"),
      ofB: document.getElementById("of-b"),
      ofResult: document.getElementById("of-result"),
      ofExplain: document.getElementById("of-explain"),
      // ②AはBの何%
      whatA: document.getElementById("what-a"),
      whatB: document.getElementById("what-b"),
      whatResult: document.getElementById("what-result"),
      whatExplain: document.getElementById("what-explain"),
      // ③増減率
      changeA: document.getElementById("change-a"),
      changeB: document.getElementById("change-b"),
      changeResult: document.getElementById("change-result"),
      changeExplain: document.getElementById("change-explain"),
      // ④割引/割増
      discountA: document.getElementById("discount-a"),
      discountB: document.getElementById("discount-b"),
      discountResult: document.getElementById("discount-result"),
      discountExplain: document.getElementById("discount-explain"),
      // ⑤分数/小数
      fractionInput: document.getElementById("fraction-input"),
      fractionDecimal: document.getElementById("fraction-decimal"),
      fractionFraction: document.getElementById("fraction-fraction"),
      // 共通
      copyStatus: document.getElementById("copy-status"),
    };

    if (!dom.tabs.length) return; // tool-root未実装ページでは何もしない

    bindEvents();
    initDevProToggle();
    calcOf();
    calcWhat();
    calcChange();
    calcDiscount();
    calcFraction();
  }

  /* ---------- タブ切替 ---------- */
  function bindEvents() {
    dom.tabs.forEach((tab) => {
      tab.addEventListener("click", () => switchMode(tab.dataset.mode));
    });

    // ①AのB%はいくつ
    [dom.ofA, dom.ofB].forEach((el) => el.addEventListener("input", calcOf));

    // ②AはBの何%
    [dom.whatA, dom.whatB].forEach((el) => el.addEventListener("input", calcWhat));

    // ③増減率
    [dom.changeA, dom.changeB].forEach((el) => el.addEventListener("input", calcChange));

    // ④割引/割増
    [dom.discountA, dom.discountB].forEach((el) => el.addEventListener("input", calcDiscount));
    document.querySelectorAll('input[name="discount-mode"]').forEach((el) => {
      el.addEventListener("change", calcDiscount);
    });

    // ⑤分数/小数
    dom.fractionInput.addEventListener("input", calcFraction);

    // コピー
    document.querySelectorAll(".copy-btn").forEach((btn) => {
      btn.addEventListener("click", () => copyResult(btn.dataset.target));
    });
  }

  function switchMode(mode) {
    dom.tabs.forEach((tab) => {
      const isActive = tab.dataset.mode === mode;
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
      tab.tabIndex = isActive ? 0 : -1;
    });
    Object.keys(dom.panels).forEach((key) => {
      const panel = dom.panels[key];
      if (key === mode) {
        panel.hidden = false;
        panel.classList.add("is-active");
      } else {
        panel.hidden = true;
        panel.classList.remove("is-active");
      }
    });
    dom.copyStatus.textContent = "";
  }

  /* ---------- 数値フォーマット ---------- */
  function formatNumber(value, maxDecimals) {
    if (!isFinite(value)) return "-";
    const factor = Math.pow(10, maxDecimals);
    const rounded = Math.round(value * factor) / factor;
    return rounded.toLocaleString("ja-JP", { maximumFractionDigits: maxDecimals });
  }

  /* ---------- ①AのB%はいくつ ---------- */
  function calcOf() {
    const a = Number(dom.ofA.value);
    const b = Number(dom.ofB.value);
    if (!isFinite(a) || !isFinite(b)) {
      dom.ofResult.textContent = "-";
      dom.ofExplain.textContent = "数値を入力してください。";
      return;
    }
    const result = (a * b) / 100;
    dom.ofResult.textContent = formatNumber(result, 4);
    dom.ofExplain.textContent = `${formatNumber(a, 4)} の ${formatNumber(b, 4)}% は ${formatNumber(result, 4)} です。`;
  }

  /* ---------- ②AはBの何% ---------- */
  function calcWhat() {
    const a = Number(dom.whatA.value);
    const b = Number(dom.whatB.value);
    if (!isFinite(a) || !isFinite(b)) {
      dom.whatResult.textContent = "-";
      dom.whatExplain.textContent = "数値を入力してください。";
      return;
    }
    if (b === 0) {
      dom.whatResult.textContent = "-";
      dom.whatExplain.textContent = "B（基準となる数値）に0以外の値を入力してください。";
      return;
    }
    const result = (a / b) * 100;
    dom.whatResult.textContent = formatNumber(result, 4);
    dom.whatExplain.textContent = `${formatNumber(a, 4)} は ${formatNumber(b, 4)} の ${formatNumber(result, 4)}% です。`;
  }

  /* ---------- ③増減率 ---------- */
  function calcChange() {
    const a = Number(dom.changeA.value);
    const b = Number(dom.changeB.value);
    if (!isFinite(a) || !isFinite(b)) {
      dom.changeResult.textContent = "-";
      dom.changeExplain.textContent = "数値を入力してください。";
      return;
    }
    if (a === 0) {
      dom.changeResult.textContent = "-";
      dom.changeExplain.textContent = "A（変化前の値）に0以外の値を入力してください。";
      return;
    }
    const result = ((b - a) / a) * 100;
    const sign = result > 0 ? "+" : "";
    dom.changeResult.textContent = sign + formatNumber(result, 4);

    if (result > 0) {
      dom.changeExplain.textContent = `${formatNumber(a, 4)} から ${formatNumber(b, 4)} へ ${formatNumber(result, 4)}% 増加しました。`;
    } else if (result < 0) {
      dom.changeExplain.textContent = `${formatNumber(a, 4)} から ${formatNumber(b, 4)} へ ${formatNumber(Math.abs(result), 4)}% 減少しました。`;
    } else {
      dom.changeExplain.textContent = `${formatNumber(a, 4)} から変化はありません（0%）。`;
    }
  }

  /* ---------- ④割引/割増 ---------- */
  function calcDiscount() {
    const a = Number(dom.discountA.value);
    const b = Number(dom.discountB.value);
    const mode = document.querySelector('input[name="discount-mode"]:checked').value;

    if (!isFinite(a) || !isFinite(b)) {
      dom.discountResult.textContent = "-";
      dom.discountExplain.textContent = "数値を入力してください。";
      return;
    }

    let result;
    if (mode === "off") {
      result = a * (1 - b / 100);
      dom.discountExplain.textContent = `${formatNumber(a, 4)} の ${formatNumber(b, 4)}% 引きは ${formatNumber(result, 4)} です。`;
    } else {
      result = a * (1 + b / 100);
      dom.discountExplain.textContent = `${formatNumber(a, 4)} の ${formatNumber(b, 4)}% 増しは ${formatNumber(result, 4)} です。`;
    }
    dom.discountResult.textContent = formatNumber(result, 4);
  }

  /* ---------- ⑤割合→分数/小数 ---------- */
  // 最大公約数（ユークリッドの互除法）
  function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) {
      [a, b] = [b, a % b];
    }
    return a || 1;
  }

  function calcFraction() {
    const percent = Number(dom.fractionInput.value);
    if (!isFinite(percent)) {
      dom.fractionDecimal.textContent = "-";
      dom.fractionFraction.textContent = "-";
      return;
    }

    const decimal = percent / 100;
    dom.fractionDecimal.textContent = formatNumber(decimal, 6);

    // 分数化: 小数部分の桁数から分母を決定（最大6桁）
    const decimalStr = String(decimal);
    const dotIndex = decimalStr.indexOf(".");
    let numerator, denominator;
    if (dotIndex === -1) {
      numerator = decimal;
      denominator = 1;
    } else {
      const decimalPlaces = Math.min(decimalStr.length - dotIndex - 1, 6);
      denominator = Math.pow(10, decimalPlaces);
      numerator = Math.round(decimal * denominator);
    }

    const divisor = gcd(numerator, denominator);
    numerator = numerator / divisor;
    denominator = denominator / divisor;

    if (denominator === 1) {
      dom.fractionFraction.textContent = `${numerator}`;
    } else {
      dom.fractionFraction.textContent = `${numerator}/${denominator}`;
    }
  }

  /* ---------- コピー ---------- */
  function copyResult(targetId) {
    const target = document.getElementById(targetId);
    if (!target) return;
    const text = target.textContent;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          dom.copyStatus.textContent = `「${text}」をコピーしました。`;
        })
        .catch(() => {
          dom.copyStatus.textContent = "コピーに失敗しました。";
        });
    } else {
      dom.copyStatus.textContent = "コピー機能はこのブラウザでは利用できません。";
    }
  }

  /* ---------- 起動 ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    applyProState();
    initTool();
  });
})();
