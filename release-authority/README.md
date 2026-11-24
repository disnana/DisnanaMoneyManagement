# Disnana Release Authority

Android AABのリモート署名PoCと、ローカルで検証できる認可・承認・監査コンポーネント。実際のアップロード鍵とPlay認証を使用するには、独立した信頼境界とステージングでの検証が先に必要です。

- [構成・実装と未接続の部分](docs/ARCHITECTURE.md)
- [脅威モデル](docs/THREAT_MODEL.md)
- [PoCの再現方法と計測](docs/POC.md)
- [設定、鍵更新、停止と障害時の対応](docs/RUNBOOK.md)
- [セキュリティ判断と運用開始条件](SECURITY.md)

## ローカルチェック

Node.js 24、Bun 1.4.4、Python 3.12以上を使用します。

```bash
cd release-authority
bun install --frozen-lockfile
bun audit
node --test --test-isolation=none tests/*.test.mjs
python3 -B -m unittest discover -s tests -p 'test_*.py'
```

ルートのPlaywright依存がある環境では `node tests/approval-browser.cjs` を実行できます。導入済みWebKitで試す場合は `APPROVAL_BROWSER=webkit` を指定します。CIの確認ワークフローはテストと依存監査を行います。クラウドへのデプロイとPlayへのアップロードは独立した手順です。

2 WorkerとSQLite台帳のローカル結合テストは、`WORKERD=/path/to/workerd tests/run-two-worker-smoke.sh` で実行します。使う認証情報はテスト時に生成します。
