export function LegalLinks() {
  const base = import.meta.env.BASE_URL;
  return (
    <nav aria-label="利用規約とプライバシー" className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-slate-600">
      <a className="py-2 underline underline-offset-4" href={`${base}terms/`} target="_blank" rel="noopener noreferrer">利用規約</a>
      <a className="py-2 underline underline-offset-4" href={`${base}privacy/`} target="_blank" rel="noopener noreferrer">プライバシーポリシー</a>
    </nav>
  );
}
