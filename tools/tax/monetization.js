/* ============================================
   消費税計算機 : monetization.js
   収益3レールを1ファイルで管理
   1) AdSense  2) アフィリエイト  3) Stripe Payment Link (Pro)
   ============================================ */

(function () {
  "use strict";

  /* ============================================
     設定（社長が値を入れる箇所）
     ============================================ */
  const CONFIG = {
    // 1) AdSense
    ADSENSE_CLIENT_ID: "ca-pub-6568622993777242",

    // 2) アフィリエイト
    // TODO: 提携先のアフィリエイトリンクに置き換える（会計ソフト・確定申告サービス等）
    AFFILIATE_ITEMS: [
      {
        label: "TODO: クラウド会計・確定申告ソフト",
        url: "https://example.com/affiliate-link-1", // TODO
      },
      {
        label: "TODO: インボイス制度対応の請求書作成サービス",
        url: "https://example.com/affiliate-link-2", // TODO
      },
    ],

    // 3) Stripe
    // TODO: Stripe Payment LinkのURLを設定する
    STRIPE_PAYMENT_LINK_URL: "", // TODO 例: "https://buy.stripe.com/XXXXXXXX"
  };

  /* ---------- 1) AdSense 広告ローダー（1回だけ注入） ---------- */
  var ADSENSE_CLIENT_ID = CONFIG.ADSENSE_CLIENT_ID;
  (function () {
    try {
      var p = window.ToolFactory && window.ToolFactory.isPro && window.ToolFactory.isPro();
      if (ADSENSE_CLIENT_ID && !p && !document.querySelector('script[src*="adsbygoogle.js"]')) {
        var s = document.createElement("script");
        s.async = true;
        s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + ADSENSE_CLIENT_ID;
        s.crossOrigin = "anonymous";
        document.head.appendChild(s);
      }
    } catch (e) {}
  })();

  /* ---------- 2) アフィリエイト枠レンダリング ---------- */
  function renderAffiliateLinks() {
    const list = document.getElementById("affiliate-list");
    if (!list) return;

    list.innerHTML = "";
    CONFIG.AFFILIATE_ITEMS.forEach((item) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = item.url;
      a.textContent = item.label;
      a.rel = "sponsored nofollow noopener";
      a.target = "_blank";
      li.appendChild(a);
      list.appendChild(li);
    });
  }

  /* ---------- 3) Stripe Payment Link（Proボタン） ---------- */
  function initProButton() {
    const btn = document.getElementById("pro-button");
    if (!btn) return;

    btn.addEventListener("click", () => {
      if (!CONFIG.STRIPE_PAYMENT_LINK_URL) {
        alert("Pro機能は準備中です。公開までお待ちください。");
        return;
      }
      window.open(CONFIG.STRIPE_PAYMENT_LINK_URL, "_blank", "noopener");
    });
  }

  /* ---------- 起動 ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    renderAffiliateLinks();
    initProButton();
  });

  window.ToolFactoryMonetization = { CONFIG };
})();
