# AndroidのMaterial 3 Expressive設計調査

設計の起点は、マネーちゃんのアイコン設定とAndroid版の配布設定を採用した `main`（`b66b3bc`）。まずホームから支出を記録して戻る流れで、情報の読みやすさとAndroidの操作感を確認する。

## AndroidとMaterial 3 Expressiveから取り入れること

- **何を先に済ませる画面かを決める。** ホームを開いたら総資産と今月の差額が読み取れ、次に口座を確認できる順序にする。数字の大きさ、間隔、背景の段差、区切り線を使い分ける。「記録する」のように優先度が高い操作は、形と色で見つけやすくする。 [Material 3 Expressive](https://m3.material.io/blog/building-with-m3-expressive) / [ComposeのMaterial 3](https://developer.android.com/develop/ui/compose/designsystems/material3)
- **Androidの戻る動作と画面端を尊重する。** 予測型「戻る」が使える端末ではOSが戻り先を示せる経路を保つ。月スワイプは画面の端を避け、ジェスチャーと競合しないか確認する。画面をシステムバーの下まで広げる場合、金額・操作・キーボードはインセットを考慮して置く。 [Predictive back](https://developer.android.com/design/ui/mobile/guides/patterns/predictive-back) / [Window insets](https://developer.android.com/develop/ui/compose/system/insets)
- **小さな画面と読み上げに対応する。** 操作領域は48dp以上を目安にする。通常の小さい本文は背景とのコントラスト比4.5:1を目安にし、収入・支出や選択状態は色に加えてラベルや符号で伝える。円記号と金額の組み合わせ、大きい文字設定での折り返し、TalkBackの読み上げ順を確認する。 [Android Accessibility](https://developer.android.com/guide/topics/ui/accessibility/apps)
- **画面幅で配置を切り替える。** コンパクトな幅では一覧と詳細を1画面ずつ開く。広い画面では、口座一覧と明細のような組み合わせで2ペインを検討する。 [Adaptive layouts](https://developer.android.com/develop/ui/compose/layouts/adaptive)
- **色とモーションは意味に合わせる。** 壁紙由来の色を試す場合は主操作と選択の役割に使い、収支の符号や文字のコントラストを維持する。Android 10でもアプリの配色でライト・ダークが成立するようにする。モーションは、選択や移動先の理解を助ける場面に限り、既存の「モーションを抑える」設定を確認する。 [Composeの色・形・文字組み](https://developer.android.com/develop/ui/compose/designsystems/material3)

## Expo SDK 58の実装候補

| 候補 | 確認したこと | 試作での使い方 |
| --- | --- | --- |
| [`@expo/ui/jetpack-compose`](https://docs.expo.dev/versions/latest/sdk/ui/jetpack-compose/) | リポジトリに導入済みの `@expo/ui 58.0.29`。Android側の `HostView` は `MaterialExpressiveTheme` を使い、既定のパレットはAndroid 12以降で壁紙に追従する。 `Host` にシード色と色の役割を指定できる。 | Expo Goで既成部品を試す。 `TopAppBar`、`NavigationBar`、`FloatingActionButton`、`ListItem`、`Switch`、`SegmentedButton`、`ModalBottomSheet`、`Snackbar` があり、まず小さい範囲で採否を見る。 |
| [Expo RouterのNative Tabs](https://docs.expo.dev/router/advanced/native-tabs/) | SDK 58の `expo-router/native-tabs` はAndroidのネイティブタブバーに対応する。Androidでは最大5タブ。既存のJSタブから切り替えると、インセットやスクロール時の見え方も変わる。 | ホーム・取引・分析・口座と、画面上の記録ボタンの組み合わせを試す候補。画面遷移と「戻る」の履歴を実機で比較する。 |
| [Expo UIの拡張](https://docs.expo.dev/versions/latest/sdk/ui/jetpack-compose/extending/) | Expo Modules APIでCompose部品とモディファイアを追加できる。カスタムのKotlinコードは開発ビルドが必要。 | 標準部品で必要な操作が作れなかった場合に使う。採用前にSDKとComposeのバージョン、開発ビルドの時間、Android 10での挙動を確認する。 |
| [React Native Paper](https://github.com/callstack/react-native-paper/blob/main/docs/5.x/docs/guides/theming.mdx) | Material 3のReact Nativeコンポーネントとテーマを備え、React Navigationのテーマを合わせる方法がある。 | JSで共通化したい場合の候補。個々のExpressive部品やAndroid固有の挙動は、利用するバージョンのAPIで確認する。 |
| [expo-material3-theme](https://github.com/pchmn/expo-material3-theme) / [Material Color Utilities](https://github.com/material-foundation/material-color-utilities) | 前者はAndroid 12以降の壁紙色の取得とテーマ生成に対応し、後者はシード色からのパレット生成や色計算を提供する。 | JS側の画面にも同じ色の役割を共有する必要が出た時に評価する。最初の試作は既存のExpo UIで行う。 |

Expo Routerの経路と既存の家計データ処理を使う。Composeを使う箇所はAndroid側で切り替え、画面を覆う `Host` とReact Native側のスクロールやキーボード処理が重ならないか確認する。Expo Goでの見た目とネイティブ開発ビルドの挙動はそれぞれ確認する。

## 実装サンプルで見る場所

- **Material 3 Catalog**は、同じ部品の選択中・無効・押下や、形・色・余白の違いを見比べる用途。設定行、ボタン、FAB、ナビゲーションを中心に見る。 [AndroidX Material 3 Catalog](https://github.com/androidx/androidx/tree/androidx-main/compose/material3/material3/integration-tests/material3-catalog)
- **Reply**は、コンパクト画面の一覧と詳細、タブレット・折りたたみでのナビゲーションと2ペインを調べる用途。口座→取引の導線に対応づける。 [Reply](https://github.com/android/compose-samples/tree/main/Reply)
- **Now in Android**は、スクロール中の見出し、一覧と詳細の間隔、ナビゲーションの分離、スクリーンショットテストの例を見る用途。 [Now in Android](https://github.com/android/nowinandroid)
- **JetLagged**は、グラフと数値の階層、内容ごとに異なる情報密度を見る用途。今月の収支で量の差を示すときに考え方を応用する。 [JetLagged](https://github.com/android/compose-samples/tree/main/JetLagged)
- **ExpoのSettings screen**は、 `Host` と `ListItem` のスロット、 `Switch` を実際に組み合わせる例。端末設定の行から試し、読み上げと押せる範囲を確認する。 [ExpoのCompose実装例](https://docs.expo.dev/versions/latest/sdk/ui/jetpack-compose/)

## 最初の試作

1. **ホーム**。総資産と表示・非表示を同じ領域に置く。今月の収支は年月と差額をまとめ、収入と支出の内訳へ自然に目が移るようにする。口座の一覧は画面と連続させ、360×640dpの標準文字サイズでスクロール前に2件見えることを目安にする。
2. **記録と戻る**。「記録」は行き先と区別できる操作として、下部バーとFABの配置を検証する。既存の中央「＋」からの距離と親指での押しやすさも比べる。入力中のキーボード、端末の「戻る」、保存後に元の画面へ戻る挙動を確認する。
3. **検証条件**。Android 10の小さい画面、Android 12以降のライト・ダークと動的配色、Android 15以降のジェスチャーとインセット、文字拡大・TalkBack・モーション軽減。現行版と同じデータで画像をそろえ、最初に見える情報、記録までに必要な操作、タブ移動やスクロールの引っかかりを比較する。
