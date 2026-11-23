# AndroidでGoogleログインを確認する

Androidの設定に「Googleアカウント」を追加した。ログインすると「AIレシート」のクレジット残高、再読み込み、ログアウトを使える。GoogleログインはCredential Manager、アプリと端末の判定はPlay Integrity。セッションは端末のKeystoreで暗号化し、バックアップ対象外の領域に保存する。ログアウトはサーバー側で失効した後、端末からセッションを削除する。

## Linuxサーバーでのセットアップと削除

systemdを使うLinuxで、サービスを動かすユーザーとして実行する。Git、`apps/server/go.mod` に記載のGo、OpenSSLが必要。GoogleサービスアカウントのJSONは、そのユーザーが読めるアクセス権で事前に配置する。

```bash
git clone --branch prototype/android-account-receipt --single-branch \
  https://github.com/disnana/DisnanaMoneyManagement.git mane-auth
cd mane-auth
bash scripts/mane-android-auth.sh setup \
  https://node-a-stg.example.com "YOUR_WEB_CLIENT_ID.apps.googleusercontent.com" \
  "$HOME/.config/mane/play-integrity.json"
```

実際のノード用HTTPSオリジンとウェブOAuthクライアントIDに置き換える。JSONは絶対パスで指定する。既定位置に置いた場合は第三引数を省略できる。初回に生成する署名鍵と設定は `~/.config/mane/android-auth.env` に保存する。XDG設定を指定している場合はそのディレクトリを使う。ノードIDは `staging-a`、待ち受けは `127.0.0.1:8081`。HTTPSホストは既存のTunnelでこの待ち受けにルーティングする。

```bash
bash scripts/mane-android-auth.sh status
journalctl --user -u mane-android-auth.service -n 30 --no-pager
```

更新とアンインストールは同じcheckoutから実行する。

```bash
git pull --ff-only
bash scripts/mane-android-auth.sh setup
```

```bash
bash scripts/mane-android-auth.sh uninstall
```

更新では設定と署名鍵を引き継ぐ。セッションはGoプロセスのメモリにあるため、再起動後はAndroidから再ログインする。アンインストールはユーザーサービスを停止・無効化し、ユニットとバイナリを削除する。設定、GoogleのJSON、Git checkoutは再セットアップに使える。SSHからログアウトした後も稼働させるには、サーバー管理者が実行ユーザーのsystemd lingerを有効にする。

## 試験先

2台のGoから新規ログインの発行先を選ぶ場合は、[Cloudflare Workerの設定](android-auth-worker.md)を使う。

`apps/server` で `go run ./cmd/mane-android-auth` を起動する。単一ノードのステージング専用で、セッションはプロセス再起動時に失効する。共通入口と指定ノードのHTTPSホストを同じGoプロセスへルーティングする。2つ以上のプロセスで共有するにはScyllaDBリポジトリが必要。

| 環境変数 | 対象 | 値 |
| --- | --- | --- |
| `MANE_AUTH_STAGING` | Go | `1` |
| `MANE_AUTH_LISTEN` | Go | 省略時 `127.0.0.1:8081`。ローカルのHTTPSプロキシまたはTunnelから接続 |
| `MANE_NODE_ID` / `MANE_NODE_ORIGIN` | Go | ノード名と公開HTTPSオリジン。パスや末尾スラッシュを含めない |
| `MANE_AUTH_ENTRY` | Expo | 認証・残高取得に使う共通WorkerのHTTPSオリジン |
| `MANE_GOOGLE_WEB_CLIENT_ID` | Go、Expo | アプリからGoogleへ指定するOAuthのウェブクライアントID |
| `MANE_GOOGLE_PROJECT_NUMBER` | Expo | Play Integrityに接続したGoogle Cloudプロジェクト番号 |
| `MANE_CHALLENGE_KEY` / `MANE_JWT_SEED` / `MANE_JWT_KID` | Go | パディングなしbase64urlのランダム鍵（32バイト以上）、Ed25519用32バイトseed、鍵ID |
| Google ADC | Go | linked project の権限を持つ専用のGoogle資格情報。例として `GOOGLE_APPLICATION_CREDENTIALS` から参照する |
| `MANE_STAGING_CREDITS_FILE` | Go | 任意のステージング残高ファイル。Googleの `sub` をキー、整数クレジットを値とするJSON。ファイルを省略した場合や未付与のテスターの残高は0 |
| `MANE_SCYLLA_HOSTS` など | Go | [ScyllaDBの残高を使う試験用設定](scylladb.md#ステージングのクレジット台帳)。残高ファイルとは排他 |

`MANE_GOOGLE_WEB_CLIENT_ID`、プロジェクト番号、公開ホストはアプリのビルド設定。ADCと署名鍵はGo側にのみ渡す。

## 端末で試す

1. OAuthのウェブクライアントと、`com.disnana.mane_chan`・Play App SigningのSHA-1を持つAndroidクライアントを対応させる。Play Integrity APIを連携済みのプロジェクトで有効化する。既設のアプリとテスト用設定を使用する。[Googleログイン](https://developer.android.com/identity/sign-in/credential-manager-siwg-implementation)・[Play Integrityの設定](https://developer.android.com/google/play/integrity/setup)
2. Expo Goではカスタムネイティブモジュールを読み込めない。上のExpo設定を渡したAndroidビルドをGoogle Playの承認済みテストトラックで配り、Playからインストールする。
3. 設定→Googleアカウント→Google で続ける。選択キャンセル、成功、残高取得、通信エラー、アプリ再起動後のログイン状態、ログアウトを確認する。未付与のテスターには0が表示され、通信エラーの場合は残高を取得できなかったことが表示される。
4. 結合時はGoogle 公開鍵キャッシュが冷たい状態、Play Integrity decode、低速回線の組み合わせで5秒条件を計測する。実際の判定を測ってからリリース可否を判断する。

ステージングの残高には、固定の確認用データまたはScyllaDBの台帳を使える。Play購入とAI解析の精算を実装する際は、ScyllaDBの台帳に接続する。
