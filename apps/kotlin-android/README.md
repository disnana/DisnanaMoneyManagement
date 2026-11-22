# マネーちゃん Android Kotlin試作

KotlinとJetpack Composeで作ったAndroid向け家計簿です。初回は空の状態から始まります。「記録」から支出・収入を登録し、取引タブで月・取引種別を選んで編集できます。分析タブでは月ごとの支出・収入のカテゴリ内訳を円グラフと割合で表示します。設定から、データが空の端末にサンプル取引を読み込めます。

試作用のアプリIDは `com.disnana.experimental.mane_chan_kotlin` です。記録上の残高は、アプリに入力した全期間の収入から支出を引いた額です。口座管理、カード、貯金、CSV取り込み、クラウド同期は未移植です。

## 実行

Android Studioでこのディレクトリを開きます。コマンドラインではJDK 21とAndroid SDK Platform 36を用意し、次を実行します。最小動作環境はAndroid 8.0（API 26）です。

```sh
./gradlew :app:assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Windowsでは `gradlew.bat` を使います。GitHub Actionsの「Kotlin Android prototype」もデバッグAPKを生成します。

## 設計と検証

- 複数の画面を移動する下部ナビと、取引を作成する「記録」ボタンを分けました。ステータスバーとシステムナビゲーションバーの余白はComposeのインセットで処理します。[Material 3 navigation bar](https://m3.material.io/components/navigation-bar/guidelines) · [Androidのedge-to-edgeガイド](https://developer.android.com/design/ui/mobile/guides/layout-and-content/edge-to-edge)
- ホームは記録上の残高を大きく設け、分析は円グラフの色を項目に対応させて金額と割合も併記します。[Wise Designのタイポグラフィ](https://wise.design/foundations/typography) · [IBMのデータ可視化ガイド](https://www.ibm.com/design/language/data-visualization/overview/)
- 画面はViewModelのStateFlowをライフサイクルに合わせて購読します。月別クエリはSQLiteの索引を使い、残高は取引の追加・編集・削除と同時に更新します。データベース処理はワーカースレッドに移し、取引行はLazyColumnで必要な範囲から描画します。[Now in Android](https://github.com/android/nowinandroid) · [Androidアーキテクチャの推奨事項](https://developer.android.com/topic/architecture/recommendations) · [Composeのパフォーマンスガイド](https://developer.android.com/develop/ui/compose/performance/bestpractices)
- 起動時間や描画の比較計測とBaseline Profileは未実施です。計測にはリリース相当のビルドと実機が必要です。[Macrobenchmark](https://developer.android.com/topic/performance/benchmarking/macrobenchmark-overview) · [Baseline Profile](https://developer.android.com/topic/performance/baselineprofiles/overview)
