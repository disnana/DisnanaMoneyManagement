# 初回設定と障害時対応

## 有効化前

1. 独立したRelease CIの所有者・固定SHA・テスト合格を確認する。Gradle Wrapper配布物の公式チェックサム、dependency verification/locking、テスト、BunとGradleの監査、SBOMと来歴の受け入れ条件を設定する。
2. ステージングで別アカウント/アプリのテスト鍵を使い、GatewayとPrivate Signerを接続する。台帳はSignerが所有する。実鍵やGoogleの本番認証を登録する前に管理者承認を得る。
3. 管理者ホストはCloudflare Accessで管理者のみ許可し、信頼できるIdP、MFA、短いセッションを設定する。BypassおよびService Authの許可は管理者経路に付けない。プレビューURL、workers.dev、余計なrouteを無効にする。iPhoneのSafariでセッション切れとMFAを確認する。
4. CI APIとSignerのBindingは独立管理。実リポジトリとownerの不変ID、固定ref、個別audience、用途別Secret、再利用先のworkflow refとSHAを許可する。CIにCloudflare管理権限を付与しない。
5. Play Consoleのアプリ署名画面でアップロード証明書のSHA-256・鍵種別・鍵長を確認する。配布用証明書の値とは別です。トラックIDはPlay APIの一覧で照合し、WIFサービスアカウントに対象アプリのテストトラック権限だけを付与できるか確認する。最初はテストの下書きだけで、審査提出は管理者が行う。
6. 本番公開より前に、cold/warm、JWKS miss、正常/異常HTTP、DO同時実行、台帳永続化障害、WIF、Play結果不明を実環境で検証し、利用枠と実行予算を決定する。[Workers limits](https://developers.cloudflare.com/workers/platform/limits/) · [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)

## Wrangler / 環境設定の雛形

[Gateway設定例](../wrangler.gateway.example.toml) と [Signer設定例](../wrangler.signer.example.toml) を使います。Signer側の `new_sqlite_classes` で台帳を作成し、Gateway側は `ApprovalIntake`、`VerifierIntake`、`FinalizerIntake` のService Bindingを設定します。ステージングの名前は `disnana-release-gateway-staging` と `disnana-release-signer-staging` を使います。GatewayへCustom Domainを登録する前に、`release-stg.disnana.com` にAccessを設定してください。

`RELEASE_INTAKE_ENABLED` と `RELEASE_SIGNING_ENABLED` は初期値 `false`。固定CIのワークフローを確定してから、ステージングのテスト鍵で個別に有効化します。

| 保存先 | 設定候補 |
| --- | --- |
| Gateway | `APPROVAL_ORIGIN`、`VERIFIER_ORIGIN`、名前付きService Binding 3本 |
| Signerの認証設定 | `ACCESS_POLICY` にAccessのteam、audience、管理者のsub allowlist。`VERIFIER_POLICY`、`FINALIZER_POLICY`、`PUBLISHER_POLICY` に固定ref、repo/ownerの数値ID、固定workflow SHA、個別audienceとSecretのSHA-256 |
| Signerのリリース設定 | `RELEASE_POLICY` にアプリID・package・repo・許可track・鍵IDと公開証明書SHA-256・ポリシーバージョン |
| 台帳 | アプリ単位のSQLite DO、鍵とポリシーの版、署名停止フラグ、保持期間、外部アンカーの保存先 |
| Signer | 秘密鍵を `UPLOAD_PRIVATE_KEY_PEM`、対応する公開証明書を `UPLOAD_CERTIFICATE_PEM` に登録します。証明書のSHA-256とRSA鍵長（`rsaBits`、既定値3072）をポリシーで検証します |
| 受領証 | 署名鍵と独立したP-256秘密鍵をSignerの `RELEASE_RECEIPT_PKCS8_PEM` に登録します。鍵IDの `RELEASE_RECEIPT_KEY_ID` はSignerとPlay用GitHub Environmentに同じ値を入れ、対応する公開鍵だけをEnvironmentの `RELEASE_RECEIPT_PUBLIC_SPKI_PEM` に登録します |
| Publisher | WIF provider、専用アカウント、Play APIのtrack ID、参照する信頼済みreceipt設定。長期のアカウント鍵JSONは作成しない |

## ログの保管期間案

- 正規の監査記録は30日を初期目安とします。申請・承認・署名と、接続後のPlay操作は、Signerが所有するSQLite台帳に記録します。
- デバッグ・運用診断ログは7日を目安とします。Cloudflare標準の保存期間は契約とログの種類を確認し、7日の保持を設定できない場合は保存先を別途判断します。認証失敗の全件をSQLiteに書き込みません。
- 自動削除の導入条件は、削除境界のハッシュを保管して残った監査チェーンを検証できることと、消費済みバージョンコードを監査ログとは別に保持できることです。どちらも動作確認してから削除を有効にします。

## 結果不明・緊急停止・鍵の更新

- 署名が `SIGNING` で途切れたら、未確認の結果を再署名しない。監査の最後のハッシュと署名予約を確認し、期限経過後は隔離する。隔離解除は運用の追加承認を通して行う。
- PlayへのAPI呼び出しが途切れたら、対象版のbundleとtrackの状態をPlay Consoleまたは読み取りAPIで確認する。事実が確認できるまで同じeditの自動再実行や審査送信をしない。
- AAB登録専用ジョブは、Playを呼ぶ前に署名と同じActions実行ID・attempt・AABハッシュを台帳に予約します。結果が未記録なら `UPLOADING` に留まり、新しい予約を拒否します。Play側の結果を確認してから運用側で照合します。確認済みの結果通知の再送は新しい監査イベントを作りません。
- 漏洩の疑いがあればSignerの緊急停止、CIのアプリ権限停止、WIFとAccessセッションの失効、未承認要求の失効を実施する。すでに配布された版への対応はPlay Consoleで判断する。
- アップロード鍵の変更時はPlayの正式な鍵リセットで新しい公開証明書を登録。鍵ID・証明書指紋・ポリシー版を更新し、旧版の要求を作り直す。receipt鍵とCI Secretは独立に更新し、どの鍵で署名したかを監査する。
- 監査の外部バックアップには署名付きチェックポイントを使う。JWTやCookie、秘密鍵は保存対象に含めない。

## 署名済みAABを内部テストの下書きとして保存

マネーちゃん v6 では、Play API が内部テストを `internal` と返し、下書きとして保存した署名済みAABがApp Bundle Explorerに表示されました。この自動化では承認後に同じトラックへ保存し、クローズドテストへの割り当て、配布、審査提出はPlay Consoleで行います。

- Signerの `RELEASE_POLICY` に `"track": "internal"` と `"releaseStatus": "internal-draft"` を設定します。GitHubのリポジトリ変数にも `RELEASE_TARGET_TRACK=internal`、`RELEASE_STATUS=internal-draft` を設定します。承認画面に保存先を表示し、署名済みマニフェストと登録受領証にも保存先を記録します。
- 新しいジョブの固定コミットは Signer と Google WIF に一度反映します。アプリ更新だけで認証ピンを更新する必要はありません。バージョンは監査付きビルド証跡、ソースSHAは実行中の `main` のコミットから取得します。GitHubにv6用のバージョンやソースSHAの変数が残っていても、このワークフローは参照しません。
- AAB未割り当ての下書きがある場合は、名前とリリースノートを保持してAABを追加します。別バージョン入りの下書き、配布途中の内部リリース、確認可能な審査待ち・審査中の変更があれば停止します。同じ版とハッシュが登録済みなら再アップロードしません。
- Playのコミットは `changesInReviewBehavior=ERROR_IF_IN_REVIEW` を指定します。Play Consoleに別の審査送信待ち変更がある場合、自動送信される可能性があります。APIで確認できないストア掲載情報などは承認前に「公開の概要」で確認してください。
- コミット後の別Editで、バージョンコードとSHA-256、下書き、既存トラックを照合します。コミットが未確認の場合や事後照合に失敗した場合は、Play Consoleの現状を確認してから次の操作を判断します。

## PlayへのAAB登録のみ

新しいデプロイで有効化するときは、Signerの `RELEASE_POLICY` に `"releaseStatus": "upload-only"` を追加します。既存の `track` は承認時に確認する予定トラックです。Playへ割り当てるAPI呼び出しはありません。

Release AuthorityのFinalizerから検証済みの署名済みAABを引き継いだら、署名済み成果物のSHA-256を固定して、`scripts/android_play_draft.py --bundle-only AAB VERSION_CODE SHA256` で登録します。認証は専用の短期Playアクセストークンを `PLAY_ACCESS_TOKEN` に渡します。実際の接続前にGitHub WIFとPlay権限を別途検証してください。

このモードのEditにはAAB登録だけを含めます。レスポンスのバージョンコードとSHA-256を照合後、Editを検証し、審査に送らない指定でコミットします。トラック割り当てはPlay Consoleで担当者が行い、同じ画面で下書きを作成して審査を提出します。コミット結果が不明ならPlay Consoleで同じバージョンとSHA-256を確認してから再実行します。

現時点ではモックでAPI呼び出しと異常時の停止を検証済みです。トラック未割り当てのAABが実際にApp Bundle Explorerに表示され、手動で選べるかはPlayの実環境で照合します。

### 承認でFinalizerを起動する構成

- GitHub Appを専用で作り、`disnana/DisnanaMoneyManagement` のみにインストールします。リポジトリ権限はActionsの読み取りと書き込みです。Appの鍵をPKCS#8 PEMに変換し、[Dispatcher Worker](../wrangler.dispatcher.example.toml) の `GITHUB_APP_PKCS8_PEM` にSecretとして登録します。`GITHUB_APP_ID` と `GITHUB_APP_INSTALLATION_ID` は対応する数値IDです。Dispatcherに外部ルートを付ける必要はありません。
- Signerに `GITHUB_DISPATCHER` Service Bindingを接続し、検証が済んだ運用環境で `RELEASE_AUTO_DISPATCH=true` にします。Signerが承認と同時に台帳へ起動待ちを記録し、DOアラームからDispatcherを呼びます。Dispatcherは対象リポジトリの短命installation tokenでVerifierの成功とSHAを確認し、固定ワークフローの `finalize` を起動します。GitHubの書き込み権限はDispatcherに、Android署名鍵はSignerに置きます。
- GitHubのリポジトリ変数 `RELEASE_AUTO_BUILD=true` で、`main` に入った `apps/mobile/app.json` のAndroid `versionCode` が上がったときに監査付きビルドを開始します。下の自動検証とSignerの自動起動を有効にすると、ライブラリ登録までの手動操作はCloudflareの承認です。
- GitHubのリポジトリ変数 `RELEASE_AUTO_VERIFY=true` で、`main` の監査付きAABビルドが成功したときにVerifierを起動します。ActionsのサマリーにCloudflare承認画面のリンクが出ます。手動での `verify` と `finalize` も利用できます。
- 署名・AAB登録の認可、承認期限、再取得時のハッシュ確認、署名・アップロード予約は引き続き使います。`dispatch_failed` や `dispatch_unknown` が残ったら、対象のVerifier run IDでActionsの起動履歴を確認してください。起動がなかったことを確認してから、期限内に手動で再開できます。
- Dispatcherのログ `release_dispatch_failed` にある `stage` と `githubStatus` で、Appの認証、Verifier実行の確認、起動APIのどこで止まったかを確認できます。ログにトークンや秘密鍵、GitHubから受け取った本文は含まれません。

### アプリの更新と独立した認証ピン

通常リリースでは `main` の入口から、固定コミットの [Release Authority jobs](../../.github/workflows/release-authority-jobs.yml) を呼び出します。ジョブ自身も GitHub の `job.workflow_sha` でツールを取得します。入口のコミットの変化だけでは、署名ツールや認証条件は変わりません。

この切り替えは旧構成の承認・署名・登録を完了してから行います。この変更をマージするときは、固定コミットを履歴に残すためマージコミットを使用してください。

- Signerに変数 `CI_WORKFLOW_POLICY` を作り、以下のJSONを登録します。`VERIFIER_POLICY`、`FINALIZER_POLICY`、`PUBLISHER_POLICY` からワークフローの項目（`callerRef`、`callerSha`、`reusableRef`、`reusableSha`）を除きます。環境、OIDC subjectとaudience、Secretの条件は各ポリシーに残します。共通設定と個別設定にワークフローの項目を重複して指定すると、Signerは受け付けません。

  ```json
  {
    "callerRef": "disnana/DisnanaMoneyManagement/.github/workflows/release-authority.yml@refs/heads/main",
    "reusableWorkflow": "disnana/DisnanaMoneyManagement/.github/workflows/release-authority-jobs.yml",
    "reusableSha": "1ef32344ca7c0b475e224ec8682471ed0d1fb152"
  }
  ```

- Google WIFの既存条件から `assertion.workflow_sha == '旧mainのSHA'` を除き、`assertion.job_workflow_sha == '1ef32344ca7c0b475e224ec8682471ed0d1fb152'` と `assertion.job_workflow_ref == 'disnana/DisnanaMoneyManagement/.github/workflows/release-authority-jobs.yml@1ef32344ca7c0b475e224ec8682471ed0d1fb152'` を加えます。その他の条件は維持します。
- v6用にSignerへ設定した `RELEASE_POLICY.sourceCommitSha` と `CI_WORKFLOW_POLICY.callerSha` があれば、この切り替え時に解除します。以後はAABのソースを実行時の `main` のコミットと照合し、SignerとWIFは再利用ワークフローを固定します。
- Release Authorityのツールを更新した場合は、新しい固定コミットを入口と両方の認証ポリシーに反映します。通常のアプリ変更ではこの更新は不要です。申請後に別のコミットが `main` に入った場合は、現在のコミットの監査付きAABで申請し直してください。

### 既存GitHubリポジトリで実行する順番

- GitHub上の配置先は既存の `disnana/DisnanaMoneyManagement` です。この構成では独立したGitHub-hostedジョブを持つ `.github/workflows/release-authority.yml` を使います。Cloudflare側のVerifierとFinalizerポリシーで入口の `callerRef` と上記の再利用ワークフローを固定し、それぞれ個別のenvironment・audience・Secretを使います。署名鍵とWorkerの更新権限はCloudflareに残します。
- `Release Authority Gradle baseline` は依存のチェックサムとロック候補を作ります。来歴と差分をレビューしたファイルを `apps/mobile/release-verification/{verification-metadata.xml,gradle.lockfile}` に反映してください。証明書や認証情報は含めません。候補を自動で受け入れる処理はありません。
- 既存の `Android Play closed-test draft` を `release_authority_checks=true`、`upload_to_play=false` で実行します。Gradleの固定配布物、依存検証・ロック、Gradle依存監査、Bun監査、テストを通った場合にのみ、AABと品質証跡を保存して来歴を発行します。
- `Release Authority AAB` を `operation=verify` で実行し、上のBuild run IDを渡します。Actions要約のリンクをiPhoneで開いてハッシュを照合し、Cloudflare側で承認します。
- 同じワークフローを `operation=finalize` で実行します。Build run IDと先ほどのVerifier run IDを渡すと、AABを再取得して署名・検証まで進みます。Play権限と実アップロード証明書を確認した運用時にだけ `upload_to_play=true` を使います。初期運用のFinalizer起動は手動で、承認待ちのrunnerや定期ポーリングはありません。
- Playのjobだけが `release-authority-play` のWIF設定を使用します。プロバイダ側でもrepository/owner ID、`refs/heads/main`、入口の `workflow_ref`、再利用ワークフローのrefとSHA、対象environmentを固定します。アプリに限定したPlay権限と、App Bundle Explorerに登録できることを実環境で確認してください。
- 同じjobが `RELEASE_PUBLISHER_SECRET` と専用audience `urn:disnana:release-authority:staging:publisher` でSigner台帳に登録開始と確定結果を記録します。Playの認証や応答を受け取れるのはこのjobです。
- Playへ送る前に、受領証の公開鍵と鍵IDの一致をSignerで確認します。登録後、Signerが台帳の結果にES256で署名し、Actionsが検証した受領証を成果物 `Mane-chan-Play-upload-receipt` に保存します。
- GitHubの固定設定には `RELEASE_UPLOAD_CERTIFICATE_PEM`、`RELEASE_UPLOAD_CERTIFICATE_SHA256`、`RELEASE_UPLOAD_KEY_ID`、`RELEASE_TARGET_TRACK`、`RELEASE_POLICY_VERSION` です。公開証明書を置く場所であり、秘密鍵は登録しません。
- `Release Authority preflight` は、対象ビルドの完了状態、ソース、成果物ID・出所・アーカイブハッシュのメタデータを確認し、監査結果とSBOMを格納する成果物の欠落を検出します。来歴の暗号学的な検証、監査資料の検証、署名申請は後段です。
- v6の既存run `45284819969` には未署名AABの成果物 `14874240148` だけがあり、必須の監査結果・SBOMに対応する成果物がありません。このrunは本番署名申請の前に停止します。
- 元のv6のルートlockfileに対し、Bun 1.4.4の全依存監査は `glob` と `minimatch` のmoderate 2件を返して非ゼロ終了しました。Webとモバイルのlockfileを修正しました。監査結果を含むAABは修正後のコミットから再ビルドする必要があります。 [glob advisory](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) · [minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249)
- 検証済みcanonical manifestを `node tools/aab-verifier/register-staging.mjs MANIFEST` で登録します。独立VerifierのOIDCと `RELEASE_VERIFIER_SECRET` が必要です。
- 承認後、別実行の固定FinalizerでAABとCMS属性を再検証して再生成し、`node tools/remote-jarsigner/finalize-staging.mjs MANIFEST CMS_INPUT RAW_SIGNATURE` で署名を受け取ります。Finalizer専用OIDCと `RELEASE_FINALIZER_SECRET` が必要です。受け取った署名はJava側でAABに組み込み、公開証明書で再検証します。
- Java側では `DeterministicAab finalize-signature AAB CERTIFICATE ISSUED_AT PROOF_DIR OUTPUT SIGNATURE` を使用します。同じAABから再生成した署名対象とVerifierの証拠を比較し、署名と全エントリの証明書を確認してから出力します。
- 過去のAABを特別に扱う旧ワークフローを運用する場合は、`RELEASE_POLICY.sourceCommitSha` にAABのソース完全SHA、`CI_WORKFLOW_POLICY.callerSha` に呼び出し元の完全SHAを固定します。各CIでは同じAABのソースSHAを `RELEASE_SOURCE_SHA` に設定して来歴を検証します。指定がない通常運用ではOIDCのソースSHAとAABのソースSHAの一致を要求します。
- 上記の処理はリポジトリのワークフローファイルに接続済みです。GitHubとCloudflareの反映、レビュー済みGradleベースライン、Playへの実接続は環境側に残っています。
