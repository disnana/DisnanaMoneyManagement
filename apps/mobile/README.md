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
