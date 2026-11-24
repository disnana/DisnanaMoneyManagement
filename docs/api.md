# Android認証API

Android認証のHTTPハンドラは `apps/server/internal/androidauth`。本接続試験は独立した `cmd/mane-android-auth` を起動する。配備時のクライアントはHTTPSを使う。

| 接続先 | メソッドとパス | 成功時 |
| --- | --- | --- |
| 共通入口 | POST `/auth/challenge` | チャレンジ、ID、発行ノード名、固定の応答先オリジン、5,000msをJSONで返す |
| 指定ノード | POST `/auth/google` | GoogleとPlay Integrityと端末署名を確認し、セッション・Access・Refreshを返す |
| 指定ノード | GET `/v1/me` | セッションに結び付いたGoogleの `sub` を返す |
| 指定ノード | GET `/v1/credits` | 署名済みセッションの `available_credits` を返す。残高を取得できない場合は503 |
| 指定ノード | POST `/auth/refresh` | セッションIDと現在のRefreshを検証し、新しいAccess・Refreshを返す |
| 指定ノード | POST `/auth/logout` | 発行済みのAccessを含め失効させ、204を返す |

発行要求の `operation` は `method`、`path`、`body_sha256`。ログインの発行時は `device_public_key`、更新の発行時は `session_id`、本人情報・ログアウトの発行時はAuthorizationヘッダーを添える。ログイン本文は `id_token`、`integrity_token`、`device_public_key`。更新本文は `session_id` と `refresh_token`。本文のない操作のハッシュは空バイト列のSHA-256。対象パスにクエリは許可しない。セッション応答は `issuer_node_id`、`session_id`、`access_token`、`refresh_token`、`expires_at`（Unix秒）。

指定ノードへの要求には `X-Mane-Challenge`、`X-Mane-Request-Id`、`X-Mane-Device-Signature` を付ける。署名入力はUTF-8の `mane-device-proof-v1\n` とチャレンジ文字列の連結。公開鍵と署名はパディングなしbase64urlのDER。チャレンジはbase64urlのJSONとHMACをピリオドで結ぶ。認証情報を含む応答はキャッシュ禁止。400は入力不正、401は認証・期限・使用済み・宛先の不一致、503は発行枠の逼迫等。レスポンスにトークン検証の内部エラーを含めない。

後続の候補には `/v1/credit-packs`、`/v1/billing/verify`、`/v1/ai/receipt-jobs`、`/v1/discount`、`/v1/feedback`、`/health/live` と `/health/ready` がある。AdMob SSVの公開コールバックはGoogleからのGETを原文の署名対象で検証する。Androidの端末署名とは別経路。[AdMob SSV](https://developers.google.com/admob/android/ssv)

## AIレシートの実装計画

端末署名を検証した担当Goノードで画像を受け取り、ジョブの状態をScyllaDBで共有する予定。受付・再送・確定時のクレジット処理と、Androidの撮影補助をまとめた。 [AIレシートの実装計画](ai-receipt-plan.md)
