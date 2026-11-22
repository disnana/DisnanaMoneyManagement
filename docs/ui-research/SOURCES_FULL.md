# 一次資料・技術資料リンク集（URLを省略せず保存）

調査基準日: **2026年11月22日**。原則として公式ドキュメント、開発元・提供元の一次情報。ツールやSDKの利用可否は実際のアプリが使用するバージョンでも検証する。

各項目には `URL / 確認できた内容 / Codexで読む観点 / 注意点` を残す。ここに書いたことはサイト本文の転載ではなく、実装に必要な確認ポイントのオリジナルなメモ。**Codexはリンクをすべて取得できたと推測せず、成功/失敗を記録し、元ページを読むこと。**

## A. DMM Turtle：企業のデザインシステム運用の実例

### A01. Turtle Design System 公式トップ
URL: https://turtle.dmm.com/
- 確認: DMMのログイン・決済などを支えるプラットフォーム領域における一貫した体験を提供するデザインシステム。
- Codex: 共通体験/共通語彙/再利用可能パターンという思想を抽出し、アプリ独自のDesign Systemへ写像。
- 注意: DMM全モバイルアプリに同一実装が使われると推定しない。

### A02. Turtle の背景と導入目的
URL: https://turtle.dmm.com/about/introduction/
- 確認: 画面ごとの体験のばらつき、車輪の再発明、既存画面の調査負荷を課題とする。2025年8月時点の導入状況も掲載。
- Codex: 画面横断の一貫性と開発体験の両方を品質要件に含める。既存画面の操作役割を棚卸しする。

### A03. Turtle デザイン原則
URL: https://turtle.dmm.com/about/design-principle/
- 確認: Achieve Goals / Bring out Abilities / Consistency / Design Intent / Evolve。
- Codex: 各UI変更の根拠としてユーザーの目的、画面間の一貫性、将来変更可能性を明示。単なる見栄えだけを評価軸にしない。

### A04. AI-friendly デザインデータの作り方
URL: https://turtle.dmm.com/guidelines/ai-friendly-design-data/
- 確認: 自動生成名を意味のあるレイヤー名にする、Auto Layoutを用いる、固定幅を避ける、不要要素を隠す/削除する、変数モードに注意する等。
- Codex: Figmaファイルを作る場合に設計データをAI向けに構造化し、デザインからコードへの推論負担を減らす。
- 注意: ここにあるHTMLタグのレイヤー名指定はDMM独自MCPの仕組み。React Native/Composeに直接適用できる一般ルールだと誤認しない。

### A05. 協業しやすいデザインデータ
URL: https://turtle.dmm.com/knowledge/user-friendly-design-data/
- 確認: レイヤー命名、余白統一、アイコン統一、コンポーネント化、デザイントークン、テキスト長、通常/空/エラー/ローディング等の状態、レスポンシブ。
- Codex: 特に各コンポーネントの状態マトリクスを抽出。画面設計レビュー用チェックリストへ反映。

### A06. DMMの導入ガイド
URL: https://turtle.dmm.com/getting-started/guides/
- 確認: 現状分析→段階的適用→小さくリリース・テスト→ルール/ドキュメント化。
- Codex: 全画面一括リライトより、既存UIから段階移行を採用。

### A07. Turtleの公開リソース
URL: https://turtle.dmm.com/products/resources/
- 確認: Figma UI Kitは公開URLあり。GitHub/Storybookはサイト上「準備中」。
- Codex: Figmaデザイン参考は可。非公開のReactパッケージがダウンロードできると思い込まない。

### A08. 公開Figma UI Kit
URL: https://www.figma.com/community/file/1564449938298937268
- 確認: Turtleサイトのリソースページからリンクされている。Figma側の閲覧/取得は権限・接続に依存。
- Codex: コンポーネントの粒度、バリアント、レイヤー命名、余白の規則性を解析する。著作物をそのまま模倣しない。

### A09. デザイントークンの公開ページ
URL: https://turtle.dmm.com/products/design-tokens/
- 確認: 概念説明は公開、詳細カタログは現時点で「準備中」。
- Codex: 具体的なカラーコードや数値が公開済みと偽らない。独自設計値を定義し実機で検証。

### A10. コンポーネントの公開ページ
URL: https://turtle.dmm.com/products/components/
- 確認: アトミックな再利用部品の思想は掲載、詳細カタログは「準備中」。
- Codex: アプリ独自のUI部品を設計し、公開コンポーネント実装の存在を仮定しない。

