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

ショップAPIは既存の `mane-auth-staging` Worker の `dmm.disnana.com/api/shop/*` ルートで扱う。Android認証のカスタムドメインと、GitHub Pagesの静的配信は従来の経路を使う。WorkerがGoogle OAuthとStripeを処理し、既存のGoサービスに署名付きの内部APIでデータ操作を依頼する。注文・Webセッション・残高はScyllaDBを共有する。

## ステージング反映

1. 両ノードの接続先とkeyspaceを揃える。既存の [credit schema](../apps/server/internal/credits/schema.cql) が適用されたステージングkeyspaceに、[ショップ用CQL](../apps/server/internal/webshop/schema.cql) を一度適用する。両Goノードを更新し、既存の `MANE_WORKER_JWS_PUBLIC_KEY` と接続設定に加えて `MANE_WEB_SHOP_ENABLED=1` を設定する。再起動後に既存Androidセッションは再ログインが必要になる。
2. Cloudflare Accessで各ノードの `/_internal/web-shop/*` を **Service Auth** に限定する。Goの接続は既存Tunnel経由。既存Workerに `MANE_SHOP_ACCESS_CLIENT_ID`、`MANE_SHOP_ACCESS_CLIENT_SECRET` をSecretとして登録する。Goは正しいEd25519署名がないリクエストを404で拒否する。署名対象は既存と同じく短い有効期限、宛先、メソッド、パス、本文。Androidが使うルートへのAccessポリシー追加は今回不要。
3. [既存Worker](../apps/auth-worker/index.mjs) の新しい版をデプロイし、[設定例](../apps/auth-worker/wrangler.example.toml) に従って `dmm.disnana.com/api/shop/*` を追加する。このルートからショップのAPIを公開する。GitHub Pagesにショップ画面を配信する。最初は `MANE_SHOP_TEST_MODE=0` のままにする。
4. Google Cloudの既存Web OAuthクライアントに `https://dmm.disnana.com/api/shop/auth/callback` を登録し、Workerに `GOOGLE_WEB_CLIENT_ID` と `GOOGLE_WEB_CLIENT_SECRET` を設定する。WebとAndroidで同じGoogleアカウントの残高を確認し、別ノード経由やGo再起動後でもWebのログインが使えるか試す。Webセッションの権限はショップAPIに限定される。
5. Stripeのテスト環境から `STRIPE_SECRET_KEY` と `STRIPE_WEBHOOK_SECRET` をWorkerに登録する。Webhook URLは `/api/shop/stripe/webhook`。対象は `checkout.session.completed`、`checkout.session.async_payment_succeeded`、`checkout.session.async_payment_failed`、`checkout.session.expired`、`charge.refunded`、`charge.dispute.created`、`charge.dispute.updated`、`charge.dispute.closed`。
6. 購入を許可するGoogle `sub` のSHA-256（小文字16進数、複数はカンマ区切り）を `MANE_SHOP_TEST_SUBJECT_HASHES` に指定する。試験パックは `MANE_SHOP_PACKS` にJSON配列で設定する。項目は `id`、`title`、JPYの整数 `amount`、整数 `credits`、有効秒数または `null` の `validity_seconds`。動作確認後に `MANE_SHOP_TEST_MODE=1`。テスト鍵と対象アカウントの両方が必要。

## 決済と復旧

- Checkoutを作る前にGo経由で注文を保存する。同じ注文IDをStripeへの冪等キーとして使用し、保存した価格と数量で再試行する。
- WorkerはWebhookの署名を検証し、Stripe APIで注文・通貨・金額・支払いを照合する。Goは注文の条件付き更新と既存台帳への冪等な操作を行う。これらは別のパーティションにあるため、中断時は同じ注文IDで再開する。確認済みの処理をDBに保存できた後にStripeへ成功を返す。失敗時はStripeが再送する。
- 購入履歴の「決済状況を再確認」ボタンは、認証済みの所有者が `POST /api/shop/orders/{orderId}/reconcile` で既存決済を照合する。新たなCheckoutを作成しない。Stripeへの照合後はWebhookと同じ命令を使う。Goに到達できない場合はWorkerがリクエストIDとノードIDを記録し、503と再試行時間を返す。
- テスト段階では全額返金に対し未使用分を取り消す。部分返金とチャージバックは確認待ちとして記録する。消費済み分への扱い、Stripeの再送が終了した後の定期照合、AI実行の予約と精算は本番化前の設計項目。

## 本番販売前の確認

