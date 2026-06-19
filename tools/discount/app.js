/* ============================================
   割引・セール価格計算機 : app.js
   バニラJS / 外部依存なし
   - ダーク/ライト切替（localStorage保存）
   - お布施フラグ判定（分岐の起点）
   - ①割引後価格の計算（複数割引の重ね掛け、税込考慮）
   - ②割引率の逆算（元値→セール価格から%OFF・○割引を算出）
   - 入力値はサーバーに送信・保存しない（表示設定のみ保存）
   ============================================ */

(function () {
  "use strict";

  const STORAGE_KEY_THEME = "tf_theme"; // "light" | "dark"
  const STORAGE_KEY_PRO = "tf_pro";     // "1" でお布施済みフラグ（擬似）

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

  /* ---------- お布施フラグ判定 ---------- */
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
     割引・セール価格計算機本体
     ============================================ */

  let dom = {};
  let discountCount = 0;

  function initTool() {
    dom = {
      tabs: Array.from(document.querySelectorAll(".mode-tab")),
      panels: {
        discount: document.getElementById("panel-discount"),
        reverse: document.getElementById("panel-reverse"),
      },
      // ①割引後価格を計算
      discountPrice: document.getElementById("discount-price"),
      discountItems: document.getElementById("discount-items"),
      addDiscountBtn: document.getElementById("add-discount"),
      resetDiscountsBtn: document.getElementById("reset-discounts"),
      discountWithTax: document.getElementById("discount-with-tax"),
      discountTaxRateRow: document.getElementById("discount-tax-rate-row"),
      discountTaxRate: document.getElementById("discount-tax-rate"),
      discountFinal: document.getElementById("discount-final"),
      discountAmount: document.getElementById("discount-amount"),
      discountTaxCard: document.getElementById("discount-tax-card"),
      discountTaxIncl: document.getElementById("discount-tax-incl"),
      discountExplain: document.getElementById("discount-explain"),
      discountSteps: document.getElementById("discount-steps"),
      // ②割引率を逆算
      reverseOriginal: document.getElementById("reverse-original"),
      reverseSale: document.getElementById("reverse-sale"),
      reversePercent: document.getElementById("reverse-percent"),
      reverseAmount: document.getElementById("reverse-amount"),
      reverseWari: document.getElementById("reverse-wari"),
      reverseExplain: document.getElementById("reverse-explain"),
      // 共通
      copyStatus: document.getElementById("copy-status"),
    };

    if (!dom.tabs.length) return; // tool-root未実装ページでは何もしない

    bindEvents();
    initDevProToggle();
    initDiscountItems();
    calcDiscount();
    calcReverse();
  }

  /* ---------- タブ切替 ---------- */
  function bindEvents() {
    dom.tabs.forEach((tab) => {
      tab.addEventListener("click", () => switchMode(tab.dataset.mode));
    });

    // ①割引後価格を計算
    dom.discountPrice.addEventListener("input", calcDiscount);
    dom.addDiscountBtn.addEventListener("click", () => {
      addDiscountItem(10);
      calcDiscount();
    });
    dom.resetDiscountsBtn.addEventListener("click", () => {
      dom.discountItems.innerHTML = "";
      discountCount = 0;
      addDiscountItem(20);
      calcDiscount();
    });
    dom.discountWithTax.addEventListener("change", () => {
      dom.discountTaxRateRow.style.display = dom.discountWithTax.checked ? "flex" : "none";
      dom.discountTaxCard.style.display = dom.discountWithTax.checked ? "" : "none";
      calcDiscount();
    });
    dom.discountTaxRate.addEventListener("input", calcDiscount);

    // ②割引率を逆算
    [dom.reverseOriginal, dom.reverseSale].forEach((el) => el.addEventListener("input", calcReverse));

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

  function formatPercent(value) {
    if (!isFinite(value)) return "-";
    return Number(value).toLocaleString("ja-JP", { maximumFractionDigits: 2 });
  }

  /* ---------- ①割引後価格を計算（重ね掛け対応） ---------- */
  function initDiscountItems() {
    addDiscountItem(20);
  }

  function addDiscountItem(defaultPercent) {
    discountCount += 1;
    const id = discountCount;
    const row = document.createElement("div");
    row.className = "discount-item";
    row.dataset.discountId = String(id);

    const field = document.createElement("div");
    const label = document.createElement("label");
    label.setAttribute("for", `discount-rate-${id}`);
    label.textContent = `割引${id}（%OFF）`;
    const input = document.createElement("input");
    input.type = "number";
    input.inputMode = "decimal";
    input.step = "any";
    input.min = "0";
    input.max = "100";
    input.id = `discount-rate-${id}`;
    input.value = defaultPercent !== undefined ? String(defaultPercent) : "10";
    input.addEventListener("input", calcDiscount);
    field.appendChild(label);
    field.appendChild(input);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-line";
    removeBtn.setAttribute("aria-label", `割引${id}を削除`);
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", () => {
      row.remove();
      calcDiscount();
    });

    row.appendChild(field);
    row.appendChild(removeBtn);
    dom.discountItems.appendChild(row);
  }

  function calcDiscount() {
    const original = Number(dom.discountPrice.value);
    const rows = Array.from(dom.discountItems.querySelectorAll(".discount-item"));

    if (!isFinite(original)) {
      dom.discountFinal.textContent = "-";
      dom.discountAmount.textContent = "-";
      dom.discountExplain.textContent = "元値を入力してください。";
      dom.discountSteps.innerHTML = "";
      return;
    }

    let current = original;
    const steps = [];

    rows.forEach((row, index) => {
      const input = row.querySelector('input[type="number"]');
      const rate = Number(input.value);
      if (!isFinite(rate) || rate <= 0) {
        steps.push(`割引${index + 1}: 0%OFF（変化なし） → ${formatYen(current)}円`);
        return;
      }
      const before = current;
      current = current * (1 - rate / 100);
      steps.push(`割引${index + 1}: ${formatPercent(rate)}%OFF → ${formatYen(before)}円 × (1 − ${formatPercent(rate)}%) = ${formatYen(current)}円`);
    });

    const totalDiscountAmount = original - current;

    dom.discountFinal.textContent = formatYen(current);
    dom.discountAmount.textContent = formatYen(totalDiscountAmount);

    if (rows.length === 0) {
      dom.discountExplain.textContent = "割引を追加してください。";
    } else if (rows.length === 1) {
      dom.discountExplain.textContent =
        `${formatYen(original)}円の${formatPercent(Number(rows[0].querySelector('input').value))}%OFFは、割引額${formatYen(totalDiscountAmount)}円・割引後価格${formatYen(current)}円です。`;
    } else {
      dom.discountExplain.textContent =
        `${rows.length}件の割引を重ね掛けした結果、${formatYen(original)}円 → ${formatYen(current)}円（割引額${formatYen(totalDiscountAmount)}円）になります。`;
    }

    dom.discountSteps.innerHTML = "";
    steps.forEach((stepText) => {
      const li = document.createElement("li");
      li.textContent = stepText;
      dom.discountSteps.appendChild(li);
    });

    // 税込価格
    if (dom.discountWithTax.checked) {
      const taxRate = Number(dom.discountTaxRate.value);
      if (isFinite(taxRate) && taxRate >= 0) {
        const incl = current * (1 + taxRate / 100);
        dom.discountTaxIncl.textContent = formatYen(incl);
      } else {
        dom.discountTaxIncl.textContent = "-";
      }
    }
  }

  /* ---------- ②割引率を逆算 ---------- */
  function calcReverse() {
    const original = Number(dom.reverseOriginal.value);
    const sale = Number(dom.reverseSale.value);

    if (!isFinite(original) || !isFinite(sale)) {
      dom.reversePercent.textContent = "-";
      dom.reverseAmount.textContent = "-";
      dom.reverseWari.textContent = "-";
      dom.reverseExplain.textContent = "元値とセール価格を入力してください。";
      return;
    }

    if (original === 0) {
      dom.reversePercent.textContent = "-";
      dom.reverseAmount.textContent = "-";
      dom.reverseWari.textContent = "-";
      dom.reverseExplain.textContent = "元値に0以外の値を入力してください。";
      return;
    }

    if (sale > original) {
      dom.reversePercent.textContent = "-";
      dom.reverseAmount.textContent = "-";
      dom.reverseWari.textContent = "-";
      dom.reverseExplain.textContent = "セール価格が元値より高いため、割引にはなりません（割増の場合は別途ご利用ください）。";
      return;
    }

    const amount = original - sale;
    const percent = (amount / original) * 100;
    const wari = percent / 10;

    dom.reversePercent.textContent = formatPercent(percent);
    dom.reverseAmount.textContent = formatYen(amount);
    dom.reverseWari.textContent = formatPercent(wari);
    dom.reverseExplain.textContent =
      `${formatYen(original)}円 → ${formatYen(sale)}円 は、割引額${formatYen(amount)}円・割引率${formatPercent(percent)}%OFF（${formatPercent(wari)}割引）です。`;
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