### A11. DMM Developers Blog: AI × Turtle で実現する Vibe Coding（2025/08/05）
URL: https://developersblog.dmm.com/entry/2025/08/05/110000
- 確認: FigmaとReactコンポーネントのマッピング、独自MCP、トークン自動変換、AI-friendlyデータ、プロパティ情報の事前確定と生成精度について紹介。
- Codex: デザインを見せるだけでなく、正規のコンポーネント名とpropsを明示。色などを推測で埋めさせない。`fullWidth`などの意味あるpropsで誤差を減らす思想を採用。
- 注意: 記事の実装対象は主にWeb/React(Next.js)のコーディング。RN向けライブラリと混同しない。

### A12. DMM Developers Blog: Turtleポータル公開（2025/10/28）
URL: https://developersblog.dmm.com/entry/2025/10/28/110000
- 確認: DMMチームが知見共有のためサイトを公開した経緯。
- Codex: 公開情報の射程と時系列を把握。

### A13. DMM Developers Blog: Turtle開発（2024/12/02）
URL: https://developersblog.dmm.com/entry/2024/12/02/110000
- 確認: トークン、Figma、React、Storybook、運用原則などの構成を紹介。
- Codex: ドキュメント、UIカタログ、コンポーネントという3層を自前のアプリにも構築。

### A14. DMM Developers Blog: Kotlin/Composeコードレビュー（2025/06/06）
URL: https://developersblog.dmm.com/entry/2025/06/06/110000
- 確認: Composeのpadding指定や非同期テスト、`AndroidView`のライフサイクルなどAndroid固有の指摘例。
- Codex: デザイン品質だけでなく実装品質のレビュー観点に採用。

### A15. DMM Turtleを取材した外部記事（一次情報の補助）
URL: https://www.unprinted.design/articles/dmm-turtle-ai-design-system/
- 確認: 社内関係者インタビュー。製品横断の共通機能、Figma/MCP、既存画面改修時の難しさなどが記される。
- Codex: 新規画面と既存画面のAIコード生成精度差を想定して、既存画面を小規模に変更する。
- 注意: 第三者メディアなので公式発表とは区別。

## B. 2025年登場のAI UI制作ツールとFigma連携

### B01. Google Stitch 発表（2025/05/20）
URL: https://developers.googleblog.com/en/stitch-a-new-way-to-design-uis/
- 確認: テキストや画像・ワイヤーフレームからUI案を生成し、複数案を反復、Figmaへの受け渡しやフロントエンドコード出力を提供。
- Codex: 同じ要件から情報密度/階層/動線を変えたUI案を2〜3通り作る。生成コードはRN/Kotlin/Flutterでの動作保証と同義ではない。

### B02. Google Stitch サービス
URL: https://stitch.withgoogle.com/
- Codex: UI草案・レイアウトのアイデア出し。AI生成の見た目をそのまま製品実装の正解としない。

### B03. Figma Make 発表（2025/05/07）
URL: https://www.figma.com/ja-jp/blog/introducing-figma-make/
- 確認: プロンプトから動く高精度プロトタイプやコードを生成し、試作/修正を反復できる。
- Codex: 画面遷移、空/エラー状態、入力操作などをプロトタイプで事前検証。

### B04. Figma Make の公式利用案内
URL: https://help.figma.com/hc/en-us/articles/31304412302231-Explore-Figma-Make
- 確認: プロンプト/既存Figmaデザインからインタラクティブな試作を作る。
- Codex: Figma Make成果物をモバイルのネイティブ実装とは別物と認識する。

### B05. Figma Make の利用プランと制約
URL: https://help.figma.com/hc/en-us/articles/31722591905559-Figma-Make-FAQs
- Codex: 利用可能なシート/プランや公開条件を事前確認。利用不可ならCodexの試作で代替。

### B06. Figma Make 制作ワークフロー
URL: https://help.figma.com/hc/en-us/articles/31304485164695-Create-a-Figma-Make-file
- 確認: タスク/前提/制約の明文化、既存デザインの添付、対象要素だけの編集、機密をチャットに貼らないなど。
- Codex: 機能やAPIキーをダミーにして検証し、全画面再生成を避ける。

### B07. Figma MCP 公式概要
URL: https://developers.figma.com/docs/figma-mcp-server/
- 確認: Codex等のエージェントがFigmaの構造化デザイン情報を使って実装できる。書き戻しはプラン・権限制約あり。
- Codex: 実際に接続してデザイン情報を取得した場合のみ、Figma情報を参照したと表明。

### B08. Figma MCP 遠隔サーバーセットアップ
URL: https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/
- 確認: `https://mcp.figma.com/mcp`。CodexアプリのFigmaプラグイン、Codex CLIのサーバー追加手順がある。
- Codex: Figmaを利用する場合は公式の接続方式を優先。

