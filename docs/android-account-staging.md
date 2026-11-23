# AndroidでGoogleログインを確認する

Androidの設定に「Googleアカウント」を追加した。ログインすると「AIレシート」のクレジット残高、再読み込み、ログアウトを使える。GoogleログインはCredential Manager、アプリと端末の判定はPlay Integrity。セッションは端末のKeystoreで暗号化し、バックアップ対象外の領域に保存する。ログアウトはサーバー側で失効した後、端末からセッションを削除する。

## 試験先

`apps/server` で `go run ./cmd/mane-android-auth` を起動する。単一ノードのステージング専用で、セッションはプロセス再起動時に失効する。共通入口と指定ノードのHTTPSホストを同じGoプロセスへルーティングする。2つ以上のプロセスで共有するにはScyllaDBリポジトリが必要。

| 環境変数 | 対象 | 値 |
| --- | --- | --- |
| `MANE_AUTH_STAGING` | Go | `1` |
| `MANE_AUTH_LISTEN` | Go | 省略時 `127.0.0.1:8081`。ローカルのHTTPSプロキシまたはTunnelから接続 |
| `MANE_NODE_ID` / `MANE_NODE_ORIGIN` | Go、Expo | ノード名と公開HTTPSオリジン。パスや末尾スラッシュを含めない |
| `MANE_AUTH_ENTRY` | Expo | チャレンジ発行用の共通HTTPSオリジン |
| `MANE_GOOGLE_WEB_CLIENT_ID` | Go、Expo | アプリからGoogleへ指定するOAuthのウェブクライアントID |
| `MANE_GOOGLE_PROJECT_NUMBER` | Expo | Play Integrityに接続したGoogle Cloudプロジェクト番号 |
| `MANE_CHALLENGE_KEY` / `MANE_JWT_SEED` / `MANE_JWT_KID` | Go | パディングなしbase64urlのランダム鍵（32バイト以上）、Ed25519用32バイトseed、鍵ID |
| Google ADC | Go | linked project の権限を持つ専用のGoogle資格情報。例として `GOOGLE_APPLICATION_CREDENTIALS` から参照する |
| `MANE_STAGING_CREDITS_FILE` | Go | 任意のステージング残高ファイル。Googleの `sub` をキー、整数クレジットを値とするJSON。省略時・未登録ユーザーは503 |

`MANE_GOOGLE_WEB_CLIENT_ID`、プロジェクト番号、公開ホストはアプリのビルド設定。ADCと署名鍵はGo側にのみ渡す。

## 端末で試す

1. OAuthのウェブクライアントと、`com.disnana.mane_chan`・Play App SigningのSHA-1を持つAndroidクライアントを対応させる。Play Integrity APIを連携済みのプロジェクトで有効化する。既設のアプリとテスト用設定を使用する。[Googleログイン](https://developer.android.com/identity/sign-in/credential-manager-siwg-implementation)・[Play Integrityの設定](https://developer.android.com/google/play/integrity/setup)
2. Expo Goではカスタムネイティブモジュールを読み込めない。上のExpo設定を渡したAndroidビルドをGoogle Playの承認済みテストトラックで配り、Playからインストールする。
3. 設定→Googleアカウント→Google で続ける。選択キャンセル、成功、残高取得、通信エラー、アプリ再起動後のログイン状態、ログアウトを確認する。残高設定がない試験アカウントと、残高ゼロを設定したアカウントは見た目で区別できる。
4. 結合時はGoogle 公開鍵キャッシュが冷たい状態、Play Integrity decode、低速回線の組み合わせで5秒条件を計測する。実際の判定を測ってからリリース可否を判断する。

ステージング残高は固定の確認用データ。購入、クレジット消費、AI解析、広告割引を接続する段階では永続ストアを使用する。
