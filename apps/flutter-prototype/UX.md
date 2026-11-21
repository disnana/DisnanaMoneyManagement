# Flutter版の体験設計

家計簿を開く理由は「いくらあるか」「使いすぎていないか」「あとで直せるか」の三つ。ホームでは総資産、今月の収支、最近の取引をこの順に読めるようにする。初回起動では基本口座とカテゴリを用意し、サンプルは設定から読み込む。初回は画面の一部を使った4ページの短いガイドを表示し、記録用の＋を最初に示す。ガイドはスキップでき、設定の「使い方」から開き直せる。

- ホームは画面いっぱいの資産帯から始まり、余白と区切り線で情報をつなぐ。総資産を伏せても通貨記号と表示位置を保つ。
- ホーム・取引・分析・口座を下に固定する。中央の＋から記録を開き、支出・収入・振替を選ぶ。ポイントやメモは詳細から開く。
- 取引は日付順。期間・種類・検索語で絞り込み、行を開いて編集する。削除は画面中央で確認する。タブ移動時は今月に戻す。
- 分析は月の変化を棒グラフにし、費目は金額順に並べる。色と併せて値・符号・名称を表示する。
- 口座は種類ごとに並べる。貯金はホームまたは口座から開き、目標ごとに進捗と設定を切り替える。
- 設定は表示、カテゴリ、予算、データ管理をまとめる。バックアップ復元は対象件数を確認して実行する。

参考資料

- [Android のナビゲーションパターン](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns)
- [NN/g の視覚的階層](https://www.nngroup.com/articles/visual-hierarchy-ux-definition/)
- [NN/g の段階的開示](https://www.nngroup.com/articles/progressive-disclosure/)
- [英国 ONS の棒グラフ](https://service-manual.ons.gov.uk/data-visualisation/chart-types/bar-charts)
