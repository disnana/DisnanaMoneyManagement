# Expo・React Nativeの原文調査と取引履歴への適用

2026年11月22日にD01〜D18の指定URLを個別に取得した。18件ともHTTP 200で本文を確認できた。以下の日付は、特記がなければ公開元のページ更新日。版が変わる `latest` は、その日の表示とSDK 58固定版のAPIを照合した。採用判断に使った既存コードは `main@daf9d53`。

## このアプリで先に解く問題

- 月別履歴は `MonthScreen → Screen（縦ScrollView）→ TxGroups → TxRow`。現在月の全件を `map` で描画し、左右月は各18件に制限している。一方、検索はすでに `TransactionSearchList` の `SectionList` で日別に仮想化される。履歴の縦スクロールをリスト自身に任せ、同じ方向のScrollViewを外せば、Expoのまま全件マウントを避けられる。日計・フィルタ・月スワイプ・カレンダー・取引を編集するルートを維持できる。
- 取引行にはメモ、ポイント充当額、振替元・先、長押しからの削除確認があり、高さは一定でない。`TxRow` は削除ダイアログの開閉を `useState` に持つ。別の取引に同じセルを割り当てる方式を試す場合は、削除するIDを画面側で持つか、IDが変わるときに状態を破棄する。対象が別の取引に変わらないことを自動操作で確かめる。
- 下部は `expo-router/ui` の4つの行き先と、独立した「収支を記録」ボタン。タブを変える際は遷移先を当月に戻し、＋連打はガードする。ネイティブタブへの変更は履歴のスクロール問題から独立している。
- `apps/mobile/bun.lock` の解決結果は Expo 58.0.26、React 19.3.0、RN 0.88.1、Router 58.0.32、Expo UI 58.0.29、Expo Image 58.0.18、Expo Haptics 58.0.8、Reanimated 4.7.1、Worklets 0.13.0。Bun 1.4.4を指定。`@expo/ui` はインストール済み。履歴本体に直接のimportはなく、FlashListもアプリの直接依存にない。[モバイルの依存関係](../../apps/mobile/package.json)・[ロックファイル](../../apps/mobile/bun.lock)

## 資料別の判断

### D01　Expo SDK 58 のリリース

