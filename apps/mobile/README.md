# DMM mobile (Expo / React Native)

iOS・Android ネイティブアプリ。ロジックは Web 版と共有（`packages/core`）、UI はネイティブ部品で、
プラットフォームごとにファイルを分けています。

```
apps/mobile
  src/app/            Expo Router（ファイルベース）。(tabs)=ネイティブタブ、add=記録画面
  src/ui/             共通UI。StackLayout.ios.tsx / StackLayout.tsx など OS 別ファイル
  src/lib/            theme.ios.ts / theme.ts, pick.ios.ts / pick.tsx, kv.ts / kv.web.ts ...
packages/core         型・計算・初期データ・ストア（React/DOM 非依存）
```

## プラットフォーム別の構成
| 項目 | iOS | Android |
|---|---|---|
| タブ | UITabBarController（iOS 26 は Liquid Glass）, SF Symbols | Material 3 ナビゲーションバー, Material Symbols |
| ナビ | 大見出し＋ブラーのナビゲーションバー（`StackLayout.ios.tsx`） | 標準トップアプリバー（`StackLayout.tsx`） |
| 記録画面 | ネイティブ formSheet | フルスクリーンモーダル |
| 選択 | ActionSheetIOS（`pick.ios.ts`） | Material ボトムシート（`pick.tsx`） |
| テーマ | システム灰色背景・細い区切り線（`theme.ios.ts`） | トーナルサーフェス（`theme.ts`） |
| 数字キーボード | 「完了」アクセサリバー（`KeyboardDone.ios.tsx`） | なし（システム側に確定キーあり） |
| ストレージ | expo-sqlite kv-store（同期） | 同左（Web プレビューのみ localStorage） |

## 開発
```bash
cd apps/mobile
npm install
npx expo start          # Expo Go / 開発ビルド
npx tsc --noEmit        # 型チェック
npx expo export --platform android   # バンドル検証
```
ネイティブビルドは GitHub Actions（`.github/workflows/mobile-build.yml`）。`android/` と `ios/` は
`expo prebuild` で生成するのでコミットしません。
