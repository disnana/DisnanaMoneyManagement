# リモートAAB署名の実測

## 実験条件と結果

- 入力はマネーちゃんの実AAB。v6はActions実行 `45284819969`、artifact ID `14874240148`。ZIPのSHA-256は `e65d920a151dff76fb917b3468975dcf90a2a43894b47673885cbeee7489f7bd`、中のAABのSHA-256は `1e473b80dba171489e5b0db4de577fe126060e107fd0ef67c44e13bc41846ce5`。パッケージ、バージョン、埋め込みソースコミットをbundletoolで検証しました。Sigstoreの来歴はGitHub CLI 2.105.0で暗号学的に照合し、`refs/heads/main`、完全ソースSHA、`android-play-draft.yml`、GitHub-hosted runnerに限定しました。GitHub APIが返す `bundle` をJSONLにして `--bundle` で読み込ませました。
- JDK Temurin 21.0.13.1+2、bundletool 1.18.3、Bouncy Castle 1.85、workerd 2026-11-23、テスト用RSA 2048。鍵と証明書は実験ごとに生成するため、署名済みAABのバイナリハッシュや証明書指紋は再実行のたびに変わります。
- JDKの標準 `JarSigner` にProviderを渡すと、JARの `.SF` 本文に直接署名する代わりに155バイトのCMS signed attributesが渡りました。内容はcontentType、signingTime、CMS Algorithm Protection、messageDigestです。同一AABを別時刻に採取すると57バイト目から差があり、2回生成する元の設計は不成立でした。
- 採用した代替は、JDKが作った `MANIFEST.MF` と `.SF` を残し、Bouncy Castleの公開CMS APIで固定時刻を含むsigned attributesを生成する方法です。時刻は再現性のため固定した値で、タイムスタンプ局による証明ではありません。本運用では承認するmanifestの `issuedAt` に固定する前提です。ダイジェストと署名形式は標準ライブラリに委ね、Workerにはダイジェストだけを渡して再ハッシュする方式を使いません。
- v6の `MANIFEST.MF` は196,032バイト、`.SF` は196,194バイト。Workerへの本文は153バイト、返却されたRSA署名は256バイトでした。2回の準備処理は全バイト一致しました。アルゴリズムは `SHA256withRSA` に対応するWeb Cryptoの `RSASSA-PKCS1-v1_5` とSHA-256です。
- 署名後は `jarsigner -verify -strict`、OpenSSLのCMS検証、bundletool検証、JDK `JarFile` の全エントリの署名者検証、Pythonの全1,531エントリの内容検査を実行しました。署名メタデータのみを追加し、元の全エントリの内容は一致しました。
- 署名先はloopbackで起動した実workerdプロセスです。署名入力の1バイト変更、短縮、64 KiB超をそれぞれ403、403、413で拒否し、正しい入力には200を返しました。固定のテスト承認を与えたfixtureの結果です。通常のWorker経路が任意の署名入力を認可できないことは、独立VerifierとDOを接続してから改めて検証します。

| 計測対象 | 結果 |
| --- | --- |
| v6の準備処理2回 | 11.48秒、11.53秒 |
| v6のfinalizeとJava全エントリ検証 | 23.90秒 |
| warm workerd loopback HTTP 50件 | p50 1.200 ms、p95 1.507 ms、p99 1.595 ms |
| 最初の鍵importを含むworkerd loopback HTTP | 15.696 ms |

HTTPレイテンシはローカルでのプロセス間通信とクライアント処理を含みます。Cloudflare側CPU、DO、JWKS、Access、クラウドのcold start、メモリ増分やFree適合の実測値はありません。準備時の仮ZIPはCI側で作り、署名サービスには送りません。

## 再現方法

JDK 21、Python 3.12+、OpenSSL、curl、unzipを用意します。GitHub Actionsから取得したAABと、独立した証跡から得たSHA-256を指定します。PoCは既存の鍵を使いません。

```bash
export JAVA_HOME=/path/to/jdk-21
export BUNDLETOOL=/path/to/bundletool-all-1.18.3.jar
export WORKERD=/path/to/workerd
export CMS_DEPS=/path/to/downloaded-bc-jars
export EXPECTED_COMMIT=d2ec865a24ede75069d9695bf166edf9fa63aa18

release-authority/tests/run-poc.sh app-release.aab \
  1e473b80dba171489e5b0db4de577fe126060e107fd0ef67c44e13bc41846ce5 \
  com.disnana.mane_chan 1.0.0 6
```

- bundletool 1.18.3のバイナリはSHA-256 `a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29` を確認してください。[bundletool 1.18.3](https://github.com/google/bundletool/releases/tag/1.18.3)
- Bouncy Castleの `bcprov-jdk18on`、`bcpkix-jdk18on`、`bcutil-jdk18on` はすべて1.85で、Maven Centralから取得。実行スクリプトが [固定SHA-256](../tools/remote-jarsigner/dependencies.sha256) を確認します。[Bouncy Castle CMS API](https://downloads.bouncycastle.org/java/docs/bcpkix-jdk18on-javadoc/org/bouncycastle/cms/CMSSignedDataGenerator.html)
- workerd 2026-11-23はnpmの `@cloudflare/workerd-linux-64@1.20261123.1` を使用しました。loopbackポート45917だけを使用します。HTTP計測は、クライアント側で初回1件とその直後の逐次50件を計測し、nearest-rankで集計しました。[Cloudflare Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)
- 元のProvider方式の確認は `RemoteAabSigner capture AAB certificate.pem input.bin` を別時刻で2回実行し、`cmp` と `openssl asn1parse -inform DER` で比較できます。[JDK JarSigner.Builder](https://docs.oracle.com/en/java/javase/21/docs/api/jdk.jartool/jdk/security/jarsigner/JarSigner.Builder.html)

実験のAABはAPKとしてインストールしたり、Playに送ったりしていません。ZIP検査は複数パーサーの動作があらゆる入力で一致することを保証しないため、今後も固定JDKとbundletoolで受入試験を行います。

## SQLite Durable Object のローカル確認

`tests/ledger-workerd.capnp` はローカルの一時ディレクトリだけを永続化先に使います。ポート45918のfixtureに、実際のworkerd DOが二重承認・並行署名予約を拒否し、5件の監査連鎖を保持するテストがあります。これは個別のローカルコンポーネントテストです。ChromiumとWebKit 26.6のiPhone相当ビューポートでも、5秒の待機、途中キャンセル、キーボードでの3秒長押しによる1回の承認を確認しました。ブラウザーはテスト用の認証・台帳と接続しました。実際のサービスBindingとクラウド上の永続性は別途検証します。

```bash
scratch="$(mktemp -d)"
mkdir "$scratch/db"
cp release-authority/tests/ledger-workerd.{mjs,capnp} "$scratch/"
cp release-authority/packages/protocol/{ledger,manifest}.mjs "$scratch/"
(cd "$scratch" && "$WORKERD" serve ledger-workerd.capnp)
# 別の端末で実行し、stateがSIGNED、auditCountが5になることを確認
curl -fsS -X POST http://127.0.0.1:45918/test-ledger
```
