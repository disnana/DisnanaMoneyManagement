part of 'main.dart';

typedef _MonthlyFlow = ({String label, int income, int spending});

const _cashChartHeight = 132.0;
final _compactYen = NumberFormat.compact(locale: 'ja_JP');

class AnalyticsContent extends StatefulWidget {
  const AnalyticsContent({
    super.key,
    required this.ledger,
    required this.month,
    this.group,
    required this.period,
    required this.onEdit,
  });
  final Ledger ledger;
  final DateTime month;
  final String? group;
  final Widget period;
  final ValueChanged<Entry> onEdit;
  @override
  State<AnalyticsContent> createState() => _AnalyticsContentState();
}

enum _AnalyticsView { breakdown, trend }

class _CategoryFlow {
  _CategoryFlow(this.name);
  final String name;
  final entries = <Entry>[];
  int amount = 0;
}

class _AnalyticsSummary {
  _AnalyticsSummary(Ledger ledger, DateTime month, String? group) {
    final start = moveMonth(month, -5);
    final end = moveMonth(month, 1);
    final income = List<int>.filled(6, 0);
    final spending = List<int>.filled(6, 0);
    final byKind = <EntryKind, Map<String, _CategoryFlow>>{
      EntryKind.income: {},
      EntryKind.expense: {},
    };
    for (final entry in ledger.entries) {
      if (!entry.countsInSummary ||
          entry.kind == EntryKind.transfer ||
          (group != null && entry.info.group != group) ||
          entry.date.isBefore(start) ||
          !entry.date.isBefore(end)) {
        continue;
      }
      final date = entry.date.toLocal();
      final index = (date.year - start.year) * 12 + date.month - start.month;
      final expense = entry.kind == EntryKind.expense;
      final amount = expense ? entry.paid : entry.inflow;
      (expense ? spending : income)[index] += amount;
      if (index == 5 && amount > 0) {
        byKind[entry.kind]!.putIfAbsent(
            entry.category,
            () => _CategoryFlow(entry.category),
          )
          ..amount += amount
          ..entries.add(entry);
      }
    }
    months = [
      for (var i = 0; i < 6; i++)
        (
          label: '${moveMonth(start, i).month}月',
          income: income[i],
          spending: spending[i],
        ),
    ];
    categories = {
      for (final item in byKind.entries)
        item.key: item.value.values.toList()
          ..sort((a, b) {
            final amountOrder = b.amount.compareTo(a.amount);
            return amountOrder == 0 ? a.name.compareTo(b.name) : amountOrder;
          }),
    };
    peak = months.fold(
      0,
      (peak, item) => math.max(peak, math.max(item.income, item.spending)),
    );
  }

  late final List<_MonthlyFlow> months;
  late final Map<EntryKind, List<_CategoryFlow>> categories;
  late final int peak;
}

class _AnalyticsContentState extends State<AnalyticsContent> {
  EntryKind kind = EntryKind.expense;
  _AnalyticsView view = _AnalyticsView.breakdown;
  late var summary = _AnalyticsSummary(
    widget.ledger,
    widget.month,
    widget.group,
  );

