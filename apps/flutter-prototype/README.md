# マネーちゃん Flutter 試作

ホームで残高を確認し、支出を登録してから残高・月の収支・最近の支出に反映されるまでを試せます。総資産の表示切り替え、取引日・カテゴリ・支払い方法・メモの入力、ライト／ダークのシステムテーマに対応しています。

試作版は初回起動時の月にサンプルを用意します。登録した支出と総資産の表示設定は試作版専用の端末内領域に保存します。AndroidのアプリIDは `com.disnana.experimental.mane_chan_prototype` です。

Flutter stable 3.50.1での確認手順。Androidで試す場合はAndroid SDKとエミュレーター、または接続済みの実機を用意します。

```sh
cd apps/flutter-prototype
flutter pub get
flutter analyze
flutter test
flutter run -d <AndroidのデバイスID>
```

Chromeでレイアウトと一連の操作を確認する場合は `flutter run -d chrome` を使えます。
