# iPhone にネイティブアプリとして入れる（自分用・無料）

Web アプリを Capacitor（WKWebView）の殻に入れた iOS アプリです。画面・機能は Web 版と同じで、
触覚（Taptic Engine）が確実に動き、PWA の更新遅延がありません。

## 1. IPA を作る（GitHub Actions・macOS）
1. GitHub の **Actions → "Build iOS IPA (unsigned, for sideloading)" → Run workflow**
2. 終わったら Artifacts の **`DMM-unsigned-ipa`** をダウンロード（zip を展開すると `DMM-unsigned.ipa`）

## 2. PC で署名して iPhone に入れる（無料 Apple ID）
どちらか一方でOKです。

**Sideloadly（簡単）** — https://sideloadly.io
1. PC に Sideloadly をインストール（Windows は iTunes / iCloud の「公式版」も必要）
2. iPhone を USB 接続 → `DMM-unsigned.ipa` をドラッグ → Apple ID を入力 → Start
3. iPhone の 設定 → 一般 → VPNとデバイス管理 → 自分の Apple ID → 「信頼」
4. iPhone の 設定 → プライバシーとセキュリティ → **デベロッパモード** を ON（再起動）

**AltStore / SideStore** — 7日ごとの更新を自動化したい場合

## 注意
- 無料 Apple ID の署名は **7日で失効**します。期限が切れたら同じ手順で再署名（データは保持されます）。
- 有料の Apple Developer Program（年額）なら 1 年有効＋TestFlight が使えます。
- 更新したいとき: 新しい IPA をビルド → 同じ手順で上書きインストール（データは残ります）。
- 手元に Mac がある場合: `bun run cap:sync` → `bunx cap open ios` で Xcode から実機へ。
