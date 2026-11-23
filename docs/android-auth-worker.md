# Android認証の振り分けをCloudflareで設定する

Worker名は **`mane-auth-staging`**。共通入口は **`mane-auth-stg.disnana.com`**。既存の `node-a-stg.disnana.com` と `node-b-stg.disnana.com` は、それぞれのGoノードへのTunnelホストとして使う。

## 1. 既存のGoノードを更新する

各サーバーでGoの実行ユーザーとして `nodetool status` を実行し、一覧の **Host ID** とサーバーの対応を控える。Worker設定にはIPアドレスの代わりにHost IDを使う。Goのユーザーサービスから `nodetool` に届くよう、必要なら `MANE_NODETOOL_PATH` に実行ファイルの絶対パスを設定する。

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
| `MANE_WORKER_HEALTH_TOKEN` | 自分で生成した32文字以上のランダム値 | node-aと同じ値 |
| `MANE_NODETOOL_PATH` | 必要なら `command -v nodetool` で得たパス | 各サーバーのパス |

監視用の値は `openssl rand -hex 32` で作れる。Goの環境ファイルとWorkerのシークレットに保存する。`/_internal/scylla-status` はこの値を設定したGoで有効になる。更新後にメモリ上のセッションが失効するため、試験端末はGoogleログインから始める。

## 2. Workerをデプロイする

Cloudflareを管理するPCで次を実行する。Cloudflareのアカウントで `disnana.com` を管理していることを確認する。

```bash
cd apps/auth-worker
cp wrangler.example.toml wrangler.toml
npx wrangler login
```

`wrangler.toml` の `MANE_AUTH_NODES` で各ノードの `scyllaHostID` を追加する。IDとHTTPSオリジンは上のGo設定と一致させる。次のUUIDは例なので、実際の `nodetool status` の値に置き換える。

```toml
[vars]
MANE_AUTH_NODES = '[{"id":"staging-a","origin":"https://node-a-stg.disnana.com","scyllaHostID":"20ababab-0167-4c4b-a290-6d561b671cee"},{"id":"staging-b","origin":"https://node-b-stg.disnana.com","scyllaHostID":"c268fb05-e07f-4d36-b906-a65bdf96bb1d"}]'
```

```bash
npx wrangler deploy
npx wrangler secret put MANE_WORKER_HEALTH_TOKEN
curl -i https://mane-auth-stg.disnana.com/auth/challenge
```

シークレットの入力時にGoと同じ値を入れる。疎通確認のGETは `405` と `Allow: POST` が正常。WorkerのCustom Domainは `mane-auth-stg.disnana.com`。この名前に既存のCNAMEがある場合は、既存の用途を確認してから別の空いている名前を選べる。ノードのTunnel公開ホストは別の名前として運用する。[Workerのカスタムドメイン](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)・[Workerのシークレット](https://developers.cloudflare.com/workers/configuration/secrets/)

## 3. AndroidのAABに接続先を入れる

GitHubのリポジトリ設定で **Secrets and variables → Actions → Variables** を開き、次の公開値を追加する。AABワークフローは、これらをExpoのビルドに渡す。ローカルビルドであれば、同じ名前を環境変数に設定する。

| 変数 | 値 |
| --- | --- |
| `MANE_AUTH_ENTRY` | `https://mane-auth-stg.disnana.com` |
| `MANE_ANDROID_AUTH_NODES` | `{"staging-a":"https://node-a-stg.disnana.com","staging-b":"https://node-b-stg.disnana.com"}` |
| `MANE_GOOGLE_WEB_CLIENT_ID` | `433981502913-fuq95bpmu1tf6sfir5ui28b0vrnk7npb.apps.googleusercontent.com` |
| `MANE_GOOGLE_PROJECT_NUMBER` | `433981502913` |

Actionsの **Android Play bundle** をこのブランチで実行する。Playに上げるバージョンコードを確認し、アップロード鍵で署名したAABを内部テストに配布する。GoogleのADC、Worker監視トークン、Goの署名鍵はAndroidのビルド設定と別に管理する。[Androidでの認証試験](android-account-staging.md)

## 振り分けとタイムアウト

各Goは同居するScyllaDBの `nodetool status` を10秒ごとにサンプリングする。実行上限は4秒。Workerは到着したリクエストに応じて、最大2ノードからこの情報をバックグラウンドで取得する。照会はWorkerインスタンスあたり5秒以上間隔を空け、30秒を過ぎた観測は候補の判定に使わない。[ScyllaDBのnodetool status](https://docs.scylladb.com/manual/stable/operating-scylla/nodetool-commands/status.html)

新規ログインでは `UN` の候補を優先して順序をランダムに決める。新鮮な観測がすべて停止を示すノードは候補から外す。観測なしの場合と全候補が外れた場合は、設定済みのノードへの要求結果で判断する。現時点の試験値は追加要求まで200ms、1ノードの上限700ms、振り分け全体で1.5秒。最大2件を並行させ、通信障害や5xxでは次へ進む。最初の正しい発行応答を採用し、未採用の発行済みIDはGoで5秒後に失効する。

発行したGoは端末署名を検証し、原子的にIDを消費する。単一Goプロセスのメモリにセッションを保存している間は、発行元のノードIDを端末に保存し、残高・トークン更新・ログアウトを同じノードで扱う。別ノードで既存セッションを続けるには共有セッションストアが必要。発行後のGo停止はチャレンジの5秒窓を過ぎてから再ログインする。実測では、チャレンジ応答の `Server-Timing: mane-route` と、Google・端末署名まで含むログイン時間を個別に記録する。
