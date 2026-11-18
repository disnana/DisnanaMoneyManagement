import React from 'react';
import { ChevronRight, Database, FileText } from 'lucide-react';
import { NavSection } from '../../types/finance';
import { formatJPY } from '../../utils/format';
import { ResponsiveSheet } from '../ResponsiveSheet';
import { PWAInstallButton } from '../PWAInstallButton';

interface Props {
  open: boolean;
  onClose: () => void;
  totalAssets: number;
  accountCount: number;
  onSelectSection: (s: NavSection) => void;
  onOpenDataModal: () => void;
}

const Row: React.FC<{
  icon: React.ReactNode;
  title: string;
  sub?: string;
  onClick: () => void;
}> = ({ icon, title, sub, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left active:bg-slate-50"
  >
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
      {icon}
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-[15px] font-semibold text-slate-900">{title}</span>
      {sub && <span className="mt-0.5 block text-xs text-slate-500">{sub}</span>}
    </span>
    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
  </button>
);

export const MobileMenuSheet: React.FC<Props> = ({
  open,
  onClose,
  totalAssets,
  accountCount,
  onSelectSection,
  onOpenDataModal,
}) => (
  <ResponsiveSheet open={open} instantClose onClose={onClose} title="メニュー" titleId="mobile-menu-title">
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3.5">
        <div className="text-xs text-slate-500">
          総資産残高
          <div className="text-[11px]">{accountCount}口座</div>
        </div>
        <div className="font-mono text-lg font-bold text-slate-900 tabular-nums">
          {formatJPY(totalAssets)}
        </div>
      </div>

      <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl ring-1 ring-slate-200/70">
        <Row
          icon={<FileText className="h-5 w-5" />}
          title="経費・税務処理"
          sub="外貨・Stripe・手数料・確定申告用CSV"
          onClick={() => {
            onClose();
            onSelectSection('tax');
          }}
        />
        <Row
          icon={<Database className="h-5 w-5" />}
          title="データ管理・バックアップ"
          sub="書き出し・復元・初期化"
          onClick={() => {
            onClose();
            onOpenDataModal();
          }}
        />
      </div>

      <PWAInstallButton />
    </div>
  </ResponsiveSheet>
);
