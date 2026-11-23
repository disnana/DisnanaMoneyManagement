# 公式サイトとWebクレジットショップ

## サイト構成

| URL | ページ |
| --- | --- |
| `/` | マネーちゃんの公式トップ、機能紹介、Androidと各ページへの案内 |
| `/app/` | 既存のWeb家計簿。現在と同じオリジン、保存領域、PWAのIDを使う |
| `/shop/` | Googleログイン、クレジットパック、残高・期限、購入・台帳履歴、領収書 |
| `/terms/`、`/privacy/` | 利用規約・プライバシーポリシー |
| `/api/shop/*` | 同一オリジンのWorker。上記の静的ファイルとは別経路 |

静的ページは既存のGitHub Pagesで配信する。独自ドメインなどルート配信時のビルドコマンドは `bun run build:portal`、成果物は `dist`。通常の `bun run build` とサブパス配信では、従来どおりPWAをトップに出す。公開ホストと端末データの保存領域はそのまま使い、旧PWAショートカットのURLを引き継ぐ。

ショップAPIはCloudflareのWorker Routeで `dmm.disnana.com/api/shop/*` だけを割り当てる。ドメインの配信元、GitHub Pagesの設定、Cloudflare DNSの既存の向き先は移管しない。Stripeの試験では専用の試験ホストを使い、GitHub Pagesの公開版はレビュー後に更新する。

## 試験環境の更新順序

1. 隔離ScyllaDBで [credit schema](../apps/server/internal/credits/schema.cql) を適用し、既存の [ScyllaDB設定](scylladb.md#ステージングのクレジット台帳) を両Goノードでそろえる。両ノードを更新し、Androidから残高が読めることを確認する。セッションの永続化は別作業で、今回の再起動は現行の試験セッションを失効させる。
2. Goの `android-auth.env` とショップWorkerに、同じ32バイト以上のランダムなbase64url値を `MANE_WEB_WORKER_KEY` として設定する。GoのWebショップAPIはScyllaDB有効時だけ使える。WorkerとはHTTPSの内部呼び出しを使い、HTTPメソッド、パス、本文のハッシュ、時刻をHMACで照合する。GoのエンドポイントをAndroid用Workerの公開ルートには追加しない。
3. 試験用D1を作り、[schema.sql](../apps/shop-worker/schema.sql) を適用する。[Wrangler設定例](../apps/shop-worker/wrangler.example.toml) をコピーし、試験ホストに合わせて `SITE_ORIGIN`、ルート、D1 ID、GoノードのHTTPSオリジンを指定する。静的ページと同じホストの `/api/shop/*` をWorkerに割り当てる。
4. Androidと同じGoogleのWeb OAuthクライアントを使い、Google Cloudで `https://<試験ホスト>/api/shop/auth/callback` を承認済みリダイレクトURIに登録する。Workerに `GOOGLE_WEB_CLIENT_ID` と `GOOGLE_WEB_CLIENT_SECRET` を設定する。WebはGoogleの `sub` をGoで検証してから、Androidと同じ残高を取得する。
5. Stripeのテスト環境から `STRIPE_SECRET_KEY` と `STRIPE_WEBHOOK_SECRET` をWorkerに登録する。Webhook URLは `/api/shop/stripe/webhook`。対象は `checkout.session.completed`、`checkout.session.async_payment_succeeded`、`checkout.session.async_payment_failed`、`checkout.session.expired`、`charge.refunded`、`charge.dispute.created`、`charge.dispute.updated`、`charge.dispute.closed`。Stripe Dashboardのテスト環境で返金を実行する。
6. 購入を許可したテストアカウントのGoogle `sub` をSHA-256の小文字16進数に変換し、カンマ区切りで `MANE_SHOP_TEST_SUBJECT_HASHES` に設定する。試験用の商品設定は `MANE_SHOP_PACKS` にJSON配列で指定する。項目は `id`、`title`、JPYの整数 `amount`、整数 `credits`、有効秒数または `null` の `validity_seconds`。試験設定と認証を確認できた後に `MANE_SHOP_TEST_MODE=1`。テストキーと対象アカウントの両方が必要。

## 注文と台帳

購入開始時にWorkerが認証済みの購入者と価格・クレジット数をD1に記録する。Stripeの決済完了後、WorkerはWebhooksの署名と時刻を検証し、Stripe APIで決済状態を再取得する。注文・通貨・金額・支払いの一致を確認してからGoで付与する。Stripe CheckoutからWebショップに戻る操作は、画面表示だけを更新する。

付与・全額返金による未使用分の取り消し・台帳の監査行は、購入IDをキーにScyllaDBへ条件付きで記録する。途中で失敗した注文はD1に付与中・返金反映中として残り、Webhook再送または定期処理で同じ操作IDを使う。部分返金、チャージバック、返金時点で消費した分の扱いは確認待ち。既存の期限優先消費を使い、無期限は後から消費する。AIジョブ開始時の見積・予約・精算は、AI実行APIとの接続時に追加する。

## 本番販売前の確認

- 価格、クレジットの期限、無期限の個人上限、全ユーザーの未使用残高上限、返金・異議申立て時の消費済み分の扱いは未確定。全体上限を競合なく守る処理は本番決済を有効にする前に実装・検証する。現在のWorkerはStripeのテスト決済に限定している。
- 日本の通信販売で必要な販売者表示・価格・支払と提供の時期・キャンセル条件を確認し、申込みの最終確認画面に必要事項を表示する。住所の公開方法は、第11条ただし書の適用と即時に近い提供体制を含め、販売者の状況に合わせて判断する。[消費者庁の通信販売ガイド](https://www.no-trouble.caa.go.jp/what/mailorder/)
- 有償クレジットが前払式支払手段に該当するか、期限や発行形態による適用除外、基準日未使用残高、払戻しを確認する。適用除外を前提に期限を設定しない。[資金決済に関する法律](https://laws.e-gov.go.jp/law/421AC0000000059) · [金融庁の払戻し案内](https://www.fsa.go.jp/policy/prepaid/)
- Androidは残高・履歴・利用の表示にとどめる。購入案内は文章で表示し、公式リンク一覧は規約・プライバシー・サポートへの直接リンク。日本でアプリから購入ページにリンクする場合はBilling Choiceの要件が加わる。[Google Play決済ポリシーFAQ](https://support.google.com/googleplay/android-developer/answer/10281818?hl=ja) · [Billing Choice](https://support.google.com/googleplay/android-developer/answer/17161464?hl=ja)
- 作業ブランチの試験では署名付きイベントの重複、支払い未完了、失敗時の再試行、部分・全額返金、チャージバック、OAuth状態の再送、第三者Originを検証する。実際のStripeテスト決済は公開前に同じ操作で照合する。[Stripe Checkoutの履行手順](https://docs.stripe.com/checkout/fulfillment)
