# 構成

## 既存環境の確認

- アプリのベースは `d2ec865a24ede75069d9695bf166edf9fa63aa18`。Expo SDK 58、React Native 0.88.1、Bun 1.4.4。既存AndroidのビルドはJDK 17を使い、生成したGradle Wrapperは9.4.1。Wrapper配布物の `distributionSha256Sum` は生成された設定に見当たりません。
- パッケージ `com.disnana.mane_chan`、版 `1.0.0`、コード `6` とコミットは、Actions成果物のAABマニフェストで確認。既存のGitHub検証ではビルド・来歴証明ジョブが成功し、Playジョブはスキップされました。取得したAABをさらに `gh attestation verify` で照合し、main、ソースSHA、署名ワークフロー、GitHub-hosted runnerの制約で成功しました。[Actions実行](https://github.com/disnana/DisnanaMoneyManagement/actions/runs/45284819969)
- Play Integrity 1.5.0とDeviceProof、既存のアプリ保護、Go認証、Cloudflareのログイン経路は、このブランチの変更範囲外です。Worker/Goの設計は `origin/prototype/web-shop-shared-worker` の `apps/auth-worker`、認証手順、ScyllaDB設定例で確認。リリース基盤に運用中のログイン用鍵、Worker、ScyllaDBを流用する必要はありません。
- 従来のアップロード鍵名とエイリアスは運用記録にあります。実証明書の署名アルゴリズム・鍵長・SHA-256とPlay上のトラック識別子は未確認です。既存のPlayワークフローはEnvironment変数でトラックを受け取り、作業ログではテスト対象です。実値はPlay Consoleと読み取り権限で照合します。

## 信頼境界と処理

| コンポーネント | 入出力 | 信頼と制約 |
| --- | --- | --- |
| Build CI | ソース → unsigned AAB・SBOM・監査結果・来歴 | 権限はビルドに限定。固定依存、Bun監査、Gradle検証、テストを将来の品質ゲートにする |
| 独立 Verifier CI | artifact IDから取得したAAB → manifest、proof、署名属性 | アプリのコードを実行せず、固定した検証ツールで由来・形式・内容を確認。別リポジトリの固定SHAを推奨 |
| CI Gateway | OIDCと用途別Secret・検証証明 → 登録要求 | CI用ホスト。未認証のリクエストは台帳に書かない。実行IDとartifactを束縛 |
| Approval | Access JWT・管理者・固定manifest → 承認 | 管理者用ホスト、Access JWTをWorkerでも照合。ブラウザの長押しと台帳の8秒制限を併用 |
| Private Signer | 承認されたCMS属性 → RSA署名とハッシュ | 署名開始と監査を同時に保存し、署名と鍵指紋を検証。鍵はSignerに限定。GatewayにSignerのBindingを配布しない |
| Finalizer / Publisher | 同じAABと署名 → 検証済みAAB・PlayへのAAB登録・receipt | 固定CI、WIF、手動再開。Playのハッシュを照合し、トラック割り当て、下書き、審査提出はPlay Console |

## Cloudflareは2 Worker

- GatewayはCI APIと承認画面の入口を担当し、ホストと経路で振り分けます。Accessは承認ホスト全体に適用します。
- Signerのデプロイ単位にSQLite Durable Objectを置きます。Gatewayは名前付き `ApprovalIntake`、`VerifierIntake`、`FinalizerIntake` を呼びます。Cloudflare AccessとCIの署名付き認証情報は各Intakeで照合し、主体のIDをリクエストJSONから受け付けません。Signerの公開用既定エントリポイントは常に404を返します。
- 認可済みの申請、承認、署名、将来のPlay操作の監査は、同じリリースIDでSigner側の台帳に集約します。固定Finalizerは申請ID付きの結果経路に、再生成したCMS署名入力と承認済みmanifestのハッシュを送ります。独立したCI認証、承認・期限、入力ハッシュ・長さをSigner内で照合し、署名結果を台帳に保持します。署名鍵、台帳を直接読む権限、署名の予約・確定操作はGatewayに渡しません。申請から署名再取得まではNode、SQLite、模擬サービスBinding／JWKSで通しており、新しい接続の実workerd・Cloudflareでの検証は残っています。
- Gatewayで実行されるコードには、経由したAccess JWTやCIの認証情報が見えます。有効な認証情報の窃取や再送による代理操作は残余リスクです。短い有効期間、固定CI、別管理のデプロイ権限とAccessの監査を使い、Gateway侵害まで耐える追加の認証境界はステージングで別途判断します。

D1やScyllaDBの追加は初期運用に不要です。SQLiteで状態と監査をトランザクション保存し、Web Cryptoで算出した次の監査ハッシュは台帳ヘッドと比較してから同時に書き込みます。外部署名をトランザクションに含めず、結果が不明なら隔離する設計です。通知と自動dispatchの導入前は手動でFinalizeを開始できます。

## 実装範囲

| フェーズ | このブランチで実測・検証した範囲 | 残り |
| --- | --- | --- |
| 0 | v6の独立した形式・内容検査、実workerdで別プロセス署名、JDKとOpenSSLで検証 | 実アップロード証明書との互換、Cloudflare実環境 |
| 1 | バージョン固定のツールと依存ハッシュ、ZIP/AAB検証、canonical manifest、JOSEのOIDC/Access検査、ローカル監査とテスト専用CI設定 | 固定独立CIからの実OIDC登録、GitHub来歴の受入検証とartifact/runの取得、アプリのBun/Gradle監査・SBOMを必須化するゲート |
| 2 | SQLiteの承認・署名予約・追記監査、署名の再取得と異常時隔離、承認UI、テスト鍵でのリリース単位の署名接続、Chromium/WebKitのiPhone相当の画面での操作確認 | CFのホスト、WAF、Access、実環境でのDOと個別Binding、失効・監査閲覧・外部アンカー、Bark、iPhone実機のSafariとAccessセッション |
| 3 | AABの再構成・厳格検証・全エントリ比較、別鍵JWSによる下書き用receiptのPoC、AAB登録専用Play APIのモックテスト | 固定Finalizerの統合、トラック未割り当て登録のPlay実測、アップロード結果の台帳記録、WIF実測と受入試験 |
| 4 | JWT・ZIP・承認・署名・receiptの拒否テスト、ローカルworkerdのHTTP計測 | CFでのCPU・JWKS miss・DOストレージ・Free枠、実ルーティング環境での境界と並行処理の検証 |

`makeCiAuthenticator` は用途別に別インスタンスで構成します。VerifierとFinalizerのrun IDを流用せず、信頼済みartifact/commit/manifestへ別々の本人性を結合します。GitHubの署名付き来歴、独立Verifierの結果、管理者承認は別証拠です。ローカルのreceiptは署名形式と値の束縛の実証であり、Googleの応答を独自に認証するものではありません。

[GitHub OIDCの公式claim](https://docs.github.com/en/actions/reference/security/oidc) · [Cloudflare Service Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/) · [Cloudflare DO SQLite](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
