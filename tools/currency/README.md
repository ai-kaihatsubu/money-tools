# 030-currency-converter（為替・通貨換算ツール）

金額と通貨を選ぶだけで、主要通貨間のレートを使って自動換算できる無料ツールです。
「お金の計算」統合アプリ内の1モジュールとして、後でタブ統合される想定です。

## 機能

1. 金額入力＋「変換元」「変換先」通貨を選択 → 換算結果を表示。
2. 通貨は主要通貨（JPY/USD/EUR/GBP/AUD/CNY/KRW/CHF/CAD/HKD/SGD等、frankfurter.appが対応する22種類）。
3. スワップボタン（⇄）で変換元・変換先を入れ替え。
4. レート表（1 from = X to）を表示。「レート表をコピー」でテキストコピー可能。
5. 結果の「結果をコピー」ボタンでテキストコピー可能。

## レート取得

- 無料API `https://api.frankfurter.dev/v1/latest?from=XXX` から取得（frankfurter／ECB系・APIキー不要・CORS対応。
  旧ドメイン`api.frankfurter.app`は301リダイレクトとなり、ブラウザfetchでCORSエラーになるため新ドメインを使用）。
- 取得したレートと基準日（date）を表示。
- 取得失敗/オフライン時は「レートを取得できません（オフラインの可能性）」と表示し、
  最後に取得成功したレートがあればlocalStorageから読み込み、「◯月◯日時点のレート」として使用。

## プライバシー

- 入力した金額は外部送信・保存しません。すべて端末内（ブラウザ）で処理します。
- 為替レート取得のため frankfurter.app（ECB）と通信しますが、金額・個人情報は送信されません。
- localStorageに保存するのは、表示設定・直前の通貨ペア・最終取得レートのキャッシュのみ。

## 収益設計（プレースホルダ）

- AdSense: コンテンツ上下に2枠（`monetization.js`の`ADSENSE_CLIENT_ID`に本番IDを設定済み。広告ローダーは1回だけ注入）
- アフィリエイト: 「おすすめ」枠（クレジットカード・海外送金・両替サービス等想定、`AFFILIATE_ITEMS`未設定）
- Stripe Pro（¥480買い切り）: 広告非表示・お気に入り通貨ペアの保存を想定（`STRIPE_PAYMENT_LINK_URL`未設定）

## 公開手順（社長作業）

1. GitHub新規リポジトリ（または「お金の計算」統合アプリ配下）でGitHub Pages公開
2. `index.html`等の`canonical`/OGP URLが実際の公開URLと一致するか確認
3. `operator.html`の運営者情報・特定商取引法に基づく表記を記入
4. AdSense審査申請（クライアントIDは設定済み）→ 通過後、広告配信を確認
5. AdSense配信開始に伴うCookie同意（CMP）対応の検討
6. アフィリエイト提携（クレジットカード・海外送金・両替サービス等）→ `AFFILIATE_ITEMS`を実リンクに更新
7. Stripe Payment Link発行 → `STRIPE_PAYMENT_LINK_URL`設定
8. 公開前に開発用「Proフラグを切替（開発用）」ボタンの削除を検討
