import React, { useState } from 'react';
import { Download, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { ResponsiveSheet } from './ResponsiveSheet';

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
        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 px-3.5 py-2.5 text-xs font-semibold text-white transition-all hover:bg-slate-800 active:scale-[0.98]"
      >
        <Download className="h-4 w-4 shrink-0" />
        <span>アプリをインストール</span>
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowGuide(true)}
        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-700 transition-all hover:bg-slate-50 active:scale-[0.98]"
      >
        <Smartphone className="h-4 w-4 shrink-0 text-slate-500" />
        <span>{isIOS ? 'ホーム画面に追加' : 'アプリを端末に追加'}</span>
      </button>

      <ResponsiveSheet
        open={showGuide}
        onClose={() => setShowGuide(false)}
        title="アプリとしてインストール (PWA)"
        titleId="pwa-guide-title"
        maxWidthClass="sm:max-w-md"
        footer={
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="min-h-[44px] w-full rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 active:scale-[0.98] sm:w-auto"
            >
              閉じる
            </button>
          </div>
        }
      >
        <div className="space-y-3 text-sm leading-relaxed text-slate-600">
          {isIOS ? (
            <>
              <p>iPhone / iPadのSafariでは以下の手順でホーム画面に追加できます。</p>
              <ol className="list-decimal space-y-2 pl-5 text-xs leading-relaxed text-slate-700">
                <li>画面下部（または上部）の「共有」ボタンをタップします。</li>
                <li>メニューを下へスクロールし、「ホーム画面に追加」を選択します。</li>
                <li>右上の「追加」をタップすると、アプリアイコンから起動できます。</li>
              </ol>
            </>
          ) : (
            <>
              <p>
                PC（Chrome / Edge）やAndroid端末にPWAとしてインストールすると、オフラインでも素早く開けます。
              </p>
              <ul className="list-disc space-y-2 pl-5 text-xs leading-relaxed text-slate-700">
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
      </ResponsiveSheet>
    </>
  );
};