### B09. Figma MCP向けファイル構造
URL: https://developers.figma.com/docs/figma-mcp-server/structure-figma-file/
- 確認: 意味のあるレイヤー名、Auto Layout、Variables、Components、Annotations、Code Connect。
- Codex: 画面設計と実装を往復しても崩れないFigmaの構成を定義。

### B10. Figma Code ConnectとMCP
URL: https://developers.figma.com/docs/figma-mcp-server/code-connect-integration/
- 確認: Figmaコンポーネントとコードの接続によって実際のprops/実装例をエージェントが受け取れる。
- Codex: ライブラリを作るならコンポーネントにコード上の名前/propsを対応付ける。利用条件がある。

### B11. Figma Code Connect for React（React Nativeも対象）
URL: https://developers.figma.com/docs/code-connect/react/
- 確認: FigmaコンポーネントとReact/React Nativeの部品の対応。Template files方式が現在の推奨。
- Codex: 過去のparser-basedの記事ではなく最新テンプレート方式を確認。

## C. Google/Android: デザイン、適応、性能

### C01. Material 3 Expressive発表（2025/05/13）
URL: https://blog.google/products-and-platforms/platforms/android/material-3-expressive-android-wearos-launch/
- 確認: モーション、パーソナライズ、見やすさ、弾むような動きなどを強化したAndroidのUI刷新。
- Codex: スプリング・強弱・情報視認性を選択的に採用。全要素を派手にしない。

### C02. Jetpack Compose / Material 3 公式
URL: https://developer.android.com/develop/ui/compose/designsystems/material3
- 確認: 色スキーム、コンポーネント、動的カラー、ライト/ダーク、Expressive。
- Codex: Android版UIの意味ある色・役割・動きの基準にする。

### C03. 画面幅のWindow Size Classes
URL: https://developer.android.com/develop/adaptive-apps/guides/use-window-size-classes
- 確認: compact `<600dp`, medium `600–839dp`, expanded `840–1199dp`, large `1200–1599dp`, extra large `≥1600dp`。利用可能画面幅が動的に変化する。
- Codex: 端末名でなく利用可能幅でレイアウトを変える。2カラム化は実際の情報構造に基づいて決める。

### C04. Android Edge-to-Edgeデザイン
URL: https://developer.android.com/design/ui/mobile/guides/layout-and-content/edge-to-edge
- 確認: 背景・スクロールはシステムバーの背後に広げ、文字/タップ操作はInsetで保護。ジェスチャー競合を避ける。
- Codex: 各画面のtop/bottom inset、キーボード、折りたたみ/横画面、ジェスチャーナビの動作をテスト。

### C05. Android Edge-to-Edge実装
URL: https://developer.android.com/develop/ui/views/layout/edge-to-edge
- 確認: Android 15/API35ターゲットなどの条件と実装上の対処が掲載。
- Codex: 対象targetSdkやOSに合わせてシステムバーとInsets対応を選ぶ。

### C06. Androidタッチ領域とアクセシビリティ
URL: https://developer.android.com/guide/topics/ui/accessibility/apps
- 確認: タッチターゲットは少なくとも48×48dpが推奨。読み上げや操作対象ラベルなども重要。
- Codex: 画面上で見えているアイコンサイズと押せる領域を分けて評価。TalkBackと拡大テキストで検証。

### C07. Compose描画性能
URL: https://developer.android.com/develop/ui/compose/performance
- 確認: Composeのcomposition/layout/draw、Release/R8、Baseline Profiles、LazyListの安定keyとcontentType、状態再計算の抑制。
- Codex: Kotlin版試作で必要な改善項目。実機・リリース相当で測る。

### C08. Composeベストプラクティス
URL: https://developer.android.com/develop/ui/compose/performance/bestpractices
- 確認: `remember`, `derivedStateOf`, 安定key、state readの延期など。
- Codex: 小さなComposableの安定性・再コンポーズをProfilerで確認。

### C09. Androidフレーム描画/jankの公式説明
URL: https://developer.android.com/topic/performance/issues/render
- 確認: 描画遅延とfrozen frames、Perfettoによる調査。約16ms基準の説明あり。
- Codex: 60Hz/120Hzの実際のフレーム予算を踏まえてスクロール・画面遷移を計測。

### C10. Android UI開発のComposeファースト方針
URL: https://developer.android.com/blog/posts/android-ui-development-is-compose-first
- 確認: Android UIの新しい設計/開発はComposeを中心に進める方針。
- Codex: Android専用試作は古いXML View前提で新規実装しない。

