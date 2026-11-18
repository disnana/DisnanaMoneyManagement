# dmm-server

任意のパスキー・アカウントと、**エンドツーエンド暗号化**された同期ログを提供する Go 製サーバー。
アカウントを作らなければ使われません（アプリは端末内だけで完結＝オフライン標準）。

- 静的バイナリ（約 24 MB）、Docker で数十 ms で起動
- ステートレス: 状態はすべて DB。**ノードは何台でも**、サブドメインで分けて並べられる
- DB は URL で選択: `sqlite:/data/dmm.db`（開発・単一ノード）／ `postgres://…`（PostgreSQL 17/18）／ `scylla://…`（予定）
- サーバーは暗号文しか持たない（鍵は端末側）。アカウント削除で全データを消去

## 起動
```bash
docker compose up -d                       # 単一ノード + SQLite
curl localhost:8080/healthz
POSTGRES_PASSWORD=… DMM_SECRET=$(openssl rand -hex 32) \
DMM_RP_ID=sync.example.com DMM_RP_ORIGINS=https://sync.example.com \
  docker compose -f compose.cluster.yml up -d   # 2 ノード + PostgreSQL 18
```

## 設定（環境変数）
| 変数 | 既定 | 説明 |
|---|---|---|
| `DMM_DB_URL` | `sqlite:./dmm.db` | `sqlite:` / `postgres://` / `scylla://` |
| `DMM_SECRET` | – | **全ノード共通**・32 文字以上。パスキー手続きの封印鍵。共有 DB では必須 |
| `DMM_RP_ID` | `localhost` | WebAuthn の RP ID。複数サブドメインなら**親ドメイン**（`sync.example.com`） |
| `DMM_RP_ORIGINS` | `http://localhost:3000` | 許可する Web オリジン（カンマ区切り、https） |
| `DMM_RP_ANDROID_ORIGINS` | – | Android アプリ用 `android:apk-key-hash:…` |
| `DMM_NODES` | – | 全ノードの公開 URL。`/v1/discovery` で配布し、端末がフェイルオーバーに使う |
| `DMM_ALLOW_REGISTRATION` | `true` | `false` で新規アカウント作成を停止 |
| `DMM_TRUST_PROXY` | `false` | リバースプロキシ配下なら `true`（`X-Forwarded-For` でレート制限） |
| `DMM_MAX_USER_BYTES` | 256 MiB | 1 アカウントの保存上限 |
| `DMM_SESSION_TTL` | `720h` | セッション有効期間 |

## API（要点）
```
POST /v1/auth/register/begin|finish   パスキーでアカウント作成（任意）
POST /v1/auth/login/begin|finish      パスキーでログイン（ユーザー名不要）
POST /v1/auth/logout   DELETE /v1/account   GET /v1/me
POST /v1/sync/push      {ops:[{id,device,payload}]}   冪等（同じ id は 1 回だけ保存）
GET  /v1/sync/pull?cursor=&limit=                    cursor より後の ops（順序保証）
PUT  /v1/snapshot?prune=1   GET /v1/snapshot         暗号化スナップショット（古い ops を削除可）
GET  /v1/discovery   GET /healthz   GET /readyz
```

## 複数ノードの設計
- ログの順序は **(サーバー時刻 µs, op id)** のカーソル。ノード間の連番調整が不要で、リーダーレスな DB（ScyllaDB）にも載る。
- ノードの時計は少しずれうるので、**端末は同期開始時にカーソルを数秒巻き戻し、op id で重複排除**する（apply は冪等）。
- パスキーの途中状態は暗号化トークンで端末が運ぶ → どのノードで begin/finish しても良い。
- PostgreSQL は単一インスタンスでもマネージドでも可（運用側の選択）。アカウント単位のアドバイザリーロックで容量上限を正確に判定。

## テスト
```bash
go test -race ./...                                   # SQLite
DMM_TEST_PG_URL=postgres://user:pw@localhost/db?sslmode=disable go test -race ./...   # + PostgreSQL
```
