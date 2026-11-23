# Android のクローズドテスト版

GitHub Actions の **Android Play closed-test draft** を `main` から手動実行する。`apps/mobile/app.json` の `version` と `android.versionCode` を使用する。Play に初回提出する前なら、未使用のバージョンコード6で試せる。次の提出には Play で未使用のコードを割り当てる。

`upload_to_play` をオフにすると、未署名AABのビルド、マニフェスト照合、GitHub来歴証明まで実行する。オンにすると、同じワークフローが署名・証明・アップロードし、対象トラックに下書きを保存する。`staging_auth` と日本語のリリースノートは実行画面で指定する。アカウント連携の本番設定には既存のリポジトリ変数 `MANE_AUTH_ENTRY`、`MANE_GOOGLE_WEB_CLIENT_ID`、`MANE_GOOGLE_PROJECT_NUMBER` を使う。

## 初回だけ設定する項目

1. GitHubリポジトリの **Settings → Environments** で `google-play-closed` を作成する。**Deployment branches and tags** で **Selected branches and tags** を選び、ブランチ `main` を許可する。
2. Play Console の **アプリの署名 → アップロード鍵の証明書** で SHA-256 を確認する。アプリ署名鍵のフィンガープリントとは別の欄にある。
3. Google Cloud で Google Play Android Developer API と IAM Service Account Credentials API を有効にする。Play専用サービスアカウントを作り、Play Console の **ユーザーと権限** から `com.disnana.mane_chan` に招待する。アプリを閲覧してテストトラックにリリースできるアプリ単位の権限を付与する。
4. GitHub OIDC の Workload Identity Federation を作成する。OIDC issuer は `https://token.actions.githubusercontent.com`、属性マッピングは `google.subject=assertion.sub,attribute.repository_id=assertion.repository_id`。プロバイダーの属性条件は次のようにし、数値IDはリポジトリの実値に置き換える。GitHub API の `GET /repos/disnana/DisnanaMoneyManagement` で `id` と `owner.id` を確認できる。

   ```text
   assertion.repository_id == 'REPOSITORY_ID' &&
   assertion.repository_owner_id == 'OWNER_ID' &&
   assertion.sub == 'repo:disnana/DisnanaMoneyManagement:environment:google-play-closed' &&
   assertion.workflow_ref == 'disnana/DisnanaMoneyManagement/.github/workflows/android-play-draft.yml@refs/heads/main'
   ```

   サービスアカウントの IAM で、該当プールの `principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL_ID/attribute.repository_id/REPOSITORY_ID` に `roles/iam.workloadIdentityUser` を付与する。Google Cloud のサービスアカウント鍵 JSON は不要。

| 種類 | Environment の名前 | 設定値 |
| --- | --- | --- |
| Secret | `PLAY_UPLOAD_KEYSTORE_BASE64` | 現行の `upload.p12` のBase64。中のエイリアスは `mane-chan-upload` |
| Secret | `PLAY_UPLOAD_STORE_PASSWORD` | キーストアのパスワード |
| Variable | `PLAY_UPLOAD_CERT_SHA256` | Play Console のアップロード証明書の SHA-256 |
| Variable | `PLAY_WORKLOAD_IDENTITY_PROVIDER` | `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL_ID/providers/PROVIDER_ID` |
| Variable | `PLAY_SERVICE_ACCOUNT` | Play に招待した Google サービスアカウントのメールアドレス |
| Variable | `PLAY_CLOSED_TRACK` | 既存のクローズドテストトラックの Play Developer API 上の識別子。標準のクローズドトラックは `alpha` |

Oracle 上の鍵を登録する場合、認証済みの GitHub CLI に直接渡せる。

```bash
base64 -w0 "$HOME/.local/share/mane-key-backups/upload.p12" |
  gh secret set PLAY_UPLOAD_KEYSTORE_BASE64 -R disnana/DisnanaMoneyManagement -e google-play-closed
gh secret set PLAY_UPLOAD_STORE_PASSWORD -R disnana/DisnanaMoneyManagement -e google-play-closed
```

## 来歴の確認と提出

- アプリの **設定 → 情報 → ビルドコミット** に40文字の Git SHA が表示される。インストールしたAABの Android マニフェストから読み出すため、その後にJavaScriptが更新されてもビルド元を確認できる。
- Actions の実行結果には、ビルド元のコミット、未署名・署名済みそれぞれの SHA-256、アップロード証明書の SHA-256 を記録する。署名済みAABは Play に直接送る。
- 認証した最近の GitHub CLI で、ローカルにあるAABの来歴を検証できる。未署名の場合は対象ファイルを `app-release.aab` に置き換える。

  ```bash
  gh attestation verify mane-chan-signed.aab \
    --repo disnana/DisnanaMoneyManagement \
    --signer-workflow disnana/DisnanaMoneyManagement/.github/workflows/android-play-draft.yml \
    --source-ref refs/heads/main
  ```

- 同じトラックに下書きや進行中の配信があれば停止する。審査済みの配信は保持する。Playで審査中の変更があればAPIが停止し、審査を取り消す設定には切り替えない。
- 下書きが保存されたら Play Console でバージョンコード、トラック、リリースノートを確認し、人が審査に送信する。

[Google Play Developer API の準備](https://developers.google.com/android-publisher/getting_started) · [Play の下書きとトラック](https://developers.google.com/android-publisher/tracks) · [審査送信を制御する API](https://developers.google.com/android-publisher/api-ref/rest/v3/edits/commit) · [GitHub の来歴証明](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations)