- 価格、クレジットの期限、無期限の個人上限、全ユーザーの未使用残高上限、返金・異議申立て時の消費済み分の扱いは未確定。全体上限を競合なく守る処理は本番決済を有効にする前に実装・検証する。現在のWorkerはStripeのテスト決済に限定している。
- 日本の通信販売で必要な販売者表示・価格・支払と提供の時期・キャンセル条件を確認し、申込みの最終確認画面に必要事項を表示する。住所の公開方法は、第11条ただし書の適用と即時に近い提供体制を含め、販売者の状況に合わせて判断する。[消費者庁の通信販売ガイド](https://www.no-trouble.caa.go.jp/what/mailorder/)
- 有償クレジットが前払式支払手段に該当するか、期限や発行形態による適用除外、基準日未使用残高、払戻しを確認する。適用除外を前提に期限を設定しない。[資金決済に関する法律](https://laws.e-gov.go.jp/law/421AC0000000059) · [金融庁の払戻し案内](https://www.fsa.go.jp/policy/prepaid/)
- Androidは残高・履歴・利用の表示にとどめる。購入案内は文章で表示し、公式リンク一覧は規約・プライバシー・サポートへの直接リンク。日本でアプリから購入ページにリンクする場合はBilling Choiceの要件が加わる。[Google Play決済ポリシーFAQ](https://support.google.com/googleplay/android-developer/answer/10281818?hl=ja) · [Billing Choice](https://support.google.com/googleplay/android-developer/answer/17161464?hl=ja)
- 作業ブランチの試験では署名付きイベントの重複、支払い未完了、失敗時の再試行、部分・全額返金、チャージバック、OAuth状態の再送、第三者Originを検証する。実際のStripeテスト決済は公開前に同じ操作で照合する。[Stripe Checkoutの履行手順](https://docs.stripe.com/checkout/fulfillment)

## 試験販売の判断

試験販売の価格案は次の4パック。100円 / 300crを基準に、税込想定の1cr単価で割引率を比較する。商品設定を有効にする前に有効期限と税・返金の扱いを確認する。Workerの既定設定は購入停止。

1crは、Androidで標準レシート1枚を解析し、結果を保存してユーザーが再取得できる状態になった1回分を想定する。開始時に予約し、同じ解析IDで一度だけ消費する。失敗時は返却し、通信再試行や結果の再取得では追加消費しない。複数枚や長いレシートの扱いは標準ケースの実測を見て決める。

| 価格（税込想定） | 付与 | 基準単価からの割引 | 全量使用時の運営余力 |
| --- | ---: | ---: | ---: |
| 100円 | 300cr | 0% | 25.45円 |
| 300円 | 930cr | 約3.2% | 70.20円 |
| 500円 | 1,600cr | 約6.3% | 106.75円 |
| 1,000円 | 3,300cr | 約9.1% | 192.99円 |

運営余力は売価から、AI原価0.150円、再試行分0.015円、認証・Workers・DBの予備費0.020円、不正・返金・障害の予備費0.020円を1crごとに引く。さらにStripe標準カード手数料3.6%と手数料にかかる消費税を足した概算3.96%、売上側の税の予備費10/110を引く。税の控除や実際の課税時期を確定するものではない。決済ごとの端数処理は別途確認する。[Stripe料金](https://stripe.com/jp/pricing) · [Stripe手数料の消費税](https://support.stripe.com/questions/taxes-on-stripe-fees-for-businesses-in-japan?locale=ja-JP) · [Stripe返金時の手数料](https://support.stripe.com/questions/understanding-fees-for-refunded-payments?locale=ja-JP)

Workers Paidの月額基本料を仮に800円として全額この機能に配賦すると、100円パックだけなら約32件/月で固定費を回収する。Workersの使用枠はアカウントで共有する。現在の構成は注文と残高にScyllaDBを使うため、従量試算にはWorkersと実測のGo・ScyllaDB運用費を入れる。未使用残高の失効は収支の前提に入れない。[Workers料金](https://developers.cloudflare.com/workers/platform/pricing/)

1. **認証・残高**。WebとAndroidで同じ残高が読める、WebでAIを実行できない、Go再起動や別ノード経由でもWebログインが続く。
2. **Stripeテスト購入**。Webhookと手動再確認を競合させ、付与が一度であることを確認する。全停止時の503、復旧後の同じ注文の再開、第三者の注文への拒否、全額返金も確認する。
3. **Android側の消費**。予約・成功時の確定・失敗時の返却を接続する。同時実行、残高不足、結果保存後の通信断を試す。AI処理全体の原価にはJev・失敗・再試行を含め、成功1枚あたりの平均と上振れ、購入から付与までの時間、返金・問い合わせの件数を記録する。
4. **販売判断**。4パックでテスト購入を確認する。実測値で原価と固定費の配賦を更新し、税・有効期限・返金方針・販売者表示を確認してから販売条件を確定する。