## D. Expo / React Native: 現行APIとAI開発環境

### D01. Expo SDK 58リリース（2026/10/15）
URL: https://expo.dev/sdk/58
- 確認: RN0.88、Expo UI新機能、Native Tabs、Agent CLI、エージェント連携など。
- Codex: 既存SDKと差分を確認。SDK更新が必要なら計画とリグレッションテストを提出。

### D02. Expo SDKのバージョン対応
URL: https://docs.expo.dev/versions/latest/
- 確認: 対応React Native/React/Nodeなどの組合せ。
- Codex: SDKと依存ライブラリの対応表を作り、単独で最新を入れて互換性を壊さない。

### D03. AI Agents and Expo
URL: https://docs.expo.dev/agents/
- 確認: Codex公式ExpoプラグインでSkills/MCPを設定。`codex plugin add expo@openai-curated`、`codex mcp login expo`。
- Codex: 公式SkillでExpo設計や画面実装の手順を補う。接続可能な場合は公式最新版ドキュメントを取得。

### D04. Expo Skillsの一覧
URL: https://docs.expo.dev/skills/
- 確認: `expo-design-system`, `expo-native-ui`, `expo-ui`, `expo-animation`, `expo-router`, `expo-upgrade` 等、用途ごとに専用スキルあり。
- Codex: UI設計/実装/動き/ルーティングで適切なスキルを選ぶ。スキルの説明がSDK文書と食い違う場合は該当版のAPIリファレンスと実機で照合。

### D05. Expo AI向け全文目次
URL: https://docs.expo.dev/llms.txt
- 確認: ExpoがAIエージェント向けドキュメントを提供。
- Codex: 直接Markdownとしてバージョン一致のページを取得。必要なら`.md`版URLを使う。

### D06. `@expo/ui`概要
URL: https://docs.expo.dev/versions/v58.0.0/sdk/ui/
- 確認: ReactからJetpack Compose/SwiftUIのネイティブ部品を利用でき、Universal/各OS固有の実装を選択できる。
- Codex: コンポーネントごとのOS差/対応APIを確認し、全画面置換ではなく有効な部分へ段階導入。

### D07. Expo UI Jetpack Compose部品
URL: https://docs.expo.dev/versions/v58.0.0/sdk/ui/jetpack-compose/
- 確認: `@expo/ui/jetpack-compose`、`Host`で包んで部品を描画。
- Codex: Android固有の自然なボタン、ピッカー、メニューなどを検討。

### D08. Expo UI Host詳細
URL: https://docs.expo.dev/versions/v58.0.0/sdk/ui/jetpack-compose/host/
- 確認: HostはRNとComposeの架け橋。`matchContents`などのレイアウト指定あり。
- Codex: 不用意にHostの入れ子やサイズの取り違えを起こさない。

### D09. Expo UI Universal List
URL: https://docs.expo.dev/versions/v58.0.0/sdk/ui/universal/list/
- 確認: 公式API文書ではAndroid側`LazyColumn`/iOS側SwiftUI `List`、多数行向け`List.ForEach`が記載。
- Codex: **注意**: `Expo Skills`の`expo-ui`概要にはこのListを大規模データに不向きとする説明もあり、読み物だけで性能を断定しない。対象版の実装と実機で`FlashList`/`FlatList`と比較する。

### D10. Expo Router Native Tabs
URL: https://docs.expo.dev/router/advanced/native-tabs/
- 確認: SDK58以降は`expo-router/native-tabs`。Androidは最大5タブ、スクロール/キーボード等に制約・注意事項。
- Codex: 標準タブとカスタムタブを比較。操作優先で選択する。既存タブとの二重描画を避ける。

### D11. Expo Router API
URL: https://docs.expo.dev/versions/latest/sdk/router/
- 確認: Stack、Native Tabs、Split View、ヘッドレスUI等の機能。
- Codex: モーダル、戻る、ディープリンク、タブ状態復元等を統一設計する。

### D12. SDK57→58移行
URL: https://docs.expo.dev/router/migrate/sdk-57-to-58/
- 確認: ナビゲーション、Protected routes、WebのSafeArea、Native Tabsなどの移行差分。
- Codex: 既存バージョンが57なら無差別更新で壊さない。

### D13. Expo Image
URL: https://docs.expo.dev/versions/latest/sdk/image/
- 確認: 画像キャッシュ、ThumbHash/BlurHash、遷移/プレースホルダーなど。
- Codex: アイコンや取引レシートの画像処理はサムネイル・キャッシュ・メモリに配慮。

