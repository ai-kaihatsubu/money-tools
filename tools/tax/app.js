/* ============================================
   消費税計算機 : app.js
   バニラJS / 外部依存なし
   - ダーク/ライト切替（localStorage保存）
   - Proフラグ判定（広告非表示などの分岐の起点）
   - ①税込・税抜の相互計算（10%/8%/任意税率、内税/外税）
   - ②複数明細の合計計算
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
     消費税計算機本体
     ============================================ */

  let dom = {};
  let lineCount = 0;

  function initTool() {
    dom = {
      tabs: Array.from(document.querySelectorAll(".mode-tab")),
      panels: {
        single: document.getElementById("panel-single"),
        multi: document.getElementById("panel-multi"),
      },
      // ①税込・税抜計算
      singleAmount: document.getElementById("single-amount"),
      singleExcl: document.getElementById("single-excl"),
      singleTax: document.getElementById("single-tax"),
      singleIncl: document.getElementById("single-incl"),
      singleExplain: document.getElementById("single-explain"),
      customRateInput: document.getElementById("custom-rate-input"),
      // ②複数明細の合計
      lineItems: document.getElementById("line-items"),
      addLineBtn: document.getElementById("add-line"),
      resetLinesBtn: document.getElementById("reset-lines"),
      multiExcl: document.getElementById("multi-excl"),
      multiTax: document.getElementById("multi-tax"),
      multiIncl: document.getElementById("multi-incl"),
      multiExplain: document.getElementById("multi-explain"),
      // 共通
      copyStatus: document.getElementById("copy-status"),
    };

    if (!dom.tabs.length) return; // tool-root未実装ページでは何もしない

    bindEvents();
    initDevProToggle();
    initLineItems();
    calcSingle();
    calcMulti();
  }

  /* ---------- タブ切替 ---------- */
  function bindEvents() {
    dom.tabs.forEach((tab) => {
      tab.addEventListener("click", () => switchMode(tab.dataset.mode));
    });

    // ①税込・税抜計算
    dom.singleAmount.addEventListener("input", calcSingle);
    document.querySelectorAll('input[name="tax-rate"]').forEach((el) => {
      el.addEventListener("change", () => {
        const customChecked = document.getElementById("rate-custom").checked;
        dom.customRateInput.disabled = !customChecked;
        calcSingle();
      });
    });
    dom.customRateInput.addEventListener("input", calcSingle);
    document.querySelectorAll('input[name="amount-type"]').forEach((el) => {
      el.addEventListener("change", calcSingle);
    });

    // ②複数明細
    dom.addLineBtn.addEventListener("click", () => {
      addLineItem();
      calcMulti();
    });
    dom.resetLinesBtn.addEventListener("click", () => {
      dom.lineItems.innerHTML = "";
      lineCount = 0;
      addLineItem(1000, "10");
      addLineItem(500, "8");
      calcMulti();
    });

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
  function formatYen(value) {
    if (!isFinite(value)) return "-";
    const rounded = Math.round(value);
    return rounded.toLocaleString("ja-JP");
  }

  function getCurrentRate() {
    const checked = document.querySelector('input[name="tax-rate"]:checked');
    if (!checked) return 10;
    if (checked.value === "custom") {
      const v = Number(dom.customRateInput.value);
      return isFinite(v) && v >= 0 ? v : 0;
    }
    return Number(checked.value);
  }

  /* ---------- ①税込・税抜計算 ---------- */
  function calcSingle() {
    const amount = Number(dom.singleAmount.value);
    const rate = getCurrentRate();
    const amountType = document.querySelector('input[name="amount-type"]:checked').value;

    if (!isFinite(amount) || !isFinite(rate)) {
      dom.singleExcl.textContent = "-";
      dom.singleTax.textContent = "-";
      dom.singleIncl.textContent = "-";
      dom.singleExplain.textContent = "金額と税率を入力してください。";
      return;
    }

    let excl, tax, incl;
    if (amountType === "incl") {
      // 税込金額から税抜・消費税額を逆算
      incl = amount;
      excl = amount / (1 + rate / 100);
      tax = incl - excl;
      dom.singleExplain.textContent =
        `税込 ${formatYen(incl)}円（税率${formatRate(rate)}%）の税抜価格は ${formatYen(excl)}円、消費税額は ${formatYen(tax)}円です。`;
    } else {
      // 税抜金額から消費税額・税込金額を計算
      excl = amount;
      tax = excl * (rate / 100);
      incl = excl + tax;
      dom.singleExplain.textContent =
        `税抜 ${formatYen(excl)}円（税率${formatRate(rate)}%）の消費税額は ${formatYen(tax)}円、税込価格は ${formatYen(incl)}円です。`;
    }

    dom.singleExcl.textContent = formatYen(excl);
    dom.singleTax.textContent = formatYen(tax);
    dom.singleIncl.textContent = formatYen(incl);
  }

  function formatRate(rate) {
    // 整数なら小数点を省略、小数なら最小限の桁数で表示
    return Number(rate).toLocaleString("ja-JP", { maximumFractionDigits: 4 });
  }

  /* ---------- ②複数明細の合計 ---------- */
  function initLineItems() {
    addLineItem(1000, "10");
    addLineItem(500, "8");
  }

  function addLineItem(defaultAmount, defaultRate) {
    lineCount += 1;
    const id = lineCount;
    const row = document.createElement("div");
    row.className = "line-item";
    row.dataset.lineId = String(id);

    const amountField = document.createElement("div");
    const amountLabel = document.createElement("label");
    amountLabel.setAttribute("for", `line-amount-${id}`);
    amountLabel.textContent = `明細${id}: 金額（円）`;
    const amountInput = document.createElement("input");
    amountInput.type = "number";
    amountInput.inputMode = "decimal";
    amountInput.step = "any";
    amountInput.id = `line-amount-${id}`;
    amountInput.value = defaultAmount !== undefined ? String(defaultAmount) : "1000";
    amountInput.addEventListener("input", calcMulti);
    amountField.appendChild(amountLabel);
    amountField.appendChild(amountInput);

    const rateField = document.createElement("div");
    const rateLabel = document.createElement("label");
    rateLabel.setAttribute("for", `line-rate-${id}`);
    rateLabel.textContent = "税率（%）";
    const rateSelect = document.createElement("select");
    rateSelect.id = `line-rate-${id}`;
    [
      { value: "10", label: "10%（標準）" },
      { value: "8", label: "8%（軽減）" },
      { value: "0", label: "0%（非課税）" },
    ].forEach((opt) => {
      const optionEl = document.createElement("option");
      optionEl.value = opt.value;
      optionEl.textContent = opt.label;
      rateSelect.appendChild(optionEl);
    });
    rateSelect.value = defaultRate !== undefined ? defaultRate : "10";
    rateSelect.addEventListener("change", calcMulti);
    rateField.appendChild(rateLabel);
    rateField.appendChild(rateSelect);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-line";
    removeBtn.setAttribute("aria-label", `明細${id}を削除`);
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", () => {
      row.remove();
      calcMulti();
    });

    row.appendChild(amountField);
    row.appendChild(rateField);
    row.appendChild(removeBtn);
    dom.lineItems.appendChild(row);
  }

  function calcMulti() {
    const rows = Array.from(dom.lineItems.querySelectorAll(".line-item"));
    const amountType = document.querySelector('input[name="amount-type"]:checked')
      ? document.querySelector('input[name="amount-type"]:checked').value
      : "excl";

    let totalExcl = 0;
    let totalTax = 0;
    let totalIncl = 0;
    let validCount = 0;

    rows.forEach((row) => {
      const amountInput = row.querySelector('input[type="number"]');
      const rateSelect = row.querySelector("select");
      const amount = Number(amountInput.value);
      const rate = Number(rateSelect.value);
      if (!isFinite(amount) || !isFinite(rate)) return;

      let excl, tax, incl;
      if (amountType === "incl") {
        incl = amount;
        excl = amount / (1 + rate / 100);
        tax = incl - excl;
      } else {
        excl = amount;
        tax = excl * (rate / 100);
        incl = excl + tax;
      }
      totalExcl += excl;
      totalTax += tax;
      totalIncl += incl;
      validCount += 1;
    });

    if (validCount === 0) {
      dom.multiExcl.textContent = "0";
      dom.multiTax.textContent = "0";
      dom.multiIncl.textContent = "0";
      dom.multiExplain.textContent = "明細を追加して金額を入力してください。";
      return;
    }

    dom.multiExcl.textContent = formatYen(totalExcl);
    dom.multiTax.textContent = formatYen(totalTax);
    dom.multiIncl.textContent = formatYen(totalIncl);
    dom.multiExplain.textContent =
      `${validCount}件の明細を合計しました。税抜合計 ${formatYen(totalExcl)}円 + 消費税合計 ${formatYen(totalTax)}円 = 税込合計 ${formatYen(totalIncl)}円。`;
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
