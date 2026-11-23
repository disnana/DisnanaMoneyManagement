import { ChevronRight, House, Store } from 'lucide-react';

const destinations = [
  { href: '/shop/', label: 'クレジットショップ', Icon: Store },
  { href: '/', label: '公式トップへ戻る', Icon: House },
];

export function OfficialSiteLinks() {
  if (import.meta.env.VITE_OFFICIAL_PORTAL !== '1') return null;

  return (
    <nav aria-label="公式サイト" className="space-y-1 border-t border-slate-200 pt-2 lg:mx-3.5 lg:mb-3.5">
      {destinations.map(({ href, label, Icon }) => (
        <a
          key={href}
          href={href}
          className="flex min-h-12 items-center gap-3 rounded-xl px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-700"
        >
          <Icon aria-hidden="true" className="h-5 w-5 shrink-0 text-teal-700 lg:h-4 lg:w-4" />
          <span className="flex-1">{label}</span>
          <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
        </a>
      ))}
    </nav>
  );
}