### D14. Expo Haptics
URL: https://docs.expo.dev/versions/latest/sdk/haptics/
- 確認: OS依存の触覚フィードバック。設定・端末条件により無反応もあり得る。
- Codex: 重要操作に限定し、触覚がなくても理解可能なUIにする。

### D15. React Native FlatList性能チューニング
URL: https://reactnative.dev/docs/optimizing-flatlist-configuration
- 確認: windowSize、バッチレンダリング、軽い行部品、stable key、固定高さの場合`getItemLayout`等。
- Codex: 現行リストの測定後にチューニング。数字を一律に決めず、空白セル/メモリ/タッチ遅延を見て調整。

### D16. Shopify FlashList
URL: https://shopify.github.io/flash-list/docs/
- 確認: React Native向け高性能リスト、Expo対応。
- Codex: 大量の取引行を扱う時、既存`FlatList`とのA/Bを試す。

### D17. FlashList v2移行
URL: https://shopify.github.io/flash-list/docs/v2-migration/
- 確認: New Architectureが必要、v2では`estimatedItemSize`不要。古いv1の最適化記事をそのまま転用しない。
- Codex: 実際の依存関係とNew Architectureを確認して採否を決定。

### D18. React Native Reanimated 4系
URL: https://docs.swmansion.com/react-native-reanimated/docs/layout-animations/entering-exiting-animations/
- 確認: enter/exit/layoutアニメーション、NativeIDとの干渉など留意点。
- Codex: UIスレッドで動かせる箇所と、そもそも動かす必要がない箇所を分ける。reduced motion対応。

## E. Flutter比較用の公式資料

### E01. Flutter適応レイアウト
URL: https://docs.flutter.dev/ui/adaptive-responsive
- 確認: 画面サイズと入力手段に適応し、responsiveとadaptiveを区別。
- Codex: 同じホーム/取引画面をFlutterで試す場合の設計条件。

### E02. Flutter適応レイアウトのベストプラクティス
URL: https://docs.flutter.dev/ui/adaptive-responsive/best-practices
- 確認: 小さいWidgetへの分割、`const`、画面幅ベースの判断、端末種別を決め打ちしない。
- Codex: Flutter比較試作が公平になるよう、公式の基本最適化を行う。

### E03. Flutter性能ベストプラクティス
URL: https://docs.flutter.dev/perf/best-practices
- 確認: `saveLayer`/opacity/clip等のコスト、Lazy構築、`AnimatedBuilder`の再構築回避。
- Codex: アニメーション多用の印象ではなく、Profilerによる測定で判断。

### E04. Flutter UI overview
URL: https://docs.flutter.dev/ui
- 確認: WidgetとMaterial/Cupertino設計の最新の構成。ライブラリ分離等の変更にも注意。
- Codex: 比較試作で使うFlutterの安定版APIを公式現行版で確認。

## F. GPTモデルの開発作業への適性

### F01. OpenAI モデル選定ガイド
URL: https://developers.openai.com/api/docs/guides/model-selection
- 確認: GPT-6.2 Solは日常的な実装、Astraは難しい設計/エンジニアリング・研究に推奨される。
- Codex: 初期の複雑な設計はAstra、画面ごとの反復とテストはSolという分担に合理性がある。ただし実タスクで比較する。

### F02. ChatGPT Work/Codexモデル一覧
URL: https://learn.chatgpt.com/docs/models
- 確認: 2026年11月時点の6.2 Sol/Astraについて用途と標準コンテキストの案内あり。モデルやプランによる利用制限は変わり得る。
- Codex: ソース数が多い場合は閲覧記録/索引ファイルを用い、コンテキスト長だけに依存しない。

## 直接確認が必要な項目（Codexが調査を継続する）

- 現行のアプリが使用しているExpo SDK/React Native/Expo Router/Reanimated/FlashListの**実バージョン**。
- 現行の画面はどのコンポーネントライブラリ/テーマ方式で実装されているか。
- デザイン参考にする実在アプリの**対象バージョン・スクリーンショット・操作動画**。DMM各アプリの現在の外観を確認したと偽らない。
- 2025年発表のAIツールの**現時点の機能、料金、利用枠、生成物のライセンス**（URLでは現在の契約条件まで保証しない）。
- Figma UI Kitの再利用/公開時のライセンス、Figma MCPとCode Connectのプラン要件。
- Expo UIのネイティブ部品ごとの対応状況と既知の問題。特にListの大規模データ/仮想化に関する複数公式資料の整合性。
- Android低性能機、OLED端末、大文字設定、gesture navigation、3ボタンnavigation、ダークモード、権限制限、ネット未接続の実機挙動。
