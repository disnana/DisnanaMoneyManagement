part of 'main.dart';

class HomeContent extends StatelessWidget {
  const HomeContent({
    super.key,
    required this.ledger,
    required this.month,
    this.group,
    required this.period,
    required this.toggleBalance,
    required this.onTransactions,
    required this.onGoals,
    required this.onAccounts,
    required this.onEdit,
    required this.onSettings,
  });
  final Ledger ledger;
  final DateTime month;
  final String? group;
  final Widget period;
  final VoidCallback? toggleBalance;
  final VoidCallback onTransactions, onGoals, onAccounts, onSettings;
  final ValueChanged<Entry> onEdit;

  @override
  Widget build(BuildContext context) {
    final entries = ledger.monthEntries(month, group: group)
      ..sort((a, b) => b.date.compareTo(a.date));
    final earned = sumKind(entries, EntryKind.income);
    final spent = sumKind(entries, EntryKind.expense);
    final balance = ledger.balance;
    final heroColor = context.dark
        ? const Color(0xff253f3d)
        : const Color(0xff16413b);
    const onHero = Color(0xfff1f5e8);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ColoredBox(
          color: heroColor,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(24, 18, 18, 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Expanded(
                      child: Text(
                        '総資産',
                        style: TextStyle(
                          color: onHero,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    IconButton(
                      color: onHero,
                      tooltip: ledger.hideBalance ? '総資産を表示' : '総資産を非表示',
                      onPressed: toggleBalance,
                      icon: Icon(
                        ledger.hideBalance
                            ? Icons.visibility_off_outlined
                            : Icons.visibility_outlined,
                      ),
                    ),
                  ],
                ),
                Text(
                  ledger.hideBalance ? '¥・・・・・・' : yen(balance),
                  semanticsLabel: ledger.hideBalance ? '総資産は非表示' : null,
                  style: context.type.displaySmall?.copyWith(
                    color: onHero,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -1.4,
                    fontFeatures: _figures,
                  ),
                ),
                const SizedBox(height: 6),
                TextButton(
                  style: TextButton.styleFrom(
                    foregroundColor: onHero,
                    padding: EdgeInsets.zero,
                  ),
                  onPressed: onAccounts,
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('資産の内訳'),
                      SizedBox(width: 4),
                      Icon(Icons.arrow_forward_rounded, size: 16),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        PageInset(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              period,
              Row(
                children: [
                  Expanded(
                    child: _CashFigure(
                      label: '収入',
                      amount: earned,
                      icon: Icons.north_east,
                      color: context.income,
                    ),
                  ),
                  Expanded(
                    child: _CashFigure(
                      label: '支出',
                      amount: spent,
                      icon: Icons.south_east,
                      color: context.expense,
                    ),
                  ),
                  Expanded(
                    child: _CashFigure(
                      label: '収支',
                      amount: earned - spent,
                      icon: null,
                      color: context.colors.onSurface,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              const Divider(),
              const SizedBox(height: 14),
              if (ledger.budget > 0) ...[
                SectionHeading('今月の予算', action: '予算設定', onTap: onSettings),
                Wrap(
                  spacing: 10,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(spent <= ledger.budget ? 'あと' : '超過'),
                    Money(
                      (ledger.budget - spent).abs(),
                      size: 22,
                      color: spent > ledger.budget ? context.expense : null,
                    ),
                  ],
                ),
                const SizedBox(height: 11),
                LinearProgressIndicator(
                  value: (spent / ledger.budget).clamp(0, 1),
                  minHeight: 9,
                  borderRadius: BorderRadius.circular(8),
                ),
                const SizedBox(height: 8),
                Text(
                  '${yen(spent)} / ${yen(ledger.budget)}',
                  style: context.type.bodySmall,
                ),
                const SizedBox(height: 18),
                const Divider(),
              ],
              SectionHeading('最近の取引', action: 'すべて見る', onTap: onTransactions),
              if (entries.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 14),
                  child: Text('取引を記録すると、ここに表示されます。'),
                )
              else
                for (final entry in entries.take(4))
                  EntryRow(
                    entry: entry,
                    ledger: ledger,
                    onTap: () => onEdit(entry),
                    showDay: true,
                  ),
              const SizedBox(height: 16),
              SectionHeading('貯金目標', action: '目標を見る', onTap: onGoals),
              if (ledger.goals.isNotEmpty)
                GoalProgress(goal: ledger.goals.first, onTap: onGoals),
            ],
          ),
        ),
      ],
    );
  }
}

class _CashFigure extends StatelessWidget {
  const _CashFigure({
    required this.label,
    required this.amount,
    required this.icon,
    required this.color,
  });
  final String label;
  final int amount;
  final IconData? icon;
  final Color color;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(right: 7),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            if (icon != null) ...[
              Icon(icon, size: 14, color: color),
              const SizedBox(width: 4),
            ],
            Text(label, style: context.type.labelMedium),
          ],
        ),
        const SizedBox(height: 6),
        Text(
          yen(amount),
          style: context.type.titleMedium?.copyWith(
            color: color,
            fontWeight: FontWeight.w800,
            fontFeatures: _figures,
          ),
        ),
      ],
    ),
  );
}

