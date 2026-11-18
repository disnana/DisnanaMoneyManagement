import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2.5 text-xs font-medium text-white transition-colors hover:bg-slate-800 whitespace-nowrap"
      >
        <Download className="h-3.5 w-3.5 shrink-0" />
        <span>アプリをインストール (PWA)</span>
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowGuide(true)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
      >
        <Smartphone className="h-3.5 w-3.5 shrink-0 text-slate-500" />
        <span>{isIOS ? 'ホーム画面に追加 (iOS)' : 'PC・スマホにインストール'}</span>
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-guide-title"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <h3 id="pwa-guide-title" className="text-base font-semibold text-slate-900">
                アプリとしてインストール (PWA)
              </h3>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="閉じる"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-600">
              {isIOS ? (
                <>
                  <p>iPhone / iPadのSafariでは以下の手順でホーム画面に追加できます。</p>
                  <ol className="list-decimal space-y-1.5 pl-5 text-xs text-slate-700">
                    <li>画面下部（または上部）の「共有」ボタンをタップします。</li>
                    <li>メニューを下へスクロールし、「ホーム画面に追加」を選択します。</li>
                    <li>右上の「追加」をタップすると、アプリアイコンから起動できます。</li>
                  </ol>
                </>
              ) : (
                <>
                  <p>
                    PC（Chrome / Edge）やAndroid端末にPWAとしてインストールすると、オフラインでも素早く家計簿を開けます。
                  </p>
                  <ul className="list-disc space-y-1.5 pl-5 text-xs text-slate-700">
                    <li>
                      <strong>PC (Chrome / Edge):</strong> アドレスバー右端の「インストール」アイコンをクリックしてください。
                    </li>
                    <li>
                      <strong>Android (Chrome):</strong> ブラウザ右上メニューから「アプリをインストール」または「ホーム画面に追加」を選択してください。
                    </li>
                  </ul>
                </>
              )}
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-medium text-white hover:bg-teal-800"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
