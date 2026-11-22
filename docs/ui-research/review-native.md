# Android・Flutterの原典と取引履歴の技術比較

2026年11月22日に、指定のC01–C10とE01–E04を各社の原文URLから全件取得した。本文、掲載日または最終更新日、実装例を確認した。以下の日付は資料側の表示である。指定の14件はいずれも代替記事による補完を要しなかった。

## Androidで採用できる原則

| ID・日付 | 原文で確認した内容 | マネーちゃんでの適用と合否 |
| --- | --- | --- |
| C01 · 2025-05-13 発表 | Androidの通知では指に追従した関連要素の動きと解放時の触覚で操作の完了を伝える。強調した文字や動的テーマは、ひと目で把握する機能にも使う。円形ディスプレイに沿うスクロールはWear OSの例。 | 履歴は「現在の月」「金額」「選択中の条件」を強調する。月のスワイプは指を離す前に行き先が見え、中止すれば同じ月へ戻る。軽減設定・触覚無効のときも選択ラベルと結果件数で判断できるか確認する。製品発表はComposeライブラリ個別APIの提供を保証しない。[Google 発表](https://blog.google/products-and-platforms/platforms/android/material-3-expressive-android-wearos-launch/) |
| C02 · 2026-11-10 更新 | ComposeのMaterial 3は色・文字・形状をテーマにまとめる。選択背景と文字に `primaryContainer` と `onPrimaryContainer` のような対応するペアを使う。動的カラーはAndroid 12以降。階層は文字ウェイトや面の明度で作れる。一部APIは個別にopt-inが必要。 | 月の見出し、フィルター、明細行を別の文字ロールにする。カテゴリ色はアイコンの補助に使い、金額には符号と意味の色を付ける。Kotlin試作はAPI 31以上で補助色ペアだけに壁紙色を使い、以下ではブランド色で動く。ベースのExpoテーマに両OS用の意味色があるため、壁紙から全色を作り直す依存を今回増やす理由はない。[Compose Material 3](https://developer.android.com/develop/ui/compose/designsystems/material3) |
| C03 · 2026-11-10 更新 | 利用可能な幅の境界は600・840・1200・1600dp。高さは480・900dpが境界。2軸は独立し、分割画面・折りたたみ・回転時に再評価する。Composeでは `currentWindowAdaptiveInfo().windowSizeClass` を使える。large/extra-largeの取得には対応する引数がある。 | スマホでは期間→集計→フィルター→日ごとの明細を縦に読む。広い窓では行の読み幅を抑え、幅と高さに余裕があり詳細の同時参照が必要な場合に2ペインを検討する。600dp幅でも高さが480dp未満の横長窓では詳細を押し込まない。境界の前後と文字拡大で、金額列と編集先が保持されるかを確認する。[Window size classes](https://developer.android.com/develop/adaptive-apps/guides/use-window-size-classes) |
| C04 · 2026-11-19 更新 | 背景・スクロール・罫線は画面端まで使える。押せる領域はシステムバー・ジェスチャー・カットアウトそれぞれのinsetsを避ける。上部バーがすでにスクロール時の保護を行う場合、独自の幕を重ねると二重になる。 | ネイティブヘッダーと下部タブを安全領域の所有者とし、履歴が同じ余白を二度足さない。左右端からのシステム戻ると中央からの月スワイプ、最終行をタップできるかを別々に試す。Expoの `MonthScreen` はもともとジェスチャーの左右24論理ポイントを除外する。[Edge-to-edge design](https://developer.android.com/design/ui/mobile/guides/layout-and-content/edge-to-edge) |
| C05 · 2026-11-10 更新 | target SDK 35以上かつAndroid 15以上ではedge-to-edgeが適用される。旧OSではActivityの `enableEdgeToEdge` が使える。ViewsではAPI 29以下で子がinsetsを消費すると兄弟に届かない場合がある。AndroidX Core 1.16.0-alpha01以降には、消費前に設定できる `ViewGroupCompat.installCompatInsetsDispatch` がある。 | Android 10でキーボード付き検索を閉じて履歴最下行へ戻るテストと、Android 15以降でジェスチャー/3ボタン両方の下端テストを別に扱う。再現時にホストの余白消費順を調べる。Views用の修正をReact NativeのJS側へ二重移植しない。[Edge-to-edge in Views](https://developer.android.com/develop/ui/views/layout/edge-to-edge) |
| C06 · 2026-11-10 更新 | タッチターゲットは最低48×48dpを推奨。小さい本文には4.5:1以上、大きい文字には3:1以上のコントラストが目安。読み上げ名は役割を重ね書きせず操作結果を伝え、繰り返し並ぶ行は内容で識別する。標準Textの文字は自動で読まれる。 | 見た目が20dpの検索/表示切替にも独立した48dp領域を確保する。取引名・種別・金額を行単位で読めて、カテゴリ絵と矢印に二重フォーカスしないことを検査。色の区別を失っても支出、収入、振替を識別でき、長押しが難しい人も編集画面から削除確認に到達できることを確かめる。[Make apps more accessible](https://developer.android.com/guide/topics/ui/accessibility/apps) |
| C07 · 2026-11-13 更新 | Composeの負荷はcomposition、layout、drawで切り分ける。遅延リストには安定したkeyとcontentType、計測にはR8を有効にしたreleaseとアプリ固有のBaseline Profileを推奨。公式の対Views計測はサンプルPokedexと記載の機種に対する測定。 | Kotlin試作は取引IDと `contentType = "entry"` をすでに使用。日見出しを追加する際には日付keyと別のcontentTypeを使う。今回の手元のAPKはdebug。公式のPixelでの結果を本アプリのFPSと解釈しない。対象機で「履歴タブ→縦スクロール→編集」を計測する時にrelease構成とプロファイルを記録する。[Compose performance](https://developer.android.com/develop/ui/compose/performance) |
| C08 · 2026-11-14 更新 | 並べ替えをLazyColumnのitemsや再描画の中で繰り返さず、入力をkeyとする `remember` やViewModelで結果を再利用する。位置だけの変化ならラムダ付き `Modifier.offset` でlayout段階に読み出しを遅らせられる。最新文書の `computedStateOf` はRuntime 1.13以上。高頻度入力と低頻度で変わる判定を分ける。 | Kotlin APK内の `META-INF/androidx.compose.runtime_runtime.version` を読むと **1.9.2**。この試作への `computedStateOf` の直輸入は不可。既存の `remember(data, filter, destination)` は月データや条件の変更で更新する。簡単な件数表示にキャッシュを追加するより、Expo/Flutterでも全行ソート・日別集計がスクロールごとに走らないかを先に測る。[Compose best practices](https://developer.android.com/develop/ui/compose/performance/bestpractices) |
| C09 · 2026-11-06 更新 | 60/90/120Hzでフレーム予算は概ね16/11/8ms。700msを超えるフレームはfrozen frameで、入力のANRとは別に追う。PerfettoのFrameTimelineから遅いフレームを特定し、レイアウト・UIスレッド・描画のどこが待ったかを調べる。記事後半の最適化の多くはViewベース。 | 更新頻度・ビルド種別・データ件数を固定し、タブ初表示、同じ距離のフリング、戻りを分けて遅延の分布とサンプル数を記録する。API 29で得る `dumpsys gfxinfo` の値と新端末のFrameTimelineは測定手段が異なる。FlutterではUI/raster時間を別に取得する。ヘッドレスの実行秒数をFPSに換算しない。[Slow rendering](https://developer.android.com/topic/performance/issues/render) |
| C10 · 2026-05-19 発表 | Androidは新規API、ツール、ガイドの中心をComposeに置いている。置き換え対象のView部品やRecyclerViewなどのライブラリは保守・重大修正の対象として残る。既存機能に手を入れる単位での移行を提案している。 | Android専用の将来の入力/選択UIは、まずComposeまたはSDKに適合するExpo UI部品で試す。Expo版の既存の保存・履歴・iOSの操作を一括移行する費用や、同一の金額を出せるかは別に検証する。方針発表だけからUIの速度差は求められない。[Android UI Development is Compose First](https://developer.android.com/blog/posts/android-ui-development-is-compose-first) |

## Flutterで採用できる原則

各ページに記載された文書の対象はFlutter 3.50。試作で使用したSDKは3.50.1 stable、Dartは3.14.0、lockfileのMaterialパッケージは1.11.1だった。

| ID・日付 | 原文で確認した内容 | マネーちゃんでの適用と合否 |
| --- | --- | --- |
| E01 · 2026-05-05 更新 | responsiveは面積に配置を合わせること、adaptiveはその面積と入力方式で操作しやすい構造を選ぶこと。このガイドはSafeArea、MediaQuery、折りたたみ、入力・アクセシビリティへつながる。 | 取引名が長い時に折り返すのは配置の問題。十分広い窓で編集中の行と詳細を同時に見せるのは操作設計の問題。同じ期間と選択中の取引IDが窓サイズの変更後にも維持されるかを別々に試す。[Adaptive and responsive design](https://docs.flutter.dev/ui/adaptive-responsive) |
| E02 · 2026-07-31 更新 | 小さいwidgetへ分割し、定数部分は `const`。デバイス名や向きで決め打ちせず `MediaQuery.sizeOf` や `LayoutBuilder` で実際の制約を見る。タッチ操作から設計しキーボード・マウスでも完結させる。同じレイアウトでの一覧位置には `PageStorageKey`、構成が変わる場合は移動先の再計算を考える。 | Flutter履歴は現在 `ConstrainedBox(maxWidth: 632)` で各行の読み幅を制限する。狭い窓の絞り込みを `Wrap` で改行できる。記録IDと月を保持すれば大小画面での再選択が減る。縦固定のExpoアプリは独立した画面で360/393/600幅を確認し、画面改修で向きや配信条件まで変更しない。[Adaptive best practices](https://docs.flutter.dev/ui/adaptive-responsive/best-practices) |
| E03 · 2026-10-14 更新 | 長いリストはbuilderで画面付近だけ組み立てる。Widgetのbuildに高コスト計算を入れず、変化しない子を再利用する。 `saveLayer()` はオフスクリーンバッファと描画先切替を伴う。単純な角丸なら `borderRadius`、色を薄くするだけなら色のアルファで足りる場合がある。DevToolsでオフスクリーン描画やintrinsic layoutを確認できる。 | 試作の履歴は `ListView.builder` を使う一方、`TransactionsContent.build` は条件適用、日付順ソート、日ごとの辞書、平坦化を毎回行う。即座に画面へ載る行数と全件を計算するCPU負荷は別の指標。1万件で検索語・グループ変更を測り、必要ならデータ・期間・条件をキーに再利用する。各明細のblurや影は追加しない。[Performance best practices](https://docs.flutter.dev/perf/best-practices) |
| E04 · 2026-11-10 更新 | 基盤 `flutter/widgets.dart` とデザインシステムの `material_ui`・`cupertino_ui` が分かれる。前者は表示・入力の基本を提供し、後二者が各OSの部品や遷移の振る舞いを実装する。一覧再構成時は安定した意味上のkeyで状態を正しい項目へ結び付ける。 | lockfileを調べるとFlutter試作は `material_ui` を使用。iOSへビルドが通っても全入力・戻る操作がCupertino相当かは個別確認が要る。現状の明細行はstateless。一覧上に展開・編集中状態を加える場合は日付内の順番でなく取引IDをkeyにし、更新前後で同じ取引が開いたままか試す。[Building user interfaces with Flutter](https://docs.flutter.dev/ui) |

## 現行の実装を並べた結果

比較対象の版を固定した。Expoは `daf9d53`、Kotlinは `2c10ee4`、Flutterは `76b4444`。金額を同じルールで表示できることを移植の前提にした。端末内の保存方式と、画面で何行を一度に描くかを別々に調べた。

| 評価する内容 | Expo（mainの基準値） | Kotlin + Jetpack Compose試作 | Flutter試作 |
| --- | --- | --- | --- |
| 構成と実装費 | Expo 58.0.26、Router 58.0.32、RN 0.88.1、Expo UI 58.0.29。既存の月・家計グループ・金額計算、取引IDと編集/削除をそのまま使える。 | AGP 9.3.1、Material 3 1.4.0、API 26–36（min/target）、Android専用。履歴UIは小さいが口座モデルとiOS側の追加実装が要る。 | Flutter 3.50.1でiOS/Android/Web用の独立UI。口座、カード、貯金、CSV、バックアップ取込もある。DartとTypeScriptの金額定義・移行手順・双方のテストを同期する工数が要る。 |
| 履歴、操作 | 種別・グループ・カレンダー・期間検索。タップで編集、長押しから編集/削除、削除時に確認。月スワイプの前後ページは読み上げから除外。 | 月送りと支出/収入のFilterChip、行タップで編集、削除確認。日付は各行に表示。振替・日計・家計グループ・カレンダー・期間検索はこの試作に未実装。 | 日別見出し、日計、カレンダー、支出・収入・振替、グループ、期間とキーワード。行タップで編集。多件数で同一IDを選ぶテストが利用できる。 |
| 読み出しと保存 | `getMonthTransactions` は取引配列をキーに月の索引を使う。`MonthScreen` の縦スクロール中で `TxGroups` が当月全行を生成。検索ルートはすでにSectionList。 | SQLiteの `(date DESC, id DESC)` 索引で月単位の範囲を取得し、ViewModelがIOスレッドで実行。 `LazyColumn` はIDとcontentTypeを使う。月内は全モデルを読む。 | `ListView.builder` で描画を遅延。期間/検索/日別集計はメモリ上にあり、`SharedPreferencesAsync` に台帳をJSONとして保存。全件保存のコストはリストの初期行数に現れない。 |
| OS・保守・実測 | iOSのシステム部品、Androidのキーボード制御・戻る、中央＋の操作を共有しながら個別に維持できる。改善の前後を同じ本番ロジックで測れる。 | Androidネイティブのinsets、システム戻る、API 31以上の補助色、ライフサイクルと統合。既存APKはAndroid 10エミュレーターで記録→再起動→編集→削除の過去の操作記録あり。本調査の比較はモデル段階。 | iOSの画面・ジェスチャーと実機録画の確認範囲は別。今回は実際のDart widgetと既存12テストをheadlessで実行。両OSへ配布できることは両OSで同じ負荷・操作性の裏付けにならない。 |

コードは次の版を参照した。[Expoの取引](https://github.com/disnana/DisnanaMoneyManagement/blob/daf9d53/apps/mobile/src/app/%28tabs%29/transactions/index.tsx) · [Expoの会計集計](https://github.com/disnana/DisnanaMoneyManagement/blob/daf9d53/packages/core/src/utils/metrics.ts) · [Kotlinの画面](https://github.com/disnana/DisnanaMoneyManagement/blob/2c10ee4/apps/kotlin-android/app/src/main/java/com/disnana/manechan/kotlinpreview/MainActivity.kt) · [KotlinのモデルとDB](https://github.com/disnana/DisnanaMoneyManagement/blob/2c10ee4/apps/kotlin-android/app/src/main/java/com/disnana/manechan/kotlinpreview/Ledger.kt) · [Flutterの取引](https://github.com/disnana/DisnanaMoneyManagement/blob/76b4444/apps/flutter-prototype/lib/transactions.dart) · [Flutter台帳](https://github.com/disnana/DisnanaMoneyManagement/blob/76b4444/apps/flutter-prototype/lib/ledger.dart) · [Flutterの集計](https://github.com/disnana/DisnanaMoneyManagement/blob/76b4444/apps/flutter-prototype/lib/main.dart)

## 共通データでわかった金額の差

11月の架空データ5件を使った。食費1,280円のうち200円はポイント、銀行→財布の振替は20,000円で手数料110円。他の支出は3,860円と430円、給与は268,000円。Expoの月の収支は購入額を集計し、振替の元本を外して手数料を支出に含む。銀行残高の変化を表示する時とは対象が異なる。[共通データ生成器](history-fixture.mjs)

| 同じ5件からの値 | Expoの既存定義 | Flutterで読込・表示した値 | Kotlinの表現範囲 |
| --- | ---: | ---: | --- |
| ベーカリーの明細 | −¥1,280。200円のポイントと実支払1,080円を補足 | −¥1,080。行の主額に実支払額を採用 | 購入額1,280円は保持可能。ポイント額を保持するフィールドがない |
| 11月22日の日計 | −¥5,140 | −¥4,940 | 日計表示がない |
| 11月21日の日計 | +¥267,890 | +¥268,000 | 振替・手数料を入力できない |
| 月収入 / 月支出 / 月収支 | ¥268,000 / ¥5,680 / +¥262,320 | ¥268,000 / ¥5,370 / +¥262,630 | 5件すべてを表現できない |

Flutterの `readBackup` は5件すべてを読み込み、銀行292,520円、財布28,000円になった。月支出の差310円は、ポイント200円を支出から差し引くことと、振替手数料110円が `sumKind(EntryKind.expense)` に入らないことに一致した。金額定義を変える場合は、履歴・分析・ポイント・口座の全箇所について仕様決定が要る。今回のExpo改善は既存計算を採用する。

Kotlinはデバッグビルドの実際の `Kind`・`Entry`・`MonthData` をJDKで確認した。共通JSONから支出/収入の日・金額・カテゴリ・内容をモデルに渡すと、5件中4件だけがこの型で表現でき、その4件の額面支出合計は5,570円。 `Kind` の値はExpenseとIncomeの2種類。ポイント・手数料を別列に持てず、残りの振替1件も表現できない。これは型と集計の検査であり、Kotlinアプリで5件を完全にインポートした結果ではない。

## Flutterでの再現結果

`history-fixture.mjs` の0・5・50・1,000・10,000件をFlutter試作の本来の `readBackup` で読み、`TransactionsContent` をヘッドレスエンジンで構築した。高さ830論理ピクセル、幅360/393/600、ライト/ダーク、文字倍率1.0/1.5、各件数につき12条件。60条件でレイアウト例外なく、空表示とベーカリー行を確認。5件では行タップが正しい取引IDを返すこと、振替種別・検索語を入力とした表示内容を確認した。50件以上でリストをフリングしスクロール位置の変化を確認した。OSキーボード、実機フォント、スクリーンリーダーの発声はこの試験の対象外。

| 取引件数 | 0 | 5 | 50 | 1,000 | 10,000 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 393幅・ライト・倍率1.0で初期に構築された取引行 | 0 | 5 | 6 | 6 | 6 |

数えた対象はFlutterテストツリー内の `EntryRow`。日付見出しを除き、表示領域付近の先読みを含む。CPUで同じスレッドを使うソート、JSON保存、ハードウェアのフレーム時間についての測定値ではない。Flutter試作の既存12テストも別に再実行し全件成功した。

同じ結果を再現するには、この研究ブランチとFlutterの対象コミットを別のディレクトリで開く。以下の環境変数は各チェックアウトと任意の一時ディレクトリに設定する。画面と計算の挙動を呼び出す検査ファイルはブランチ内に同梱した。[Flutter履歴比較テスト](flutter-history-check.dart)

```sh
mkdir -p "$FIXTURE_DIR"
for n in 0 5 50 1000 10000
do
  node "$RESEARCH_TREE/docs/ui-research/history-fixture.mjs" "$n" 2026-11 > "$FIXTURE_DIR/$n.json"
done
cd "$FLUTTER_TREE/apps/flutter-prototype"
flutter pub get --enforce-lockfile
flutter test --no-pub
flutter test --no-pub --dart-define=HISTORY_FIXTURE_DIR="$FIXTURE_DIR" "$RESEARCH_TREE/docs/ui-research/flutter-history-check.dart"
```

**採用判断**　取引を記録した金額と金融機能の互換性から、刷新する履歴画面はExpoを維持する。Kotlinの安定ID付き遅延リストとFlutterの縦スクロール所有者を一つにする設計は、既存Expo画面にも移せる。3方式のFPSの優劣は未判定。実機比較には同じ端末、更新頻度、温度、同一会計ルールを含むデータ、release相当の各ビルドで同じ操作を再測定する。