IconData accountIcon(AccountKind kind) => switch (kind) {
  AccountKind.bank => Icons.account_balance_outlined,
  AccountKind.cash => Icons.payments_outlined,
  AccountKind.electronic => Icons.smartphone_rounded,
  AccountKind.card || AccountKind.debit => Icons.credit_card_outlined,
  AccountKind.foreignBank => Icons.currency_exchange_rounded,
  AccountKind.psp => Icons.language_rounded,
  AccountKind.investment => Icons.show_chart_rounded,
};

IconData categoryIcon(String category) => switch (category) {
  '食費' => Icons.restaurant_rounded,
  '交通費' => Icons.train_outlined,
  '日用品' => Icons.shopping_bag_outlined,
  '住居費' => Icons.home_outlined,
  '水道・光熱費' => Icons.bolt_rounded,
  '通信費' => Icons.wifi_rounded,
  '給与' || '副収入' => Icons.savings_outlined,
  _ => Icons.receipt_long_outlined,
};

class EntryRow extends StatelessWidget {
  const EntryRow({
    super.key,
    required this.entry,
    required this.ledger,
    required this.onTap,
    this.showDay = false,
  });
  final Entry entry;
  final Ledger ledger;
  final VoidCallback onTap;
  final bool showDay;
  @override
  Widget build(BuildContext context) {
    final from = ledger.findAccount(entry.account).name;
    final transfer = entry.kind == EntryKind.transfer;
    final label = entry.memo.isNotEmpty
        ? entry.memo
        : (transfer ? '振替' : entry.category);
    final detail = transfer
        ? '$from → ${ledger.findAccount(entry.destination!).name}'
        : '${entry.category} · $from';
    final color = switch (entry.kind) {
      EntryKind.expense => context.expense,
      EntryKind.income => context.income,
      EntryKind.transfer => context.colors.onSurface,
    };
    return Column(
      children: [
        ListTile(
          contentPadding: EdgeInsets.zero,
          minVerticalPadding: 8,
          leading: CircleAvatar(
            radius: 19,
            backgroundColor: context.colors.secondaryContainer,
            foregroundColor: context.colors.onSecondaryContainer,
            child: Icon(
              transfer
                  ? Icons.swap_horiz_rounded
                  : categoryIcon(entry.category),
              size: 19,
            ),
          ),
          title: Text(
            label,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
          subtitle: Text(
            showDay
                ? '${entry.date.month}/${entry.date.day} · $detail'
                : detail,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          trailing: Money(
            entry.kind == EntryKind.expense ? -entry.paid : entry.amount,
            color: color,
            plus: entry.kind == EntryKind.income,
          ),
          onTap: onTap,
        ),
        const Divider(),
      ],
    );
  }
}
