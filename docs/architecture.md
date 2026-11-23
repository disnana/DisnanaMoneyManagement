# Androidのアカウント・AI基盤

対象は `main` の `79759a6` から切った `prototype/android-account-receipt`。この変更は設計と最初のローカル認証PoC。依存は現行のExpo SDK 58、Expoローカルモジュール、既存GoモジュールにあるJWTライブラリ。

## 現行コードで確認したこと

- アプリはAndroidとiOSの画面をExpoで共有。Android固有機能は `apps/mobile/modules` に置ける。家計の記録先は端末のSQLiteで、端末ロックにはExpoのLocal Authenticationを使う。今回のGoogleアカウントは端末ロックと別で、導入時も家計の手入力にネット接続を要求しない。
- 現行Go同期APIはWebAuthnと独自セッショントークンを使う。SQLiteとPostgreSQLが稼働する構成で、`scylla://` は未実装。Googleログインを既存WebAuthn利用者へメールアドレスで自動統合すると、別サービスの本人確認を誤って結び付ける。
- リポジトリから本番のTunnel、公開DNS、Tailscale、既存ScyllaのIP・権限・ノード性能は確認できなかった。3ノード、`datacenter1`、RF=3は依頼書の前提。本番への接続・性能計測は未実施。

## 確定している構成

Androidは共通HTTPS入口にチャレンジを要求する。Cloudflare WAFとTunnelを通じて健全なGoノードが受け付け、固定対応表の自ノード専用HTTPSオリジンを返す。Androidはそのノードに署名付きの実操作を送る。発行済みIDは発行ノードのメモリで管理する。認証セッション・購入・ジョブ・報酬はアプリ専用のScyllaDB keyspaceで保持する。内部通信へTailscaleを使う場合も、Go APIへ到達可能な主体をACLで絞る。

共通入口はCloudflare Load Balancingと独立したノード別Tunnelを推奨候補とする。共通ホストのpoolでノードを選び、個別ホストは各ノードに固定する。共通入口の監視はreadinessに向け、新しいチャレンジを受けない状態を検出する。Tunnelコネクタのレプリカは接続冗長化として扱う。共通入口の振り分け・状態監視に使う製品契約、実ドメイン、モニター間隔と費用は保留。利用中のCloudflare契約で条件を確かめる。[CloudflareのTunnelとLoad Balancing](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-availability/)

画像は複数枚で1件の解析ジョブ。大きな本文は5秒の発行後に転送すると低速回線で間に合わない可能性がある。通常アップロードと状態変更を分け、先に上限付きの一時アップロードを行い、完了後に画像IDとハッシュを含む小さな本文で解析開始を署名する案を推奨する。ストレージの選定・最大容量・期限はモバイル回線の実測後に確定する。アップロード枠を発行するときと解析開始時に本人・ジョブ所有権を確かめる。

## 実装段階

1. このブランチでPoC。GoのHTTPハンドラ、鍵登録・署名のAndroidローカルモジュール、テスト内のGoogle署名検証とIntegrityモック。
2. Scyllaの隔離環境でCQL・リポジトリ・LWTを検証。JWT公開鍵とセッションの失効を両ノードで照合。Credential Manager、Google公開鍵取得と更新、実Play Integrityを専用Androidビルドで接続する。
3. 複数画像モック解析と試算・予約・精算を結合。見直し画面を既存の支出入力へつなぎ、正式登録は利用者が確定する。
4. 初回クローズドテストの範囲にPlayのテスト購入、AdMobテスト広告のSSV、残高・費用明細・割引表示、利用者自身が選んで送る意見導線を含める。実価格・割引率・再視聴ルール、実販売と広告配信の承認は別途必要。

[認証PoCと試験方法](auth-security.md)・[API](api.md)・[ScyllaDB設計](scylladb.md)・[料金・購入・広告](credits-billing-ads.md)
