# マネーちゃん Flutter版

iOS・Android向けの独立した家計簿アプリです。ホーム、取引、分析、口座を画面下から開き、中央の＋から支出・収入・振替を記録します。初回起動では基本口座とカテゴリが作成されます。設定から当月を基準にしたサンプルデータを読み込めます。

## 機能

- 取引の作成・編集・削除、一覧とカレンダー、月・期間検索、家計グループによる表示
- 口座の管理、デビットカードと引落口座、カードの締め日・請求月・確定額・利用枠・支払い・ポイント充当
- 月ごとの収支、収入・支出のカテゴリ別分析、総予算とカテゴリ別予算
- 貯金目標、定期取引、購入予定、立て替えと回収、事業取引の内訳・申告準備用CSV
- 現行版とFlutter版のJSONバックアップ読み込み、バックアップファイル共有、三井住友銀行・PayPay銀行・楽天カード・MonemyのCSV読み込み
- ライト・ダーク、総資産の表示切り替え、モーション、端末認証、Androidの自動・固定アイコン

楽天カードのCSVは手数料なしの一括払いを対象にします。バックアップ読み込み時に確認画面で口座・取引件数を表示し、現在のFlutterデータを置き換えます。小数の円金額を含む現行版バックアップは正確な残高を保つため読み込みを保留します。データは試作アプリの端末内領域に保存されます。

## 開発

Flutter stable 3.50.1を使用します。AndroidはJDK 21、iOSシミュレーターと実機はmacOSとXcodeが必要です。

```sh
cd apps/flutter-prototype
flutter pub get --enforce-lockfile
flutter analyze
flutter test
flutter devices
flutter run -d <デバイスID>
```

Chromiumで画面を確認する場合は `flutter run -d chrome` を使えます。Androidの実験用アプリIDは `com.disnana.experimental.mane_chan_prototype` です。GitHub ActionsではAndroidのデバッグAPKとiOSシミュレーター向けアプリをビルドします。

[体験設計](UX.md)
