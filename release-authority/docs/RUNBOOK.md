# 初回設定と障害時対応

## 有効化前

1. 独立したRelease CIの所有者・固定SHA・テスト合格を確認する。Gradle Wrapper配布物の公式チェックサム、dependency verification/locking、テスト、BunとGradleの監査、SBOMと来歴の受け入れ条件を設定する。
2. ステージングで別アカウント/アプリのテスト鍵を使い、GatewayとPrivate Signerを接続する。台帳はSignerが所有する。実鍵やGoogleの本番認証を登録する前に管理者承認を得る。
3. 管理者ホストはCloudflare Accessで管理者のみ許可し、信頼できるIdP、MFA、短いセッションを設定する。BypassおよびService Authの許可は管理者経路に付けない。プレビューURL、workers.dev、余計なrouteを無効にする。iPhoneのSafariでセッション切れとMFAを確認する。
4. CI APIとSignerのBindingは独立管理。実リポジトリとownerの不変ID、固定ref、個別audience、用途別Secret、再利用先のworkflow refとSHAを許可する。CIにCloudflare管理権限を付与しない。
5. Play Consoleのアプリ署名画面でアップロード証明書のSHA-256・鍵種別・鍵長を確認する。配布用証明書の値とは別です。トラックIDはPlay APIの一覧で照合し、WIFサービスアカウントに対象アプリのテストトラック権限だけを付与できるか確認する。最初はテストの下書きだけで、審査提出は管理者が行う。
6. 本番公開より前に、cold/warm、JWKS miss、正常/異常HTTP、DO同時実行、台帳永続化障害、WIF、Play結果不明を実環境で検証し、利用枠と実行予算を決定する。[Workers limits](https://developers.cloudflare.com/workers/platform/limits/) · [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)

## Wrangler / 環境設定の雛形

[Gateway設定例](../wrangler.gateway.example.toml) と [Signer設定例](../wrangler.signer.example.toml) を使います。Signer側の `new_sqlite_classes` で台帳を作成し、Gateway側は `ApprovalIntake` と `VerifierIntake` のService Bindingのみ設定します。ステージングの名前は `disnana-release-gateway-staging` と `disnana-release-signer-staging` を使います。GatewayへCustom Domainを登録する前に、`release-stg.disnana.com` にAccessを設定してください。

`RELEASE_INTAKE_ENABLED` は初期値 `false`。ローカル検証ではテスト設定でのみ `true` にしています。Signerの署名実行とPlay結果の記録は次の統合段階で接続します。

| 保存先 | 設定候補 |
| --- | --- |
| Gateway | `APPROVAL_ORIGIN`、`VERIFIER_ORIGIN`、二つの名前付きService Binding |
| Signerの認証設定 | `ACCESS_POLICY` にAccessのteam、audience、管理者のsub allowlist。`VERIFIER_POLICY` に固定ref、repo/ownerの数値ID、reusable workflow SHA、個別audienceとSecretのSHA-256 |
| Signerのリリース設定 | `RELEASE_POLICY` にアプリID・package・repo・許可track・鍵IDと公開証明書SHA-256・ポリシーバージョン |
| 台帳 | アプリ単位のSQLite DO、鍵とポリシーの版、署名停止フラグ、保持期間、外部アンカーの保存先 |
| Signer | アップロード鍵のPKCS#8、公開証明書とSHA-256、鍵ID、固定アルゴリズム。同環境の隔離されたSecretsへ直接登録 |
| Publisher | WIF provider、専用アカウント、Play APIのtrack ID、参照する信頼済みreceipt設定。長期のアカウント鍵JSONは作成しない |

## ログの保管期間案

- 正規の監査記録は30日を初期目安とします。申請・承認・署名と、接続後のPlay操作は、Signerが所有するSQLite台帳に記録します。
- デバッグ・運用診断ログは7日を目安とします。Cloudflare標準の保存期間は契約とログの種類を確認し、7日の保持を設定できない場合は保存先を別途判断します。認証失敗の全件をSQLiteに書き込みません。
- 自動削除の導入条件は、削除境界のハッシュを保管して残った監査チェーンを検証できることと、消費済みバージョンコードを監査ログとは別に保持できることです。どちらも動作確認してから削除を有効にします。

## 結果不明・緊急停止・鍵の更新

- 署名が `SIGNING` で途切れたら、未確認の結果を再署名しない。監査の最後のハッシュと署名予約を確認し、期限経過後は隔離する。隔離解除は運用の追加承認を通して行う。
- PlayへのAPI呼び出しが途切れたら、対象版のbundleとtrackの状態をPlay Consoleまたは読み取りAPIで確認する。事実が確認できるまで同じeditの自動再実行や審査送信をしない。
- 漏洩の疑いがあればSignerの緊急停止、CIのアプリ権限停止、WIFとAccessセッションの失効、未承認要求の失効を実施する。すでに配布された版への対応はPlay Consoleで判断する。
- アップロード鍵の変更時はPlayの正式な鍵リセットで新しい公開証明書を登録。鍵ID・証明書指紋・ポリシー版を更新し、旧版の要求を作り直す。receipt鍵とCI Secretは独立に更新し、どの鍵で署名したかを監査する。
- 監査の外部バックアップには署名付きチェックポイントを使う。JWTやCookie、秘密鍵は保存対象に含めない。
