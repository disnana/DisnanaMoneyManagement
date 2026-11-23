# Android認証の振り分けをCloudflareで設定する

Worker名は **`mane-auth-staging`**。共通入口は **`mane-auth-stg.disnana.com`**。既存の `node-a-stg.disnana.com` と `node-b-stg.disnana.com` は、それぞれのGoノードへのTunnelホストとして使う。

## 1. Workerの署名鍵を作る

Cloudflareを管理するPCで Ed25519 の鍵を生成する。既存の鍵を再利用する場合は生成コマンドを省く。

```bash
mkdir -p "$HOME/.config/mane-worker"
chmod 700 "$HOME/.config/mane-worker"
umask 077
mane_worker_key="$HOME/.config/mane-worker/worker-ed25519.pem"
test -e "$mane_worker_key" || openssl genpkey -algorithm ED25519 -out "$mane_worker_key"
openssl pkey -in "$mane_worker_key" -pubout -outform DER | openssl base64 -A
printf '\n'
```

最後の出力は公開鍵。node-aとnode-bの `MANE_WORKER_JWS_PUBLIC_KEY` にこの値を入れる。秘密鍵PEMはシークレットの登録に使う。[WorkersのEd25519対応](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/#supported-algorithms)

## 2. 既存のGoノードを更新する

Goのユーザーサービスから `nodetool` に届くよう、必要なら `MANE_NODETOOL_PATH` に実行ファイルの絶対パスを設定する。

```bash
cd ~/mane-auth
git pull --ff-only
nano ~/.config/mane/android-auth.env
bash scripts/mane-android-auth.sh setup
```

`nano` で以下を設定する。既存のGo設定はこの環境ファイルから読み込まれる。

| 項目 | node-a | node-b |
| --- | --- | --- |
| `MANE_NODE_ID` | `staging-a` | `staging-b` |
| `MANE_NODE_ORIGIN` | `https://node-a-stg.disnana.com` | `https://node-b-stg.disnana.com` |
| `MANE_WORKER_JWS_PUBLIC_KEY` | 手順1の公開鍵 | node-aと同じ公開鍵 |
| `MANE_WORKER_HEALTH_TOKEN` | 自分で生成した32文字以上のランダム値 | node-aと同じ値 |
| `MANE_NODETOOL_PATH` | 必要なら `command -v nodetool` で得たパス | 各サーバーのパス |

監視用の値は `openssl rand -hex 32` で作れる。Goの環境ファイルとWorkerのシークレットに保存する。`/_internal/scylla-status` はこの値を設定したGoで有効になる。更新後にメモリ上のセッションが失効するため、試験端末はGoogleログインから始める。

## 3. Workerをデプロイする

### Cloudflareの画面に貼り付ける

両ノードの既存チェックアウトを更新する。JSONの生成だけならサービスの再起動は不要。

```bash
git -C ~/mane-auth pull --ff-only
```

Windows側でも `prototype/android-account-receipt` のチェックアウトを更新し、リポジトリのルートで次を実行する。`staging-a` と `staging-b` は、各サーバーにSSHで入るときの接続先に置き換える。

```powershell
.\scripts\mane-worker-nodes.ps1 -Nodes staging-a,staging-b -Copy
```

コピーしたJSONを **Settings → Variables and Secrets** の `MANE_AUTH_NODES`（Text）に貼り付ける。生成時はSSH先の既存の `android-auth.env` からノードIDと公開URLを読み取り、同じサーバーの `nodetool info` からローカルのHost IDを取得する。各サーバーで `bash ~/mane-auth/scripts/mane-android-auth.sh worker-node` を実行すると、そのノード単体のJSONを確認できる。

### Wranglerでデプロイする

Cloudflareを管理するPCで次を実行する。Cloudflareのアカウントで `disnana.com` を管理していることを確認する。

```bash
cd apps/auth-worker
cp wrangler.example.toml wrangler.toml
npx wrangler login
```

`wrangler.toml` の `MANE_AUTH_NODES` に生成したJSONをシングルクォートで囲んで設定する。次は設定形式の例。

```toml
[vars]
MANE_AUTH_NODES = '[{"id":"staging-a","origin":"https://node-a-stg.disnana.com","scyllaHostID":"20ababab-0167-4c4b-a290-6d561b671cee"},{"id":"staging-b","origin":"https://node-b-stg.disnana.com","scyllaHostID":"c268fb05-e07f-4d36-b906-a65bdf96bb1d"}]'
```

```bash
npx wrangler deploy
mane_worker_key="$HOME/.config/mane-worker/worker-ed25519.pem"
openssl pkcs8 -topk8 -nocrypt -in "$mane_worker_key" -outform DER | openssl base64 -A | \
  npx wrangler secret put MANE_WORKER_JWS_PRIVATE_KEY
npx wrangler secret put MANE_WORKER_HEALTH_TOKEN
curl -i https://mane-auth-stg.disnana.com/auth/challenge
```

監視用シークレットの入力時にGoと同じ値を入れる。署名用シークレットは鍵ファイルからWranglerへ直接渡す。疎通確認のGETは `405` と `Allow: POST` が正常。WorkerのCustom Domainは `mane-auth-stg.disnana.com`。この名前に既存のCNAMEがある場合は、既存の用途を確認してから別の空いている名前を選べる。ノードのTunnel公開ホストは別の名前として運用する。[Workerのカスタムドメイン](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)・[Workerのシークレット](https://developers.cloudflare.com/workers/configuration/secrets/)

### WorkerからGoまで確認する

GETで確かめられるのはWorkerの入口。発行先まで試すには、使い捨ての端末公開鍵でチャレンジを要求する。Googleログインやセッション作成は発生しない。

```bash
mane_test_public_key=$(openssl ecparam -name prime256v1 -genkey -noout | \
  openssl pkey -pubout -outform DER | openssl base64 -A | tr -- '+/' '-_' | tr -d '=')
mane_test_hash=$(printf '' | openssl dgst -sha256 -r | cut -d ' ' -f 1)
mane_test_body=$(printf '{"operation":{"method":"POST","path":"/auth/google","body_sha256":"%s"},"device_public_key":"%s"}' \
  "$mane_test_hash" "$mane_test_public_key")
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Content-Type: application/json' --data "$mane_test_body" \
  https://mane-auth-stg.disnana.com/auth/challenge
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Content-Type: application/json' --data "$mane_test_body" \
  https://node-a-stg.disnana.com/auth/challenge
```

Worker経由は `200`、署名を付けずにnode-aへ送った依頼は `403` が期待値。node-bへの直接依頼も同様に `403` を確認できる。

## 4. AndroidのAABに接続先を入れる

GitHubのリポジトリ設定で **Secrets and variables → Actions → Variables** を開き、次の公開値を追加する。AABワークフローは、これらをExpoのビルドに渡す。ローカルビルドであれば、同じ名前を環境変数に設定する。

| 変数 | 値 |
| --- | --- |
| `MANE_AUTH_ENTRY` | `https://mane-auth-stg.disnana.com` |
| `MANE_GOOGLE_WEB_CLIENT_ID` | `433981502913-fuq95bpmu1tf6sfir5ui28b0vrnk7npb.apps.googleusercontent.com` |
| `MANE_GOOGLE_PROJECT_NUMBER` | `433981502913` |

最新の `apps/auth-worker/index.mjs` をCloudflareへデプロイしてから、Actionsの **Android Play bundle** をこのブランチで実行する。端末の接続先は `MANE_AUTH_ENTRY` の1件。Goノードの一覧はWorkerの `MANE_AUTH_NODES` に設定する。Playに上げるバージョンコードを確認し、アップロード鍵で署名したAABを内部テストに配布する。GoogleのADC、Worker監視トークン、Goの署名鍵はAndroidのビルド設定と別に管理する。[Androidでの認証試験](android-account-staging.md)

## WorkerからGoへの署名

Workerはログイン用の `POST /auth/challenge` ごとに Ed25519（JWSヘッダーは `alg=EdDSA`）で署名する。JWSには対象ノード、HTTPメソッドとパス、本文のSHA-256、5秒の有効期限、使い捨てIDを含める。Goで公開鍵を設定すると、未署名や誤った署名によるログイン用の発行依頼を403で拒否する。再利用の判定は各Goプロセスのメモリで行う。

この鍵は、Goが端末向けのチャレンジを認証する鍵、Access JWTの鍵、ScyllaDBステータスの監視用トークンと独立している。Goが保持するWorker用鍵は公開鍵。新しい鍵に交換する場合はステージングのWorkerと両Goを同じ切替作業で更新する。

## 振り分けとタイムアウト

各Goは同居するScyllaDBの `nodetool status` を10秒ごとにサンプリングする。実行上限は4秒。Workerは到着したリクエストに応じて、最大2ノードからこの情報をバックグラウンドで取得する。照会はWorkerインスタンスあたり5秒以上間隔を空け、30秒を過ぎた観測は候補の判定に使わない。[ScyllaDBのnodetool status](https://docs.scylladb.com/manual/stable/operating-scylla/nodetool-commands/status.html)

新規ログインでは `UN` の候補を優先して順序をランダムに決める。新鮮な観測がすべて停止を示すノードは候補から外す。観測なしの場合と全候補が外れた場合は、設定済みのノードへの要求結果で判断する。現時点の試験値は追加要求まで200ms、1ノードの上限700ms、振り分け全体で1.5秒。最大2件を並行させ、通信障害や5xxでは次へ進む。最初の正しい発行応答を採用し、未採用の発行済みIDはGoで5秒後に失効する。

発行したGoは端末署名を検証し、原子的にIDを消費する。Androidはすべての認証リクエストを共通のWorker URLに送り、Workerが発行元IDを `MANE_AUTH_NODES` で解決する。セッションがGoプロセスのメモリにある間、残高・トークン更新・ログアウトは発行元と同じノードで処理する。発行元が停止中は、そのセッションの操作は失敗する。別ノードで既存セッションを続けるには共有セッションストアが必要。実測では、チャレンジ応答の `Server-Timing: mane-route` と、Google・端末署名まで含むログイン時間を個別に記録する。

## 認可後の直結をステージングで試す

1. 共有ScyllaDBのステージングkeyspaceで [Androidセッションのスキーマ](../apps/server/internal/androidauth/session_schema.cql) を適用する。
2. 両Goノードに `MANE_ANDROID_SHARED_SESSIONS=1` を設定する。Androidの署名鍵はノードごとに管理する。Webの読み取りも試す場合は両ノードに `MANE_WEB_DIRECT_SITE_ORIGIN=https://dmm.disnana.com` を設定する。既存のWorker署名公開鍵を引き継ぐ。Androidの旧メモリセッションからは一度ログインし直す。
3. 両ノードのTunnelがAndroidの `/auth/challenge` と認可後のAPIおよびWebの `/v1/shop-read/*` に到達できることを確認する。WebのCSPが指定する `node-a-stg.disnana.com` と `node-b-stg.disnana.com` を使う。別のホスト名を使う場合はショップと履歴の両HTMLの `connect-src` も更新する。
4. 対応版WorkerとWebページを配置し、Workerの `MANE_DIRECT_NODES_ENABLED=1` を設定する。Androidで試すには対応ビルドを使う。

Androidはログイン後、応答の `origin` にチャレンジと操作を直接送る。読み取りの通信障害時は `POST /auth/node` で別ノードを取得し、そのノードでScyllaDBのセッションと端末署名を照合してAPI用トークンを更新する。新旧のトークンはそれぞれ担当ノードでのみ受理される。更新トークンのローテーション等が実行された可能性がある操作は自動再送を抑止する。更新成功後に応答を失った場合は、再ログインが必要になることがある。

Webはログイン後に `GET /api/shop/node` で担当ノードとそのノードで5分間有効な読み取り権限を受け取る。残高と履歴はGoへ直接送り、Goが読み取り権限とScyllaDBの親セッションを照合する。通信障害時は失敗したノードを割り当てから外して同じページを読み直す。GoogleログインとStripe決済・Webhookは既存Workerが処理する。
