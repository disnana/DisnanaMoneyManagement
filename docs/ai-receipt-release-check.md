# AIレシートの公開前チェック

通常解析から順に、同じコミットのGo・Worker・Androidを試験します。各手順の結果と対象コミットを記録してから次へ進みます。試験には専用アカウント・キースペース・架空の画像を使います。設定値と既存の振り分け構成は[実装計画](./ai-receipt-plan.md#通常解析のステージング試験)を参照してください。

## 1. 外部サービスを使わずに確認する

```bash
(cd apps/server && MANE_TEST_SCYLLA=0 go test -race ./internal/{androidauth,credits,receiptai} ./cmd/mane-android-auth)
bun install --frozen-lockfile
bunx --no-install vitest run apps/mobile/src/lib/{androidReceiptClient,receiptImport,receiptLocalResults}.test.mjs
```

画像の拒否、再送、認証、部分精算、期限、結果を編集して登録する経路を確認します。外部APIとの通信はモックを使います。

## 2. 隔離Scyllaで実DBのテストを通す

Scyllaと`cqlsh`がある試験機で実行します。次の例は認証なしのローカル検証専用Scyllaを `127.0.0.1:9042` で起動済みの場合です。`system.local` が `datacenter1` を返すことを確認します。

```bash
cqlsh 127.0.0.1 -e 'SELECT data_center FROM system.local;'
cqlsh 127.0.0.1 -e "CREATE KEYSPACE IF NOT EXISTS mane_receipt_ci WITH replication = {'class': 'NetworkTopologyStrategy', 'datacenter1': 1} AND tablets = {'enabled': false};"
cqlsh 127.0.0.1 -k mane_receipt_ci -f apps/server/internal/credits/schema.cql
cqlsh 127.0.0.1 -k mane_receipt_ci -f apps/server/internal/receiptai/schema.cql
(cd apps/server && env -u MANE_SCYLLA_USER -u MANE_SCYLLA_PASSWORD -u MANE_SCYLLA_CA_FILE \
  MANE_TEST_SCYLLA=1 MANE_SCYLLA_HOSTS=127.0.0.1 MANE_SCYLLA_KEYSPACE=mane_receipt_ci \
  MANE_SCYLLA_DATACENTER=datacenter1 go test -race -count=1 -v \
  ./internal/credits ./internal/receiptai -run '^TestScylla')
```

`TestScyllaWallet` と `TestScyllaReceipt…` が `PASS` で、`SKIP` していないことを確認します。単独ノードの試験後、ステージングでは同じDCの複数レプリカに接続してノード切替を試します。この作業環境にはScyllaと`cqlsh`がなく、Dockerソケットへのアクセスも許可されなかったため、実DBテストは未実施です。

## 3. ステージングで接続とデータを確認する

1. 検証用キースペースにウォレット・[共有セッション](../apps/server/internal/androidauth/session_schema.cql)・レシートのCQLを適用します。両Goノードで `MANE_ANDROID_SHARED_SESSIONS=1` と `MANE_RECEIPT_ENABLED=1` を設定し、同じモデル・料金版・試験用の結果保存期間・OpenAIプロジェクトを使います。専用の環境で `mane-android-auth --check-config` を両ノードで通します。
2. `EXPO_PUBLIC_ANDROID_RECEIPT_ENABLED=true` のAndroid試験ビルドでログインし、試験用CRを付与します。送信前の最大CR、確定後の残高と判定、結果取得期限を照合します。登録確認前の家計簿に変化がなく、レシート単位／品目単位の選択・編集・除外が反映されることを実機で次の表とともに記録します。

| 項目 | 試験で確認する条件 |
| --- | --- |
| Androidの操作 | 撮影・写真選択・切り取りを試します。送信確認画面から戻っても書類、ページ順、モードが残り、その時点ではPOSTもCRの仮確保も発生しません。撮影権限を拒否した場合は写真・ファイルを選べます。保存履歴から書類を一件ずつ開いて編集し、Backで解析結果、次いで履歴に戻れることを確認します。 |
| ノード切替 | 受付直後に試験用の担当Goノードを停止して別ノードに切り替えます。同じIDと本文は同一ジョブになり、精算は1回です。送信結果が不明な場合は二重送信せず、期限内の回復か未処理分の解放を確認します。異なる本文で同じIDは `409`、別アカウントで結果を取得できません。受付・再割当・精算までの時間を記録します。 |
| CRと原価 | 試験用の整数料金で、正常・対象外・ぼけ／反射・原因不明・障害を含めます。該当画像数から計算したCRと履歴・残高が一致し、確定額は送信前の上限以内です。モデル・モード別にトークンの内訳、原価と待ち時間のp50・p95を測定します。失敗や再試行の実費も含め、事前に合意した原価・待ち時間の範囲と照合します。 |
| 元画像と一時コピー | 成功・部分失敗・期限切れの精算後に `receipt_ai_pending` の対象画像が取得できず、外部ファイルの削除が終わった後に復旧用の行も0件になることを確認します。画像や結果をログに出力せず、端末の通常の送信・取消後には送信用の一時コピーが残らず、元写真が残ることを確認します。強制終了後のキャッシュとSSTable・バックアップの物理消去も別に確認します。 |
| 結果期限 | 短い試験値を設定し、`result_expires_at` の前は結果を取得でき、期限時刻以降は結果を返さず `result_expired=true` になることを確認します。後続の削除処理でScylla側の結果が消え、精算情報は残ります。取得済みのAndroid端末ではネットワークを切って再起動し、結果を確認・編集できます。 |

## 4. 遅延モードを一つずつ検証する

通常解析を通過した後、おまかせ、一括の順に試験設定を追加します。合意した処理枠と料金で、外部受付後のノード停止、部分成功、期限切れの解放、確定額と実費を照合します。一括では処理済みジョブのOpenAI入出力ファイルの削除まで確認します。モードごとに試験結果を記録してから公開を判断します。

## 5. 公開判断と受付停止

- 公開前に実機・実DB・提供元との検証結果を確認し、価格、結果保持期間、OpenAIのデータ取扱い、送信前の説明と[利用規約](../public/terms/index.html)・[プライバシーポリシー](../public/privacy/index.html)を揃えます。有償販売は[販売条件](./shop-commerce-disclosure.md)の確認後に判断します。現行のGoエントリーポイントは `MANE_AUTH_STAGING=1` を前提とするため、公開先の構成と運用の切り分けも確認します。
- 停止時は、両Goノードで `MANE_RECEIPT_INTAKE_PAUSED=1` にして新規の解析受付を閉じ、`MANE_RECEIPT_ENABLED=1` を維持します。新規POSTが `503 receipt_intake_paused`、既存のGETと精算が機能することを確認します。設定がない旧版では、各ノードの入口すべてで解析作成のPOSTのみを一時遮断し、GETとワーカーを維持します。
- 未精算ジョブ、処理待ち画像、外部ファイルの削除待ちが0件に達するまで、旧価格版、モデル、外部認証、Scyllaの行を保持します。結果の取得期間中は互換性のある読み取りと期限切れ処理も維持します。後から結果が届いた場合も再課金・無条件再送を行いません。全件削除で状態を揃える手順は使いません。