2026年10月15日公開。リリース告知では、安定化したNative Tabsと、`List.ForEach`・`LazyColumn.Items` に配列と一意キーを渡すリサイクル方式が別々の変更として説明されている。Native Tabsを使わなくても新しいリストは検討できる。AndroidのreleaseではR8による縮小が標準になった。開発中のExpo Goの速度と、同一ABI・同一設定でビルドしたreleaseの値は別々に記録する。ベンチマーク用のビルド条件を整えるためのSDK更新は不要。[SDK 58](https://expo.dev/sdk/58)・[詳しいリリースノート](https://expo.dev/changelog/sdk-58)

### D02　SDKとランタイムの対応表

SDK 58の組み合わせはReact Native 0.88、React 19.3.0、最小Node 22.13.x。AndroidのSDK表はOS 7以降・compile 37・target 36、iOSは16.4以降・Xcode 26.4以降。compileやtargetの数値が高くても、古い端末が新しい振動やキーボードAPIを持つとは限らない。固定されたフレームワーク版を土台に機能単位でOS条件を分け、UI変更と同時に単独のRN更新を持ち込まない。CIはリポジトリ指定のランタイムを使用する。SDK固定版の更新日は9月17日。[原文](https://docs.expo.dev/versions/latest/)・[SDK 58版](https://docs.expo.dev/versions/v58.0.0/index.md)

### D03　AI agents and Expo

11月19日。Expo Skillsは設計・手順の資料、Expo MCPはビルド記録やサービスへの接続、端末操作ツールは起動したアプリのUI・ログ・プロファイルを扱う。三者の結果は相互に代用できない。ここでは公開Docs・パッケージの型とソースから利用可能なAPIを確認した。このセッションにはExpo MCPツールが公開されていない。OAuthアカウントの情報や遠隔の物理端末を使ったという前提を置かず、検証報告には端末の種類、ビルド、再現経路を明記する。[原文](https://docs.expo.dev/agents/)

### D04　公式Expo Skillsとソース間の食い違い

11月19日。カタログのリンクから6本の `SKILL.md` も開いた。取得時の公式リポジトリは `88d9bd7`。このアプリへの適用を次のように分けられる。[公式カタログ](https://docs.expo.dev/skills/)

| 原文 | 履歴への適用 |
| --- | --- |
| [expo-design-system](https://github.com/expo/skills/blob/88d9bd79f3fa8452a778fbac65bae162c0b32ce4/plugins/expo/skills/expo-design-system/SKILL.md) | 既存テーマを起点に、見出し・金額・補助文の役割と余白を名前で共有する。行ごとの生の色や影を増やさない。PressedとSelectedは別の状態として定義する。 |
| [expo-native-ui](https://github.com/expo/skills/blob/88d9bd79f3fa8452a778fbac65bae162c0b32ce4/plugins/expo/skills/expo-native-ui/SKILL.md) | 実行時の `useWindowDimensions` とOSの文字倍率で行を組み直す。SF SymbolsとAndroidのMaterialアイコンに同一の日本語操作名を与える。 |
| [expo-ui](https://github.com/expo/skills/blob/88d9bd79f3fa8452a778fbac65bae162c0b32ce4/plugins/expo/skills/expo-ui/SKILL.md) | 設定・フォームの固定行や選択部品を置く候補。リストを一律に「仮想化しない」とする本文は、SDK 58のデータ駆動APIについては現行実装と異なる。下記D09参照。 |
| [expo-animation](https://github.com/expo/skills/blob/88d9bd79f3fa8452a778fbac65bae162c0b32ce4/plugins/expo/skills/expo-animation/SKILL.md) | 月の水平ドラッグは指に追従するUIスレッドで。日付行の表示ごとにアニメーションを開始しない。タブの押下と月スワイプを別々に評価する。 |
| [expo-router](https://github.com/expo/skills/blob/88d9bd79f3fa8452a778fbac65bae162c0b32ce4/plugins/expo/skills/expo-router/SKILL.md) | ファイルは現在のルートを維持し、委譲できるタイトルや戻るはStackへ。行の編集・削除を開く経路と押し戻した後の一覧の状態を確認する。 |
| [expo-upgrade](https://github.com/expo/skills/blob/88d9bd79f3fa8452a778fbac65bae162c0b32ce4/plugins/expo/skills/expo-upgrade/SKILL.md) | 将来の移行は対象SDKの変更履歴、peer依存、診断、実機ビルドの順で確かめる。今回は58で必要なAPIが揃っているので、ロックファイルを更新する根拠がない。 |

### D05　機械可読ドキュメント索引

更新日の記載なし、取得日は11月22日。索引はRouter、SDK、計測、開発ビルドを機能別に結び、各URLの `.md` 形式または `Accept: text/markdown` を案内する。これを使ってD09・D11・D13・D14で固定版の引数、対象OS、推奨版、更新日を取得した。「Expoが高速」という索引中の説明は本アプリの実測には使えない。比較結果には実装とビルド種別も含める。[原文](https://docs.expo.dev/llms.txt)

### D06　Expo UIの採用境界

SDK 58、9月23日。Universal・SwiftUI・Jetpack Composeの入口があり、UniversalはWebにも対応する。設定のスイッチのように操作が閉じている箇所はUniversalを優先して試せる。日付・集計・絵文字・メモ・長押し・確認ダイアログを持つ取引行のすべてを移すと、プラットフォームごとに操作と読み上げを再検証する必要がある。現在の履歴の範囲では表示順と縦リストを変え、保存と編集に入る既存経路を利用する。Expo Goで表示できることと、リリースビルドでの性能は分けて評価する。[原文](https://docs.expo.dev/versions/v58.0.0/sdk/ui/)

### D07　Jetpack Compose部品とRNの境界

SDK 58、9月23日。Android専用の `Host` 内で `Column`、`IconButton`、`LazyColumn` などを使う。Composeの `modifiers` は配列順で適用され、`background` の後に `paddingAll` を置くとタップ面の内側に余白ができる。`RNHostView` はCompose内にRNビューを置くための部品。フィルタなどを将来置き換える際は、まとまりごとにAndroid用実装を分け、短いラベル・大きな文字・選択状態の読み上げを確認する。アイコン1個ずつに境界を増やす利点は確認できない。[原文](https://docs.expo.dev/versions/v58.0.0/sdk/ui/jetpack-compose/)

### D08　Hostの計測とIME

SDK 58、11月19日。`matchContents` は子から親へ測定値を返す。縦にスクロールする `LazyColumn` と同じ軸を自動採寸すると最大高さが無限になり、公式にクラッシュ例がある。親の高さを制約するか、対象軸の `matchContents` を無効にする。`ignoreSafeAreaKeyboardInsets` は初回マウント時のみ指定でき、既定はfalse。既存のAndroid用キーボード回避と同じ領域を二重に補正しない。`seedColor` と `colorOverrides` はMaterialの色役割を調整できるが、全体の家計グループ色・収支の符号は既存の規則を用いる。検証はシートを開く・IMEを出す・閉じる、横/縦のスクロール競合、ダーク切替。[原文](https://docs.expo.dev/versions/v58.0.0/sdk/ui/jetpack-compose/host/)

### D09　Universal Listの実際のリサイクル仕様

SDK 58、11月19日。普通の `.map` で全件分のReact要素を親で作る経路と、`List.ForEach` に `data`・`keyExtractor`・描画関数を渡す経路は区別する。後者は `recycling=true` が既定。可視範囲の外側に描く行数の既定は片側10、未計測行の仮の高さは64（Androidはdp、iOSは行insetを除いたpt、Webはpx）。`@expo/ui@58.0.29` の `src/universal/List` でもAndroidは `LazyColumn.Items`、iOSはSwiftUI側の `List.ForEach` に委譲し、Webは別実装。資料D04内の説明よりこちらが対象SDKに具体的である。スクロール中の未描画部分・フォント拡大後の補正・セル再利用時の削除対象を測れる比較候補として残す。現行の `TxRow` を利用するには、ネイティブ行用の構成かRNをホストする構成を選び、日付見出しと長押し・確認操作を同じ条件に揃える。[原文](https://docs.expo.dev/versions/v58.0.0/sdk/ui/universal/list/)・[SDK 58の実装](https://github.com/expo/expo/tree/sdk-58/packages/expo-ui/src/universal/List)

### D10　Native Tabsの操作と実装コスト

11月10日。SDK 58のimportは `expo-router/native-tabs`。全タブの画面を初回にマウントし、Androidでは最大5タブ。Androidは標準で下部insetを自動処理、iOSは最初のScrollViewのinsetを自動調整する。`tabBarRespectsIMEInsets` でAndroidのタブをIMEの上に持ち上げるにはAndroid 11以降かつ `resize` が必要。FlatListでの再タップ時の先頭復帰・スクロールによる最小化にも制約がある。現状の4タブ＋中央の独立ボタン、タブ変更前の月リセット、Android 10のIMEを一緒に満たすには追加実装が必要なので、今回は既存のヘッドレスタブを使う。試作する場合は初回JS仕事量と、＋の連打で記録画面が開く回数・戻った後の選択タブ・月を比較する。[原文](https://docs.expo.dev/router/advanced/native-tabs/)

### D11　Expo Router APIの操作契約

SDK 58固定版は10月13日、パッケージ58.0.32。`push` は履歴に画面を積み、`dismissTo` は指定先まで閉じるが、その行き先が履歴に存在しない場合は現在の画面を置き換える。`prefetch` はバックグラウンドでルートを準備する。手動のタブ切替時にすべてをprefetchする理由はない。既存の `/add?id=…` には取引IDを渡し、検索から編集した際は戻る操作で同じ検索結果、一覧から開けば同じ一覧に戻る。中央＋は `router.navigate('/add')` と同期的な連打防止。タブの `backBehavior="history"` を含め、Androidの戻る操作で開いた経路を逆に辿れることを確かめる。[原文](https://docs.expo.dev/versions/latest/sdk/router/)・[SDK 58版](https://docs.expo.dev/versions/v58.0.0/sdk/router.md)

### D12　57から58へのナビゲーション変更

11月3日。タブの行き先は明示宣言に限られ、保護ルートは登録されたままガード失敗時にリダイレクトする。ディープリンクに親を挿入する規約は `unstable_settings.anchor`。iOSの透明なネイティブヘッダー下はスクロールビューの `contentInsetAdjustmentBehavior`、不透明なヘッダー下はコンテンツの開始位置に任せる。さらにtopのSafeAreaViewを重ねると余白が二重になる。現行はSDK 58なので、履歴の縦スクロール所有者を変えた際のiOS初行位置、Webブラウザバック、下タブの再選択を重点的に確認する。アプリロックやルートガードの変更はこの改善には必要ない。[原文](https://docs.expo.dev/router/migrate/sdk-57-to-58/)

### D13　画像の初期表示、再利用、キャッシュ

SDK 58固定版は11月6日、58.0.18。ローカル画像やサムネイルに `contentFit` と `placeholderContentFit` の同じ値を指定すれば、プレースホルダーと本画像の縮尺の差による揺れを避けられる。画像付き行を将来リサイクルする際は `recyclingKey` に画像を識別する値を渡し、前の行の画像が残らないようにする。`cachePolicy` は画像の保存場所を変えるため、レシートのような個人情報を永続キャッシュに置くには保存・削除・オフラインの仕様が先に要る。今回の取引行のカテゴリ記号は既存シンボルで識別できるため、ネットワーク画像のデコードやキャッシュ処理を足さない。レシートの表示・保存が本アプリに既にあるという判断の根拠には用いない。[原文](https://docs.expo.dev/versions/latest/sdk/image/)・[SDK 58版](https://docs.expo.dev/versions/v58.0.0/sdk/image.md)

### D14　Hapticsを端末条件に合わせる

SDK 58固定版は9月15日、58.0.8。iOSは低電力設定やユーザー設定等により触覚が発生しない場合があり、Androidには端末のフィードバックを使う `performAndroidHapticsAsync` がある。これらはPromiseで、選択結果の表示を振動成功に依存させない。既存 `haptics.ts` はAndroid 14より前は `Clock_Tick`、対応版は `Segment_Tick` の失敗時にフォールバックし、最終失敗もUI処理から切り離す。フィルタ選択は文字と選択状態に反映し、スクロールした行ごとには振動しない。設定オフ・古いAndroid・iOS低電力で選択・登録が各1回だけ成立することが試験点。[原文](https://docs.expo.dev/versions/latest/sdk/haptics/)・[SDK 58版](https://docs.expo.dev/versions/v58.0.0/sdk/haptics.md)

### D15　React Nativeのリスト描画

RN 0.88に対応する公式ページ、10月27日。初期描画数は最初の画面を埋める程度、1バッチの行数は大きすぎるとJSを占有してタップまでの時間が延びる。`windowSize` の単位は表示領域の高さで、狭めるほどメモリと高速フリック時の空白の交換になる。`removeClippedSubviews` はビューを切り離すだけでメモリ解放と同義ではない。現行の検索で使う `SectionList` と同じ安定ID・日別セクションを候補にし、月移動中に非表示のページが読み上げられないこと、長文取引と大文字でも切れないことを確認。可変高であるため、固定高さの `getItemLayout` は使わない。[原文](https://reactnative.dev/docs/optimizing-flatlist-configuration)

### D16　FlashList 2.xの適用条件

10月1日。RNのFlatListと同様の `data`・`renderItem` に加え、行の種類に応じた `getItemType` で別のリサイクルプールを指定できる。異種の日付見出しと取引行を試す際に意味がある。公式Usageは開発モードの小さなバッファで速度の優劣を決めないよう案内している。新規の依存になるため、まず既存リストで通常月・重い月のフレームと空白、編集直後の表示を測る。実測に課題が残る場合、日計・補助文・操作・文字倍率を揃えた版を比較する。Expoによる対応版の指定と本アプリの動作はそれぞれ確認する。[原文](https://shopify.github.io/flash-list/docs/)・[Usage](https://shopify.github.io/flash-list/docs/usage/)

### D17　FlashList v2で変わる設定

10月1日。v2はRN New Architectureが必要。v1の `estimatedItemSize`・`estimatedListSize` は不要、`onBlankArea` はサポート外。`maintainVisibleContentPosition` は既定有効で、先頭追加や並べ替えの際に表示位置に影響する。Expo UIの `List.ForEach` は同名の `estimatedItemSize` を持つため、別製品のパラメータをコピーしない。v2を試すなら月の先頭で取引追加、絞り込み中の編集削除、月を跨ぐ変更、スクロール再開を検証する。空白は画面記録とフレームトレースを照らして数える。[原文](https://shopify.github.io/flash-list/docs/v2-migration/)

### D18　Reanimatedの入退場制御

公式4.x、取得時のHTTP Last-Modifiedは11月20日（公開日の記載は確認できず）。アニメーションのbuilderはコンポーネント外、または `useMemo` に置く。New Architectureでは `nativeID` の上書きや、親のビュー平坦化で入退場が働かない場合がある。設定に応じて `ReduceMotion.System` を使える。履歴スクロール中にもセルはマウントされる。取引作成の確認は登録処理が完了した時点で表示する。既存の `MonthScreen` はUI側で水平移動し、月確定時にRN側へ渡す。縦リストとの競合、連続スワイプの取り消し、アプリのモーション軽減設定、タブタップ時の反応を検証する。[原文](https://docs.swmansion.com/react-native-reanimated/docs/layout-animations/entering-exiting-animations/)

## Web実装での対照試験

2026年11月22日に、実ライブラリ5通りを同一の合成データで実行した。Chromium 156.0.8078.79、393×852 CSS px、標準文字、ライトテーマ。React Native Web 0.21.4、Expo UI 58.0.29、Expo 58が推奨するFlashList 2.3.2を使用した。全候補ともReactのproductionモードで、同一の64px行に店名と金額を表示。初期表示後1.5秒、704pxのホイール入力を5回、到達後1.5秒の2時点で取引ID付きのDOM行だけを数えた。通常の実アプリではメモ・ポイント・文字倍率によって行高が変わる。

| 実装 | 1,000件・初期 → 移動後 | 10,000件・初期 → 移動後 |
| --- | ---: | ---: |
| 全件を `map` | 1,000 → 1,000 | 10,000 → 10,000 |
| RNW `FlatList` 既定 | 147 → 177 | 147 → 202 |
| RNW `SectionList` 既定、1セクション | 147 → 167 | 147 → 167 |
| Expo UI `List.ForEach` 既定 | 24 → 44 | 24 → 44 |
| FlashList 2.3.2 既定 | 29 → 30 | 29 → 30 |

10通りすべてで、3,520px移動した地点の同じ座標がID `preview-61` の取引を指した。Expo UIのWeb版でもデータを渡した `ForEach` の初期DOM数は1,000件と10,000件で同じだった。事前に構築したReact要素の総数、GPUで描いたフレーム、末尾までの到達時間はこの数に含まれない。既定の先読み量やスクロール後の投入タイミングは方式ごとに違うため、DOM数を使って端末の速度順位を付けることはできない。

再実行はルートと `apps/mobile` の通常の依存を入れ、Playwright用のChromium、または `CHROMIUM_PATH` にシステムのChromiumを指定して `bun docs/ui-research/list-library-check.mjs`。FlashListは一時ディレクトリに取得する。出力はバージョンと各条件の計数。各方式が同じ取引に到達し、仮想化した一覧のDOM数が全件数より少ないことをassertする。スクロール後の計数はスケジューリングに伴って変動する。 [再現スクリプト](list-library-check.mjs)・[取引データ](history-fixture.mjs)

## 同一条件で比較する場合の判定方法

1. 同じ合成データ・同じ月で0／5／50／1,000／10,000件を使う。取引区分とID・日計を揃え、長文・桁の多い額・ポイント一部充当・振替を混ぜる。履歴の件数とストアの全期間件数を区別する。
2. release相当で同じ端末・ビルド種別・画面幅・文字倍率を使う。起動後に履歴を開き、最初の行が表示されるまで、連続フリック、減速中のタップ、日付を跨ぐ編集、元の画面に戻ったときのIDと位置を記録する。60Hzでは1周期が約16.7ms、120Hzは約8.3ms。フレーム分布・締切超過率・メモリの高水位と併せ、記録条件を保存する。
3. 大文字のときの折返し、読み上げで複数月が混ざらないこと、削除確認が指定IDを保つこと、ライト/ダークで符号と文字が判別できることを受け入れ条件にする。メモリやフレームが改善してもこれらが崩れた選択肢は採用しない。
4. 上記3種のリスト間のネイティブ実機速度順位はこの資料では確定していない。採用理由のうち、既存ルートと操作を維持するコスト、全件展開を回避する構造、SDK 58で実装可能なAPIはソースから確認済み。今回の画面で実際に採った検証結果はブランチの検証記録に従う。
