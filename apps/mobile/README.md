# DMM mobile (Expo / React Native)

iOS・Android ネイティブアプリ。ロジックは Web 版と共有（`packages/core`）、UI はネイティブ部品で、
プラットフォームごとにファイルを分けています。

```
apps/mobile
  src/app/            Expo Router。(tabs)=主要画面、add=記録画面、settings=設定
  src/ui/             共通UI。StackLayout.ios.tsx / StackLayout.tsx など OS 別ファイル
  src/lib/            theme.ios.ts / theme.ts, pick.tsx, kv.ts / kv.web.ts ...
packages/core         型・計算・初期データ・ストア（React/DOM 非依存）
```

## プラットフォーム別の構成
| 項目 | iOS | Android |
|---|---|---|
| タブ | 共通の下部ナビと中央の登録ボタン、SF Symbols | 共通の下部ナビと中央の登録ボタン、Material Symbols |
| ナビ | ブラー付きのナビゲーションバー（`StackLayout.ios.tsx`） | 標準トップアプリバー（`StackLayout.tsx`） |
| 記録画面 | スタック遷移、画面端の戻るスワイプ | スタック遷移、システムの戻る操作 |
| 選択 | 共通の選択リスト（`pick.tsx`） | 共通の選択リスト |
| テーマ | システム灰色背景・細い区切り線（`theme.ios.ts`） | トーナルサーフェス（`theme.ts`） |
| 数字キーボード | 「完了」アクセサリバー（`KeyboardDone.ios.tsx`） | なし（システム側に確定キーあり） |
| ストレージ | expo-sqlite kv-store（同期） | 同左（Web プレビューのみ localStorage） |

## PC なしで iOS・Android の Expo Go から起動する（GitHub Actions + EAS Update、無料）
`main` に push するたびに、GitHub Actions が iOS と Android の JS バンドルを同じ Expo プロジェクト・チャネルに EAS Update で公開します。
App Store または Google Play の Expo Go でその更新を開くので、開発サーバーも PC の常時起動も要りません。
EAS Build・Apple Developer Program・EAS Workflows は使いません（Expo の Free プランで完結）。

仕組み: `.github/workflows/eas-update.yml`（`main` への push と手動実行）→ `eas update --channel main --platform all` →
Expo の EAS Update に公開 → Expo Go が QR / リンクから最新の更新を取得。

### 初回セットアップ（一度だけ）
1. **Expo アカウント**を作る（無料）: <https://expo.dev/signup>
2. **プロジェクトを作る**: <https://expo.dev> → Projects → Create a project（名前は `dmm` など）。
   作成後の画面に出る **Project ID**（UUID）を控える。
   （PC で `cd apps/mobile && bunx eas-cli login && bunx eas-cli init` でも作れます。この場合 `app.json` の `extra.eas.projectId` が書き込まれるので、変数の設定は不要です。）
3. **アクセストークン**を作る: expo.dev → Account settings → Access tokens → Create token（Robot でも可）。値は一度しか表示されません。
4. **GitHub の設定**（リポジトリ → Settings → Secrets and variables → Actions）
   | 種類 | 名前 | 値 |
   |---|---|---|
   | Secret | `EXPO_TOKEN` | 手順 3 のトークン |
   | Variable | `EXPO_PROJECT_ID` | 手順 2 の Project ID（秘密ではない） |
   トークンや Project ID を Git に書かないでください（ワークフローは環境変数・Secrets 経由でだけ受け取ります）。
5. **初回の公開**: Actions → 「Publish update (EAS Update -> Expo Go)」→ Run workflow（`main` を選択）。
   2 つが未設定だと、最初のステップが何が足りないかを表示して止まります。

### 初回の起動（iOS・Android）
1. App Store または Google Play から **Expo Go** を入れ、両端末で同じ Expo アカウントにサインインする。
2. 公開が終わったジョブの **Summary** に出るリンク（`https://qr.expo.dev/eas-update?projectId=…&runtimeVersion=exposdk:58.0.0&channel=main`）を、**PC や別の画面で開く**と QR が出る。
   iOS は標準カメラ、Android は Expo Go の QR スキャナーで読み取る。
3. QR を別の画面に表示できない場合は、Expo ダッシュボードの Updates から該当の更新グループを選び、Preview で端末に対応するリンクか QR を使う。

Expo アカウントはプレビューへのアクセスに使います。家計データは各端末に保存されます。

### 更新するには
- `main` に push する（`apps/mobile/**` か `packages/core/**` が変わったとき自動で公開）。
- 手動: Actions → Publish update → Run workflow。
- 端末側: Expo Go でアプリを開き直すと更新を取得します（強制的に取りたいときは Expo Go のアプリを一度終了して再度開く）。

### 前提と制限（実機で未確認のものを含む）
- **Expo Go と SDK**: このアプリは Expo SDK 58。利用する端末の Expo Go が SDK 58 に対応している必要があります。
  更新の `runtimeVersion` は `exposdk:58.0.0`（`app.config.ts` の `runtimeVersion: { policy: 'sdkVersion' }`）で、Expo Go の SDK と一致しないと「No launchable updates」になります。
  SDK を上げたら更新の公開をやり直してください。Expo Go 側が古い SDK のままなら、Expo Go の更新を待つか SDK を合わせます。
- **ネイティブコード**: Expo Go に入っているライブラリだけが使えます。アプリが依存する `expo-*`・`react-native-*` はすべて Expo Go に同梱のものです（`bunx expo-doctor` で確認）。
  Expo Go にないネイティブモジュールを足すと動かなくなります。更新で変えられるのは JS・アセットだけです。
- **`runtimeVersion`**: `fingerprint` や `appVersion` を使うと Expo Go が更新を受け付けないことがあります。このプロジェクトは `sdkVersion` ポリシー固定です。
  将来 EAS Build で配布用ビルドを作る場合は、そのときに `appVersion` / `fingerprint` へ切り替えてください。
- **無料枠（Expo Free）**: EAS Update は無料プランで使えます。月間アクティブユーザー数・転送量の上限があり、個人利用なら通常は超えませんが、
  正確な数値は <https://expo.dev/pricing> と <https://docs.expo.dev/billing/plans/> で確認してください（無料プランは超過しても課金されません）。
- **公開範囲**: 公開した JS バンドルには、アプリのコードと同梱データが入ります。**秘密情報をアプリに入れないでください**
  （家計データは端末内にだけ保存され、更新には含まれません）。
- **`expo-updates`**: `eas update` が必要とするため依存に追加しました（Expo Go 自体には元から入っています）。開発中の挙動は変わりません。
- **ブランチ・チャネル**: チャネル `main` を使い、同名のブランチが自動で作られ・紐づきます。別の名前にしたい場合はワークフローの `UPDATE_CHANNEL` を変えてください。
  `eas update --environment production` を使います（SDK 55 以降は指定が必須。Expo 側で環境変数を定義していない場合の動作は未確認です）。

## 開発
```bash
cd apps/mobile
bun install
bunx expo start          # Expo Go / 開発ビルド（iOS は QR を Expo Go で読み取り）
bunx tsc --noEmit        # 型チェック
bunx expo export --platform android   # バンドル検証
```
パッケージ管理は Bun に統一（`bun.lock`、`bunfig.toml` で hoisted）。ネイティブビルドは GitHub Actions（`.github/workflows/mobile-build.yml`）。`android/` と `ios/` は
`expo prebuild` で生成するのでコミットしません。
