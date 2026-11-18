# 開発環境

## Bun のバージョン（重要）
このリポジトリは **Bun 1.4.4 以上** が必要です（`.bun-version` / `packageManager` で固定）。
`bun.lock` の形式（`lockfileVersion: 2`）が古い Bun では読めず、次のエラーになります。

```
error: Unknown lockfile version
UnknownLockfileVersion: failed to parse lockfile: 'bun.lock'
```

**直し方（Windows / macOS / Linux 共通）**
```bash
bun upgrade          # 1.4.x 以降にする
bun --version        # 1.4.4 以上であること
bun install
```
`bun upgrade` が使えない古い版の場合は、Windows(PowerShell) で
`powershell -c "irm bun.sh/install.ps1 | iex"` を実行して入れ直してください。

## よく使うコマンド
```bash
bun install                 # Web
bun run dev                 # Web 開発サーバー
bun run test                # ユニットテスト
bunx playwright test        # E2E
cd apps/mobile && bun install && bunx expo start   # モバイル（iOS は Expo Go で QR）
cd apps/server && go test ./...                    # サーバー（Go 1.26）
```
