# ScyllaDB設計案

既存3ノードの `datacenter1`、NetworkTopologyStrategy、RF=3を前提とする。アプリ専用keyspaceとアプリ専用ロールを作る。以下は運用設計案。試験用の残高・付与・消費は[ステージングの設定手順](#ステージングのクレジット台帳)を参照する。既存の同期用DBの移行はこの設計に含めない。

| パーティションキー | 読み書きの目的 | 整合性と失敗からの復旧 |
| --- | --- | --- |
| Google `sub` | 同じGoogleアカウントを内部ユーザーIDへ解決 | IF NOT EXISTSのLWT。タイムアウト後はマッピングを読み直す。取得したIDでユーザーレコードを冪等作成。メールはキーに用いない。 |
| ユーザーID | ユーザーと端末公開鍵・状態 | 端末IDをクラスタリングキーにする。署名と別に、利用停止した端末のAPIを拒否する。 |
| セッションID | Accessが示す端末・主体を取得し、有効なRefreshハッシュを条件付きで更新 | 同じ旧ハッシュを2ノードから更新しても1回だけ成功。期限・失効・端末状態を参照する。Refresh応答が失われたケースは再ログインを許す。後続でユーザー別の失効経路を設計する。 |
| ユーザーID | 残高、予約、ジョブ作成、課金の確定 | 条件付きの更新対象を同じパーティションの状態と操作記録に置く。予約・失敗時の返却・精算を現在の状態と操作IDで条件付ける。タイムアウト後は結果を読み直す。 |
| ジョブID | 状態照会、結果の取得、回復 | 所有者・状態・試行・上限・使用量・期限を保存。ユーザー単位の実行中フラグを先に確保し、確保後にノードが停止した場合も後続ノードが当該IDで再開する。 |
| ハッシュ化した購入トークン、または広告のtransaction ID | 同一購入・同一報酬が別ユーザーまたは再送で処理済みか照会 | LWTで最初の所有者を確定し、ユーザー側には同じ操作IDで一度だけ記録。異なるパーティションの更新は段階を記録して再開し、両者を一括で成功したとはみなさない。 |

通常の読み書きは `LOCAL_QUORUM`、LWTはserial consistency `LOCAL_SERIAL` と成否の読み直しを候補とする。安全な金額計算に必要な一貫性と複数Goノードから同一パーティションに集中した場合のp95・p99を隔離環境で測る。[ScyllaDB LWT](https://docs.scylladb.com/manual/stable/features/lwt.html)

1ユーザー1ジョブはユーザーのパーティションでLWTを行う。外部AIへの送信中にノードが消えた場合、DBに結果がないことだけで未実行とは判断できない。同一ジョブIDの照会・冪等キーがプロバイダーに存在するか調べる。確認不能な試行は調査・精算待ちとし、新しい実行を自動で重ねない。履歴の保持は結果本文と会計操作の記録で分ける。

無期限分のユーザー上限はユーザーパーティションで検査可能。全ユーザー上限は別パーティションにまたがるため、上限枠の予約・確定・回復の手順を先に設計する。上限の判定に整合性のない総和を使う案は採用しない。ピーク時の全体枠競合と、クレジット予約後の停止・TTL境界を負荷試験に含める。

## ステージングのクレジット台帳

隔離した試験用keyspaceに [schema.cql](../apps/server/internal/credits/schema.cql) を適用する。既存の認証設定に次の項目を加え、`MANE_STAGING_CREDITS_FILE` は削除する。試験残高を引き継ぐ場合は、必要な対象を付与コマンドで登録する。両方のGoノードで同じkeyspaceを使う。

| 環境変数 | 内容 |
| --- | --- |
| `MANE_SCYLLA_HOSTS` | CQL接続先。ホストをカンマ区切りで指定する |
| `MANE_SCYLLA_KEYSPACE` | 試験用keyspace |
| `MANE_SCYLLA_DATACENTER` | 接続先のローカルDC。例は `datacenter1` |
| `MANE_SCYLLA_USER`、`MANE_SCYLLA_PASSWORD` | CQL認証を有効にしている場合の専用ロール |
| `MANE_SCYLLA_CA_FILE` | CQLでTLSを使う場合のCAファイル。証明書と接続先ホスト名を照合する |

インストーラーでGoを更新すると、Androidの既存の残高画面はScyllaDB上の利用可能額を表示する。未付与は0。期限付きの付与は期限到達時に利用可能額から外し、消費は期限が近い分から充当する。残高の更新と操作記録を同じパーティションの条件付きバッチで書き、同一IDの再送で重複して付与・消費しない。書き込みの成否が不明な時は同じIDで再試行する。

運用者はScyllaDB接続設定を読み込んだプロセスから、Goバイナリの `credits` サブコマンドを使う。同じ設定ファイルを使う一時サービスを起動する例を示す。以下の `TEST_SUB` はテストアカウントのGoogle IDトークンで検証済みの `sub` に置き換える。

```bash
mane_credits() {
  systemd-run --user --wait --pipe --quiet \
    --property="EnvironmentFile=$HOME/.config/mane/android-auth.env" \
    "$HOME/.local/share/mane-android-auth/mane-android-auth" credits "$@"
}
mane_credits grant --subject TEST_SUB --id test-grant-001 --amount 20
mane_credits spend --subject TEST_SUB --id test-spend-001 --amount 4
mane_credits balance --subject TEST_SUB
```

期限付きの試験付与では `grant` に `--expires` と将来のRFC3339日時を指定する。課金処理を通さない管理コマンドなので、Playの購入試験は[専用の手順](credits-billing-ads.md#google-play-billingの試験準備)を使う。実DBで条件付きバッチと二重実行を確認するには、隔離keyspaceを用い、`apps/server` で `MANE_TEST_SCYLLA=1 go test ./internal/credits -run '^TestScyllaWallet$' -count=1` を実行する。
