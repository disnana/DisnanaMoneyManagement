# Revolutから学ぶ残高・明細の見せ方と、Androidでの実装条件

調査日は2026年11月22日。日本向けGoogle Playの掲載画像8枚、Revolut日本の公開ヘルプと商品資料、GummbleのAndroidキャプチャを確認した。掲載画像は開発元が選んだ利用例であり、アプリの操作回数は公式手順から数えた。今回、ログイン後の最新日本版を実機で操作していない。地域・OS・取得時期が異なる資料には個別に注記する。[日本向けGoogle Play](https://play.google.com/store/apps/details?id=com.revolut.revolut&hl=ja&gl=JP)・[日本向け公式サイト](https://www.revolut.com/ja-JP/)

## 何に目が向き、次に何ができるか

| 観察した画面と資料の範囲 | 実際に見えること | マネーちゃんで検証する案 |
| --- | --- | --- |
| 支出分析、日本向けAndroidストア6枚目 | 黒い地に色の異なるリングを置き、中央に「支出」・月額・対象月をまとめる。その下に期間の選択肢があり、カテゴリ行では左に名前と件数、右に金額と割合が並ぶ。グラフと明細の間に別の大見出しや巨大なボタンが入らない。[Google Play掲載画像](https://play.google.com/store/apps/details?id=com.revolut.revolut&hl=ja&gl=JP) | `analytics/index.tsx` の円グラフ・カテゴリ行・詳細遷移を利用する。同じ選択月・家計グループ・集計値を各表示に渡す。リングの色を見分けられなくても、下のカテゴリ名と円額で同じ答えを得られるようにする。件数を付けるならタップ後の対象件数と照合する。 |
| 送金、日本向けAndroidストア3枚目 | 受取人の下に送金額を最も強く表示し、引落元と残高はその次、最後に主操作を1つ置く。金額の大小と字の太さで読む順番がわかる。[Google Play掲載画像](https://play.google.com/store/apps/details?id=com.revolut.revolut&hl=ja&gl=JP) | 記録の確認でも「何にいくら → どこから払う → 登録」の順にする。ポイント使用時は購入額と実支払額の両方にラベルを付ける。同じ強さの操作ボタンを横に多数並べない。 |
| ホーム、日本の公式「Revolut 10」説明図 | 青い背景に残高が直接載り、その下にアカウント選択、よく使う操作、最近の取引、下部に行き先が並ぶ。最近の取引だけをひとまとまりの面に置き、上の残高との区切りを作っている。図の公開日は2023年10月30日。OS表記はない。現在の日本語ヘルプでは下部のホームから分析へ入ることを別に確認した。[公式のホーム図](https://www.revolut.com/ja-JP/blog/post/rev10-introduction/)・[日本版の分析手順](https://help.revolut.com/ja-JP/help/accounts/budget-and-analytics/what-is-the-analytics-dashboard/) | 「今使える口座残高を確認する」なら、家計グループ・各口座の円額・その合計を同じ列で読み終えられる構成が合う。借入や未払いを差し引いた金額は別の名前にする。送金・外貨・投資を主目的にしたボタン配列を家計簿ホームに持ち込む理由は薄い。 |
| 初期登録、Androidの第三者記録 | Gummbleで画像として閲覧した先頭5枚はブランド導入、登録・ログインの選択、電話番号入力、SMSコード、居住国。白地の入力画面では大きい設問、入力箇所、続行へと視線が流れる。フロー詳細記載の最新撮影日は **2023-10-30**。「Latest」を2026年版の意味で使えない。[Gummble Android](https://gummble.com/apps/revolut-android)・[キャプチャ情報](https://gummble.com/apps/revolut-android?flow=a99191a0-33c4-485c-8ebf-70d991c26e4d&tab=flows) | レシート確認は「何円を記録するか」を入口にし、必要な人が品目を修正できるようにする。既存の短いチュートリアルと中央＋を生かし、決済サービスの本人確認フローを追加しない。 |

明暗は、過去の公式発表でAndroidのOS連動・ライト固定・ダーク固定を確認できる。今回、同一の現行ホームを両テーマで撮った比較画像、タップ時の振動、ページ遷移の所要時間は確認できていない。マネーちゃんでは既存の `themePref.ts` と `motionPref.ts` を生かす。押した項目の反応を先に返し、設定保存や画面遷移の完了は別の状態として示す。[Revolutのテーマ発表](https://www.revolut.com/blog/post/turn-down-the-lights-dark-mode-is-here/)・[キャプチャの範囲](https://gummble.com/apps/revolut-android)

## 8つの目的で公式手順をたどる

回数は表に書いた起点からの選択・タップ。スクロール、文字入力、初回同意、外部銀行での認証は別に示す。Revolutの日本語ヘルプは多くがOS共通で、Android固有と明記された画面はGoogle Play・Gummbleの観察に限る。

| 目的 | 起点、経路、分かっている回数 | 実装時に避けたい取り違え |
| --- | --- | --- |
| 1. 総資産を知る | 日本向け公式図でホームのアカウント残高を直読できる。日本の現行ヘルプで総資産分析と手入力資産の存在は確認できるが、そこまでのタップ数は不明。参考としてオランダ版ではホーム → 分析を1回 → 下方に資産・負債の概要、内訳は対象をもう1回。[日本の資産ヘルプ](https://help.revolut.com/ja-JP/help/accounts/budget-and-analytics/how-do-i-add-a-custom-asset-to-my-total-wealth-view/)・[オランダの公式手順](https://help.revolut.com/en-NL/help/accounts/budget-and-analytics/how-can-i-see-my-total-wealth-analytics/) | アカウント残高、口座合計と純資産では対象が違う。値のすぐ近くに範囲を書く。 |
| 2. 今月の支出を知る | ホーム → 右上の分析（1）で支出ウィジェット → 支払い金額（2）で内訳。選んだ期間が当月でなければ期間操作が別途必要。日本語ヘルプでは複数のグラフ形式を案内し、カード別の並べ替えにはiOS限定の注記がある。[支出分析の公式手順](https://help.revolut.com/ja-JP/help/accounts/budget-and-analytics/how-can-i-see-my-spending-and-income-analytics/) | グラフの真上か中央に月と円額を表示し、前月額と読み違えないようにする。 |
| 3. 銀行口座を追加・管理 | 日本向けの**チャージ用連携**はホーム → チャージ → 新しい銀行口座を接続 → 銀行選択の3回、必要な人は「変更」を含め4回。続いて銀行側でログイン・承認しアプリへ戻る。[銀行連携の公式手順](https://help.revolut.com/ja-JP/help/app-features/linking-external-bank-accounts/how-do-i-link-an-external-account-to-my-revolut-app/) | 家計簿に口座名と残高を手入力する操作、金融機関の明細自動取得、実際の資金移動は別機能。用途と必要な同意を先に示す。 |
| 4. レシートを撮る | 公開手順は**割り勘**。対象取引から割り勘 → 相手を選ぶ → 品目 → スキャンで撮影・ファイル入力まで最低4操作、撮影・権限・品目確認は別。家計簿への新規仕訳件数はここから算定できない。[レシートの公式手順](https://help.revolut.com/ja-JP/help/transfers/internal-transfers/splitting-bill-using-receipts/) | 家計簿で利用者が必要なのは自分の記録。連絡先選択を必須にしない。 |
| 5. 読み取った商品を直す | AIが品目、数量、税、割引等を抽出し、確定前の編集・追加・割当確認を案内。何回タップで修正完了かは記載なし。[確認と編集](https://help.revolut.com/ja-JP/help/transfers/internal-transfers/splitting-bill-using-receipts/) | 修正後も画像・入力済みの値・合計との差を確認できるようにする。AIの信頼度より、未入力や金額の差額を先に示す。 |
| 6. 一括・品目別を切り替える | 割り勘では手動で合計を分ける方法と、品目を追加・割り当てる方法がある。購入履歴への一括記録と品目別仕訳の途中切替、編集保持の挙動は公開資料では不明。[割り勘の手動操作](https://help.revolut.com/ja-JP/help/transfers/internal-transfers/splitting-bill-using-receipts/) | マネーちゃんではモードを変えても編集済みの下書きを保持し、確定後の台帳への二重計上を防ぐ。 |
| 7. カードと家計簿の重複を解消 | 日本のヘルプは加盟店の保留と確定が両方現れ得ることを説明。CSVと手入力を突合する家計簿フローや操作回数は確認できない。[支払い状態の公式説明](https://help.revolut.com/ja-JP/help/accounts/why-is-my-balance-now-negative/) | 同日・同額でも別の支出はある。引落・購入・保留を見分けられる候補表示を先に設計する。 |
| 8. 過去取引を探し編集 | 対象が見える履歴から「明細 → 現カテゴリ → 新カテゴリ → この取引のみ／この事業者のすべて」の4選択。後者はその事業者の過去と将来に及ぶ。米国の旧記事は金額・カテゴリ等の検索を説明しているが、現在の日本版での検索開始位置・操作数は未確認。[日本のカテゴリ変更](https://help.revolut.com/ja-JP/help/accounts/budget-and-analytics/how-to-assign-and-adjust-categories-for-your-transactions/)・[過去の検索紹介](https://www.revolut.com/en-US/blog/post/you-can-now-search-for-your-transactions/) | 個別修正を既定にし、複数に適用する時だけ件数・期間を確認。保存後に元の検索条件・位置で結果を見直せるようにする。 |

## マネーちゃんで実装する時のAndroid設計・受入条件

以下は `main` の `daf9d53` を基点にした設計案。モバイルはExpo SDK 58、React Native 0.88を採用し、`@expo/ui`、Safe Area、Keyboard Controller、Reanimated を導入済み。Android側は `theme.ts`、iOS側は `theme.ios.ts` がテーマを供給する。[依存一覧](../../apps/mobile/package.json)・[Androidのパレット](../../apps/mobile/src/lib/theme.ts)・[iOSのパレット](../../apps/mobile/src/lib/theme.ios.ts)

| 対象 | 現行の入口と変更案 | 確認の仕方・根拠 |
| --- | --- | --- |
| 色と面 | `lib/theme.ts` の `bg`、`card`、`fill`、`tint` と意味色を使い続ける。今のAndroidは `separator` が透明。口座一覧は各行に独立面を増やさず、同じ左端と金額の右端をそろえ、合計の上だけに薄い線か余白を置く。Material Youを試す場合は `@expo/ui/jetpack-compose` の `Host` を選択シート単位で利用。アプリのテーマ固定を `colorScheme` に渡す。壁紙色はAndroid 12以降、固定なら既存のティールをseedにできる。RN側は `usePalette()` で対をなす背景色・文字色を決める。 | ライト・ダーク・壁紙色・API 29の固定色を別々に検査。本文と金額に4.5対1を目安とし、正負・選択・エラーはラベルや符号も併用。キャラクターの絵は元の色で扱う。[Material 3の色と役割](https://developer.android.com/develop/ui/compose/designsystems/material3)・[Expo SDK 58 Host](https://docs.expo.dev/versions/v58.0.0/sdk/ui/jetpack-compose/host/)・[Androidのアクセシビリティ](https://developer.android.com/design/ui/mobile/guides/foundations/accessibility) |
| 日本語、金額、タップ領域 | `ui/HeroCard.tsx` の資産表示切替は44dp四方。見た目のアイコン径を保ち、Androidの押せる領域を48dp以上にする。`SettingsSwitchRow` のように行全体で1操作にする。長い店舗・口座名は改行可能にし、桁数の多い円額は必要なら次行に送る。`useWindowDimensions()` の幅・`fontScale` はレイアウト切替に使い、文字サイズに倍率を掛け直す用途には使わない。 | 320・360・412dp、標準と最大文字、「−¥1,234,567」と長い日本語名、文字入力後の一覧で桁切れ・二重読み上げ・隣の操作への誤タップを確認。API 34以降は非線形200%を端末設定で検証する。旧端末の拡大結果とは別に測る。[タッチ対象](https://developer.android.com/develop/ui/compose/accessibility/api-defaults)・[非線形の文字拡大](https://developer.android.com/about/versions/14/features#non-linear-font-scaling)・[RNの画面サイズ](https://reactnative.dev/docs/usewindowdimensions) |
| システムバーと戻る | `app.json` の `predictiveBackGestureEnabled` は有効。`(tabs)/_layout.tsx` の下部Safe Area、`ui/FormScrollView.android.tsx` のIME追従、`MonthScreen.tsx` の月スワイプが両端24dpを空ける実装を生かす。背景は画面端まで、操作はナビ・IMEインセットの内側。シートが最前面の時は戻る1回でシートを閉じ、遷移先や選択月を変えない。 | API 29の3ボタン、API 35/36のジェスチャーで「キーボード → 選択シート → 入力画面 → 一覧」を一段ずつ戻る。端からの戻るを途中で取り消した時に編集値・月・スクロール位置を保持する。API 36ターゲットでのedge-to-edge強制、API 37ターゲットの大画面リサイズにも備え、折りたたみ・分割画面はウィンドウ実幅で確認。[エッジへの配置](https://developer.android.com/design/ui/mobile/guides/layout-and-content/edge-to-edge)・[予測型戻る](https://developer.android.com/guide/navigation/custom-back/predictive-back-gesture)・[API 36](https://developer.android.com/about/versions/16/behavior-changes-16)・[API 37の大画面](https://developer.android.com/about/versions/17/changes/ff-restrictions-ignored) |
| モーション、処理待ち、性能 | `lib/motionPref.ts` の端末・アプリ両方の低減設定と、`lib/haptics.ts` の未対応端末用フォールバックを使用する。タブは選択状態をすぐ更新。レシート解析中も画像と手入力の選択肢を表示し、再試行中の連打は同じ下書きに集約する。リスト内の行ごとに新しくCompose `Host` を作る案は、長い明細スクロールの実測後に判断する。 | 同じreleaseビルド条件・同じデータでタブ移動、履歴→詳細→戻る、長いリストのスクロールを比較。`frameDurationCpuMs` の分布を取り、API 31以降は `frameOverrunMs` のP95・P99も比較する。Expo Goの開発時の秒数とrelease値は別に記録。モーション低減時、音声・振動を切った状態でも選択、保存成功、再試行が区別できること。[Androidのフレーム指標](https://developer.android.com/topic/performance/benchmarking/macrobenchmark-metrics) |

既存色を残せる根拠として、基点コミットの16進色からsRGB相対輝度を計算した。`text` と `bg` はライトで15.43対1、ダークで15.78対1、`textSecondary` と `bg` は5.18対1と8.20対1。`onTint` と `tint` も5.47対1と11.60対1だった。これらは不透明色同士の計算値で、押下・透過・グラフ上の文字は実際の背景で別に測る。[配色の出典](../../apps/mobile/src/lib/theme.ts)・[WCAGのコントラスト計算](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)

最初の比較は、いつものホームで家計グループ内の残高を読み、今月の支出から1件の明細まで開いて元の位置に戻れるかを同じデータで試す。同じ操作を文字拡大、読み上げ、モーション低減でも繰り返し、迷った場所と金額の読み違いを記録する。