  @override
  void didUpdateWidget(covariant AnalyticsContent oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!identical(oldWidget.ledger, widget.ledger) ||
        oldWidget.month != widget.month ||
        oldWidget.group != widget.group) {
      summary = _AnalyticsSummary(widget.ledger, widget.month, widget.group);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ledger = widget.ledger;
    final month = widget.month;
    final current = summary.months.last;
    final income = current.income;
    final spending = current.spending;
    final ranked = summary.categories[kind]!;
    final composition = ranked.fold(0, (total, item) => total + item.amount);
    final colors = context.dark ? _darkCategoryColors : _lightCategoryColors;
    final slices = [
      for (final (index, item) in ranked.indexed)
        (amount: item.amount, color: colors[index % colors.length]),
    ];
    return PageInset(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          widget.period,
          const SizedBox(height: 15),
          Text('月の収支', style: context.type.titleSmall),
          const SizedBox(height: 5),
          Text(
            '${income > spending ? '+' : ''}${yen(income - spending)}',
            style: context.type.headlineLarge?.copyWith(
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 20,
            runSpacing: 10,
            children: [
              _ChartLabel('収入', context.income, amount: income),
              _ChartLabel('支出', context.expense, amount: spending),
            ],
          ),
          const SizedBox(height: 18),
          SegmentedButton<_AnalyticsView>(
            showSelectedIcon: false,
            segments: const [
              ButtonSegment(value: _AnalyticsView.breakdown, label: Text('内訳')),
              ButtonSegment(value: _AnalyticsView.trend, label: Text('推移')),
            ],
            selected: {view},
            onSelectionChanged: (value) => setState(() => view = value.single),
          ),
          const SizedBox(height: 16),
          if (view == _AnalyticsView.trend) ...[
            const SectionHeading('6か月の収支'),
            const SizedBox(height: 13),
            if (summary.peak == 0)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 18),
                child: Text('取引を記録すると、月ごとの変化が見られます。'),
              )
            else
              _CashFlowHistory(
                key: ValueKey(month),
                months: summary.months,
                peak: summary.peak,
              ),
          ] else ...[
            const SectionHeading('カテゴリ別の内訳'),
            const SizedBox(height: 8),
            SegmentedButton<EntryKind>(
              showSelectedIcon: false,
              segments: const [
                ButtonSegment(value: EntryKind.expense, label: Text('支出')),
                ButtonSegment(value: EntryKind.income, label: Text('収入')),
              ],
              selected: {kind},
              onSelectionChanged: (value) =>
                  setState(() => kind = value.single),
            ),
            const SizedBox(height: 10),
            if (ranked.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 16),
                child: Text('この月の${kind.label}はありません。'),
              )
            else
              _CategoryDonut(
                label: kind.label,
                total: composition,
                slices: slices,
              ),
            for (final (index, item) in ranked.indexed)
              InkWell(
                onTap: () async {
                  final chosen = await Navigator.of(context).push<Entry>(
                    MaterialPageRoute(
                      builder: (route) => Scaffold(
                        appBar: AppBar(title: Text(item.name)),
                        body: ListView.builder(
                          padding: const EdgeInsets.all(24),
                          itemCount: item.entries.length,
                          itemBuilder: (context, index) {
                            final entry = item.entries[index];
                            return EntryRow(
                              entry: entry,
                              ledger: ledger,
                              showDay: true,
                              onTap: () => Navigator.pop(route, entry),
                            );
                          },
                        ),
                      ),
                    ),
                  );
                  if (mounted && chosen != null) widget.onEdit(chosen);
                },
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 7),
                  child: Column(
                    children: [
                      Row(
                        children: [
                          Icon(
                            categoryIcon(item.name),
                            size: 17,
                            color: slices[index].color,
                          ),
                          const SizedBox(width: 8),
                          Expanded(child: Text(item.name)),
                          Money(item.amount),
                          const SizedBox(width: 10),
                          SizedBox(
                            width: 35,
                            child: Text(
                              '${(item.amount / composition * 100).round()}%',
                              textAlign: TextAlign.end,
                              style: context.type.labelSmall,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 7),
                      LinearProgressIndicator(
                        value: item.amount / composition,
                        color: slices[index].color,
                        backgroundColor: context.colors.surfaceContainerHighest,
                        minHeight: 8,
                        borderRadius: BorderRadius.circular(5),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ],
      ),
    );
  }
}

const _lightCategoryColors = [
  Color(0xff28715e),
  Color(0xffb15a38),
  Color(0xff436ba2),
  Color(0xff8d557c),
  Color(0xff9a711e),
  Color(0xff486968),
  Color(0xff765fad),
  Color(0xffa95154),
];

const _darkCategoryColors = [
  Color(0xff70c4a9),
  Color(0xfff1a07f),
  Color(0xff8eb6ed),
  Color(0xffdca5c6),
  Color(0xffdcb568),
  Color(0xff91b8b7),
  Color(0xffb9a8e3),
  Color(0xffed9a9d),
];

typedef _CategorySlice = ({int amount, Color color});

class _CategoryDonut extends StatelessWidget {
  const _CategoryDonut({
    required this.label,
    required this.total,
    required this.slices,
  });

  final String label;
  final int total;
  final List<_CategorySlice> slices;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 10),
    child: Center(
      child: Semantics(
        label: '$labelの円グラフ',
        child: SizedBox.square(
          dimension: 168,
          child: CustomPaint(
            painter: _CategoryDonutPainter(total, slices),
            child: Center(
              child: SizedBox(
                width: 106,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('$label合計', style: context.type.labelMedium),
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Money(total, size: 22),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

class _CategoryDonutPainter extends CustomPainter {
  const _CategoryDonutPainter(this.total, this.slices);

  final int total;
  final List<_CategorySlice> slices;

  @override
  void paint(Canvas canvas, Size size) {
    const thickness = 24.0;
    final center = size.center(Offset.zero);
    final radius = (size.shortestSide - thickness) / 2;
    final bounds = Rect.fromCircle(center: center, radius: radius);
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = thickness;
    var start = -math.pi / 2;
    for (final slice in slices) {
      final sweep = 2 * math.pi * slice.amount / total;
      final gap = slices.length == 1 ? 0.0 : math.min(0.045, sweep / 5);
      canvas.drawArc(
        bounds,
        start + gap / 2,
        sweep - gap,
        false,
        paint..color = slice.color,
      );
      start += sweep;
    }
  }

  @override
  bool shouldRepaint(_CategoryDonutPainter oldDelegate) =>
      total != oldDelegate.total || !listEquals(slices, oldDelegate.slices);
}

class _CashFlowHistory extends StatefulWidget {
  const _CashFlowHistory({super.key, required this.months, required this.peak});
  final List<_MonthlyFlow> months;
  final int peak;

  @override
  State<_CashFlowHistory> createState() => _CashFlowHistoryState();
}

class _CashFlowHistoryState extends State<_CashFlowHistory> {
  late int selected = widget.months.length - 1;

  @override
  Widget build(BuildContext context) {
    const divisions = 3;
    final step = _axisStep((widget.peak / divisions).ceil());
    final limit = step * divisions;
    final line = context.colors.outlineVariant;
    final selection = widget.months[selected];
    final labelStyle = context.type.labelSmall?.copyWith(
      color: context.colors.onSurfaceVariant,
      fontFeatures: _figures,
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ExcludeSemantics(
              child: SizedBox(
                width: 42,
                height: _cashChartHeight,
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    for (var i = 0; i <= divisions; i++)
                      Positioned(
                        top: _cashChartHeight * i / divisions - 7,
                        left: 0,
                        right: 6,
                        child: Text(
                          _compactYen.format(limit - step * i),
                          textAlign: TextAlign.end,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: labelStyle,
                        ),
                      ),
                  ],
                ),
              ),
            ),
            Expanded(
              child: Stack(
                children: [
                  SizedBox(
                    height: _cashChartHeight,
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        for (var i = 0; i <= divisions; i++)
                          Divider(height: 1, thickness: 1, color: line),
                      ],
                    ),
                  ),
                  Row(
                    children: [
                      for (final (index, item) in widget.months.indexed)
                        Expanded(
                          child: _CashFlowMonth(
                            flow: item,
                            limit: limit,
                            selected: index == selected,
                            onTap: () => setState(() => selected = index),
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 12,
          runSpacing: 5,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Text(selection.label, style: context.type.labelLarge),
            _ChartLabel('収入', context.income, amount: selection.income),
            _ChartLabel('支出', context.expense, amount: selection.spending),
          ],
        ),
      ],
    );
  }

  int _axisStep(int minimum) {
    var unit = 1;
    while (unit * 10 <= minimum) {
      unit *= 10;
    }
    return [1, 2, 5, 10].firstWhere((n) => n * unit >= minimum) * unit;
  }
}

class _CashFlowMonth extends StatelessWidget {
  const _CashFlowMonth({
    required this.flow,
    required this.limit,
    required this.selected,
    required this.onTap,
  });

  final _MonthlyFlow flow;
  final int limit;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(8);
    return Semantics(
      button: true,
      selected: selected,
      label: '${flow.label} 収入 ${yen(flow.income)} 支出 ${yen(flow.spending)}',
      onTap: onTap,
      excludeSemantics: true,
      child: InkWell(
        borderRadius: radius,
        onTap: onTap,
        child: Ink(
          decoration: BoxDecoration(
            color: selected
                ? context.colors.primary.withValues(alpha: 0.09)
                : null,
            borderRadius: radius,
          ),
          child: LayoutBuilder(
            builder: (context, constraints) {
              final width = ((constraints.maxWidth - 12) / 2).clamp(1.0, 28.0);
              return Column(
                children: [
                  SizedBox(
                    height: _cashChartHeight,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        _ColumnBar(
                          width: width,
                          value: flow.income / limit,
                          color: context.income,
                        ),
                        const SizedBox(width: 4),
                        _ColumnBar(
                          width: width,
                          value: flow.spending / limit,
                          color: context.expense,
                        ),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 5),
                    child: Text(
                      flow.label,
                      maxLines: 1,
                      style: context.type.labelSmall?.copyWith(
                        fontWeight: selected
                            ? FontWeight.w800
                            : FontWeight.w500,
                      ),
                    ),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}

class _ColumnBar extends StatelessWidget {
  const _ColumnBar({
    required this.width,
    required this.value,
    required this.color,
  });
  final double width;
  final double value;
  final Color color;
  @override
  Widget build(BuildContext context) => Container(
    width: width,
    height: _cashChartHeight * value,
    decoration: BoxDecoration(
      color: color,
      borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
    ),
  );
}

class _ChartLabel extends StatelessWidget {
  const _ChartLabel(this.label, this.color, {required this.amount});
  final String label;
  final Color color;
  final int amount;
  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Icon(
        label == '収入' ? Icons.north_east : Icons.south_east,
        color: color,
        size: 15,
      ),
      const SizedBox(width: 4),
      Text(label),
      const SizedBox(width: 7),
      Money(amount, color: color),
    ],
  );
}

class AccountsContent extends StatefulWidget {
  const AccountsContent({
    super.key,
    required this.ledger,
    required this.save,
    required this.goals,
    required this.onEdit,
  });
  final Ledger ledger;
  final SaveLedger save;
  final VoidCallback goals;
  final ValueChanged<Entry> onEdit;
  @override
  State<AccountsContent> createState() => _AccountsContentState();
}

class _AccountsContentState extends State<AccountsContent> {
  bool busy = false;
  Ledger get ledger => widget.ledger;

  Future<void> saveAccount([Account? account]) async {
    if (busy) return;
    final result = await showDialog<Account>(
      context: context,
      builder: (_) => AccountEditor(
        account: account,
        book: ledger,
        delta: account == null ? 0 : ledger.delta(account.id),
      ),
    );
    if (!mounted || result == null || busy) return;
    setState(() => busy = true);
    await widget.save(
      ledger.copyWith(
        accounts: [
          for (final a in ledger.accounts) a.id == result.id ? result : a,
          if (account == null) result,
        ],
      ),
    );
    if (mounted) setState(() => busy = false);
  }

  Future<void> detail(Account account) async {
    final result = await Navigator.of(context).push<Object>(
      MaterialPageRoute(
        builder: (_) => AccountDetails(account: account, ledger: ledger),
      ),
    );
    if (!mounted || result == null) return;
    if (result is Entry) {
      widget.onEdit(result);
    } else if (result == 'edit') {
      await saveAccount(account);
    } else if (result == 'remove') {
      await widget.save(
        ledger.copyWith(
          accounts: ledger.accounts.where((a) => a.id != account.id).toList(),
        ),
      );
    } else if (result == 'billing') {
      await Navigator.of(context).push<void>(
        MaterialPageRoute(
          builder: (_) => CardBillingScreen(
            ledger: ledger,
            id: account.id,
            save: widget.save,
          ),
        ),
      );
    } else if (result == 'pay') {
      final initial = Entry(
        id: newId(),
        kind: EntryKind.transfer,
        date: dayOf(DateTime.now()),
        amount: -(ledger.balances[account.id]!),
        account: ledger.accounts
            .firstWhere((a) => a.kind != AccountKind.card)
            .id,
        destination: account.id,
        memo: 'カード支払い',
      );
      await Navigator.of(context).push<DateTime>(
        MaterialPageRoute(
          builder: (_) => EntryEditor(
            ledger: ledger,
            initial: initial,
            cardPayment: true,
            save: (value) => widget.save(ledger.withEntry(value)),
            delete: null,
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final balances = ledger.balances;
    return PageInset(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SectionHeading(
            '口座残高',
            action: '口座を追加',
            onTap: busy ? null : () => saveAccount(),
          ),
          const SizedBox(height: 8),
          if (ledger.hideBalance)
            Text(
              '¥・・・・・・',
              style: context.type.headlineLarge?.copyWith(
                fontWeight: FontWeight.w800,
              ),
            )
          else
            Align(
              alignment: Alignment.centerLeft,
              child: Money(ledger.balance, size: 33),
            ),
          const SizedBox(height: 20),
          for (final kind in AccountKind.values)
            if (ledger.accounts.any((a) => a.kind == kind)) ...[
              SectionHeading(kind.label),
              const SizedBox(height: 4),
              for (final account in ledger.accounts.where(
                (a) => a.kind == kind,
              ))
                Column(
                  children: [
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: CircleAvatar(
                        backgroundColor: context.colors.secondaryContainer,
                        foregroundColor: context.colors.onSecondaryContainer,
                        child: Icon(accountIcon(kind), size: 21),
                      ),
                      title: Text(
                        account.name,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Money(
                            balances[account.id]!,
                            color: balances[account.id]! < 0
                                ? context.expense
                                : null,
                          ),
                          const SizedBox(width: 8),
                          const Icon(Icons.chevron_right_rounded, size: 18),
                        ],
                      ),
                      onTap: busy ? null : () => detail(account),
                    ),
                    const Divider(),
                  ],
                ),
              const SizedBox(height: 19),
            ],
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.savings_outlined),
            title: const Text('貯金目標'),
            trailing: const Icon(Icons.chevron_right),
            onTap: widget.goals,
          ),
        ],
      ),
    );
  }
}

class AccountDetails extends StatelessWidget {
  const AccountDetails({
    super.key,
    required this.account,
    required this.ledger,
  });
  final Account account;
  final Ledger ledger;
  @override
  Widget build(BuildContext context) {
    final amount = ledger.balances[account.id]!;
    final entries =
        ledger.entries
            .where(
              (e) => e.account == account.id || e.destination == account.id,
            )
            .toList()
          ..sort((a, b) => b.date.compareTo(a.date));
    final removable =
        !ledger.accounts.any((a) => a.linked == account.id) &&
        ledger.accounts.length > 1 &&
        entries.isEmpty &&
        !ledger.recurrences.any((r) => r.account == account.id) &&
        !ledger.purchases.any((p) => p.account == account.id);
    return Scaffold(
      appBar: AppBar(
        title: Text(account.name, overflow: TextOverflow.ellipsis),
        actions: [
          IconButton(
            tooltip: '口座を編集',
            onPressed: () => Navigator.pop(context, 'edit'),
            icon: const Icon(Icons.edit_outlined),
          ),
          if (removable)
            IconButton(
              tooltip: '口座を削除',
              onPressed: () async {
                if (await confirm(context, '口座を削除しますか？', account.name, '削除') &&
                    context.mounted) {
                  Navigator.pop(context, 'remove');
                }
              },
              icon: const Icon(Icons.delete_outline),
            ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          Text(account.kind == AccountKind.card ? '未払い残高' : '現在の残高'),
          const SizedBox(height: 6),
          Align(
            alignment: Alignment.centerLeft,
            child: Money(
              account.kind == AccountKind.card && amount < 0 ? -amount : amount,
              size: 33,
            ),
          ),
          if (account.kind == AccountKind.card) ...[
            const SizedBox(height: 12),
            SettingRow(
              'カード請求の明細',
              Icons.calendar_month_outlined,
              onTap: () => Navigator.pop(context, 'billing'),
            ),
          ],
          if (account.institution.isNotEmpty) Text(account.institution),
          if (account.currency != 'JPY') Text('${account.currency} · 円換算表示'),
          if (account.note.isNotEmpty) Text(account.note),
          if (account.kind == AccountKind.card &&
              amount < 0 &&
              ledger.accounts.any((a) => a.kind != AccountKind.card)) ...[
            const SizedBox(height: 10),
            FilledButton.icon(
              onPressed: () => Navigator.pop(context, 'pay'),
              icon: const Icon(Icons.swap_horiz),
              label: const Text('カード支払いを記録'),
            ),
          ],
          const SizedBox(height: 22),
          const SectionHeading('口座の明細'),
          if (entries.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 14),
              child: Text('明細はまだありません。'),
            ),
          for (final entry in entries)
            EntryRow(
              entry: entry,
              ledger: ledger,
              onTap: () => Navigator.pop(context, entry),
              showDay: true,
            ),
        ],
      ),
    );
  }
}

class AccountEditor extends StatefulWidget {
  const AccountEditor({
    super.key,
    required this.account,
    required this.delta,
    required this.book,
  });
  final Account? account;
  final int delta;
  final Ledger book;
  @override
  State<AccountEditor> createState() => _AccountEditorState();
}

class _AccountEditorState extends State<AccountEditor> {
  final _form = GlobalKey<FormState>();
  late final name = TextEditingController(text: widget.account?.name);
  late final amount = TextEditingController(
    text: widget.account == null
        ? '0'
        : (widget.account!.opening + widget.delta).toString(),
  );
  late AccountKind kind = widget.account?.kind ?? AccountKind.bank;
  late String? linked = widget.account?.linked;
  late String? group = widget.account?.group;
  late String currency = widget.account?.currency ?? 'JPY';
  late int offset = widget.account?.card.offset ?? 1;
  late final banks = widget.book.accounts
      .where((a) => a.id != widget.account?.id && a.kind == AccountKind.bank)
      .toList();
  late final closing = TextEditingController(
    text: (widget.account?.card.closing ?? 31).toString(),
  );
  late final payment = TextEditingController(
    text: (widget.account?.card.payment ?? 27).toString(),
  );
  late final limit = TextEditingController(
    text: (widget.account?.card.limit ?? 0).toString(),
  );
  late final warning = TextEditingController(
    text: (widget.account?.card.warningDays ?? 0).toString(),
  );
  late final rate = TextEditingController(
    text: widget.account?.rate?.toString(),
  );
  late final institution = TextEditingController(
    text: widget.account?.institution,
  );
  late final note = TextEditingController(text: widget.account?.note);
  bool get linkable => kind == AccountKind.card || kind == AccountKind.debit;
  @override
  void dispose() {
    name.dispose();
    amount.dispose();
    closing.dispose();
    payment.dispose();
    limit.dispose();
    warning.dispose();
    rate.dispose();
    institution.dispose();
    note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(widget.account == null ? '口座を追加' : '口座を編集'),
    scrollable: true,
    content: Form(
      key: _form,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextFormField(
            controller: name,
            maxLength: 40,
            decoration: const InputDecoration(
              labelText: '口座名',
              prefixIcon: Icon(Icons.account_balance_outlined),
            ),
            validator: (v) =>
                v == null || v.trim().isEmpty ? '口座名を入力してください' : null,
          ),
          const SizedBox(height: 5),
          DropdownButtonFormField<AccountKind>(
            initialValue: kind,
            isExpanded: true,
            decoration: const InputDecoration(labelText: '種類'),
            items: [
              for (final value in AccountKind.values)
                DropdownMenuItem(value: value, child: Text(value.label)),
            ],
            onChanged:
                widget.account != null &&
                    (widget.book.entries.any(
                          (e) =>
                              e.account == widget.account!.id ||
                              e.destination == widget.account!.id,
                        ) ||
                        widget.book.accounts.any(
                          (a) => a.linked == widget.account!.id,
                        ))
                ? null
                : (value) => setState(() => kind = value!),
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: amount,
            keyboardType: const TextInputType.numberWithOptions(signed: true),
            decoration: const InputDecoration(
              labelText: '現在の残高',
              prefixText: '¥ ',
            ),
            validator: (v) =>
                (parseAmount(v ?? '')?.abs() ?? maxAmount + 1) > maxAmount
                ? '残高を整数で入力してください'
                : null,
          ),
          const SizedBox(height: 14),
          DropdownButtonFormField<String>(
            initialValue: group ?? '',
            isExpanded: true,
            decoration: const InputDecoration(labelText: '家計グループ'),
            items: [
              const DropdownMenuItem(value: '', child: Text('共通')),
              for (final g in {...widget.book.groups, ?group})
                DropdownMenuItem(value: g, child: Text(g)),
            ],
            onChanged: (value) =>
                setState(() => group = value == '' ? null : value),
          ),
          if (linkable && banks.isNotEmpty) ...[
            const SizedBox(height: 14),
            DropdownButtonFormField<String>(
              initialValue: linked ?? '',
              isExpanded: true,
              decoration: const InputDecoration(labelText: '引落口座'),
              items: [
                const DropdownMenuItem(value: '', child: Text('未設定')),
                for (final bank in banks)
                  DropdownMenuItem(value: bank.id, child: Text(bank.name)),
              ],
              onChanged: (value) =>
                  setState(() => linked = value == '' ? null : value),
            ),
          ],
          if (kind == AccountKind.card) ...[
            const SizedBox(height: 18),
            const SectionHeading('請求と利用枠'),
            const SizedBox(height: 10),
            numeric(closing, '締め日', max: 31, minimum: 1),
            const SizedBox(height: 14),
            numeric(payment, '支払日', max: 31, minimum: 1),
            const SizedBox(height: 14),
            DropdownButtonFormField<int>(
              initialValue: offset,
              isExpanded: true,
              decoration: const InputDecoration(labelText: '支払い月'),
              items: const [
                DropdownMenuItem(value: 1, child: Text('翌月')),
                DropdownMenuItem(value: 2, child: Text('翌々月')),
              ],
              onChanged: (value) => setState(() => offset = value!),
            ),
            const SizedBox(height: 14),
            numeric(limit, '利用枠'),
            const SizedBox(height: 14),
            numeric(warning, '支払いの何日前から表示するか', max: 31),
          ],
          const SizedBox(height: 14),
          ExpansionTile(
            tilePadding: EdgeInsets.zero,
            title: const Text('口座の詳細'),
            children: [
              TextField(
                controller: institution,
                decoration: const InputDecoration(labelText: '金融機関'),
              ),
              const SizedBox(height: 14),
              DropdownButtonFormField<String>(
                initialValue: currency,
                isExpanded: true,
                decoration: const InputDecoration(labelText: '通貨（参考）'),
                items: [
                  for (final code in {
                    'JPY',
                    'USD',
                    'EUR',
                    'GBP',
                    'AUD',
                    currency,
                  })
                    DropdownMenuItem(value: code, child: Text(code)),
                ],
                onChanged: (value) => setState(() => currency = value!),
              ),
              if (currency != 'JPY') ...[
                const SizedBox(height: 14),
                TextFormField(
                  controller: rate,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  decoration: const InputDecoration(
                    labelText: '参考レート（1通貨あたりの円）',
                  ),
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) return null;
                    final n = double.tryParse(value);
                    return n == null || !n.isFinite || n <= 0
                        ? '正のレートを入力してください'
                        : null;
                  },
                ),
              ],
              const SizedBox(height: 14),
              TextField(
                controller: note,
                decoration: const InputDecoration(labelText: '口座のメモ'),
              ),
            ],
          ),
        ],
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('キャンセル'),
      ),
      FilledButton(
        onPressed: () {
          if (!_form.currentState!.validate()) return;
          Navigator.pop(
            context,
            Account(
              widget.account?.id ?? newId(),
              name.text.trim(),
              kind,
              parseAmount(amount.text)! - widget.delta,
              linked: linkable ? linked : null,
              group: group,
              currency: currency,
              rate: currency == 'JPY' ? null : double.tryParse(rate.text),
              institution: institution.text.trim(),
              note: note.text.trim(),
              card: kind == AccountKind.card
                  ? CardTerms(
                      closing: parseAmount(closing.text)!,
                      payment: parseAmount(payment.text)!,
                      limit: parseAmount(limit.text)!,
                      offset: offset,
                      warningDays: parseAmount(warning.text)!,
                      confirmed: widget.account?.card.confirmed ?? const {},
                    )
                  : const CardTerms(),
            ),
          );
        },
        child: const Text('保存'),
      ),
    ],
  );
  Widget numeric(
    TextEditingController input,
    String label, {
    int max = maxAmount,
    int minimum = 0,
  }) => TextFormField(
    controller: input,
    keyboardType: TextInputType.number,
    decoration: InputDecoration(labelText: label),
    validator: (text) {
      final n = parseAmount(text ?? '');
      return n == null || n < minimum || n > max ? '入力範囲を確認してください' : null;
    },
  );
}
