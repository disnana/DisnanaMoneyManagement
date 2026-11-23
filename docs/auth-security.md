# Android認証と5秒チャレンジ

## 接続の順序

1. Android Keystoreでインストール単位のP-256鍵を作り、公開鍵のDERを取得する。秘密鍵をエクスポートする経路は持たない。Credential ManagerでGoogle IDトークンを得る。Googleのアカウント選択は5秒の窓を開始する前に行う。[Credential Manager](https://developer.android.com/identity/sign-in/credential-manager-siwg)
2. Play Integrityの標準APIでは、事前にproviderを準備し、ログイン対象に結び付いた `requestHash` を指定する。PoCの値は `SHA256("mane-login-integrity-v1\n" + SHA256(google_id_token) + "\n" + SHA256(public_key_der))` の小文字16進。Goの本接続はGoogle側のdecode結果からパッケージ・ハッシュ・時刻・`PLAY_RECOGNIZED`・`MEETS_DEVICE_INTEGRITY` を照合する。[Play Integrity標準リクエスト](https://developer.android.com/google/play/integrity/standard)
3. 本文の送信バイト列を確定し、そのSHA-256、HTTPメソッド、パスを共通入口に送る。Goノードが乱数ID・発行時刻・対象操作・端末またはセッションとの結び付けをHMAC付きで返す。応答先はクライアントの許可表にある発行ノードだけ。Androidはチャレンジ文字列にドメイン分離用の接頭辞を付けてSHA256withECDSAで署名し、同じ本文を送る。
4. 発行ノードがHMAC、ノード、ID、本文、端末署名を確かめる。ログインではGoogleトークンのRS256署名・発行者・audience・期限・`sub` とIntegrityを照合する。既存セッションではトークンと登録端末を照合する。受理直前に発行から5秒未満か確認し、IDを原子的に消費する。別ノードへの転送・IDの再利用は行わない。[Google IDトークン検証](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)

JWTはEd25519、`kid` 付き、10分。Refresh Tokenは乱数を発行しサーバーにSHA-256を保存。14日の有効期間内に正しい端末署名で更新されたときだけ、旧値から新値へ原子的に交換する。ログアウトはセッションを削除する。このPoCは単一の共有署名鍵と1プロセスのセッションストアで動く。本接続には鍵の保管、複数の検証鍵の配布と10分以上の重複期間、端末停止と全セッション失効、複数ノードの永続ストア、端末のセッション秘密情報保管が必要。

ノード障害時は、Androidがチャレンジ応答の受信から最大5秒を待つ。これは端末とノードの時計差を使わずに旧IDの期限を過ぎる保守的な待ち方。読み取りは共通入口で新規IDを取得して一度再試行する。結果が曖昧な書き込みは自動送信を行わず、購入・ジョブは業務IDから結果確認できる段階で再試行を追加する。チャレンジIDで業務の重複確定まで防げるわけではない。

## ローカルでの再現

`apps/server` で `go test -race -v ./internal/androidauth`。テストがループバック上に別々のHTTPノードを作る。Google RSA鍵・端末P-256鍵・JWT鍵はその場で生成し、外部トークンや資格情報は不要。Integrity decoderはテスト専用。テスト時計を5秒進めて期限境界と旧ノードの停止、次のノードでの新規発行を確認する。Androidネイティブ鍵の生成・署名は専用ビルドで検証する。

## 本接続の確認項目

- Googleの公開鍵取得・キャッシュ、ログイン用の使い捨てnonce、実Integrity decodeをつなぐ。登録環境でnonce・その端末鍵・リクエストの対応、Play判定、クォータを確認する。
- Google鍵キャッシュミスとIntegrity decodeを含む認証のp95を測る。5秒を超過するケースがあれば、変更案はまず外部検証と端末登録の準備を先に行い、短い確定要求だけを5秒内に置く。PoCでは確定時に5秒以上なら拒否する。
- Androidの通信にはリダイレクトを拒否するExpo Fetchを指定。専用ビルドでリダイレクト、ネットワーク中断と再試行時の経路を実測する。端末鍵のハードウェア保護を必須にする範囲は対応端末の調査後に判断する。
- Go共通入口と専用公開ホストの経路、WAFの発行レート制限、chronyによる時計同期、ログへの本文・ヘッダー非出力を専用環境で確認する。
