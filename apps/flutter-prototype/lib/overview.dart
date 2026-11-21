part of 'main.dart';

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

class _AnalyticsContentState extends State<AnalyticsContent> {
  EntryKind kind = EntryKind.expense;
  @override
  Widget build(BuildContext context) {
    final ledger = widget.ledger;
    final month = widget.month;
    final group = widget.group;
    final selected = ledger.monthEntries(month, group: group);
    final income = sumKind(selected, EntryKind.income);
    final spending = sumKind(selected, EntryKind.expense);
    final history = [
      for (var offset = -5; offset <= 0; offset++)
        (
          month: moveMonth(month, offset),
          entries: ledger.monthEntries(moveMonth(month, offset), group: group),
        ),
    ];
    final values = [
      for (final item in history)
        (
          label: '${item.month.month}月',
          income: sumKind(item.entries, EntryKind.income),
          spending: sumKind(item.entries, EntryKind.expense),
        ),
    ];
    final peak = values.fold(
      1,
      (max, item) =>
          [max, item.income, item.spending].reduce((a, b) => a > b ? a : b),
    );
    final expense = kind == EntryKind.expense;
    final composition = expense ? spending : income;
    final highlight = expense ? context.expense : context.income;
    final byCategory = <String, int>{};
    final matching = selected
        .where(
          (e) =>
              e.kind == kind &&
              e.countsInSummary &&
              (expense ? e.paid : e.inflow) > 0,
        )
        .toList();
    for (final entry in matching) {
      final amount = expense ? entry.paid : entry.inflow;
      byCategory.update(
        entry.category,
        (previous) => previous + amount,
        ifAbsent: () => amount,
      );
    }
    final ranked = byCategory.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
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
          const SizedBox(height: 23),
          const SectionHeading('6か月の収支'),
          const SizedBox(height: 13),
          if (peak == 1)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 18),
              child: Text('取引を記録すると、月ごとの変化が見られます。'),
            )
          else
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                for (final item in values)
                  Expanded(
                    child: Tooltip(
                      message:
                          '${item.label}　収入 ${yen(item.income)}　支出 ${yen(item.spending)}',
                      child: Semantics(
                        label:
                            '${item.label}　収入 ${yen(item.income)}　支出 ${yen(item.spending)}',
                        excludeSemantics: true,
                        child: Column(
                          children: [
                            SizedBox(
                              height: 108,
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  _ColumnBar(
                                    value: item.income / peak,
                                    color: context.income,
                                  ),
                                  const SizedBox(width: 4),
                                  _ColumnBar(
                                    value: item.spending / peak,
                                    color: context.expense,
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 6),
                            Text(item.label, style: context.type.labelSmall),
                          ],
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          const SizedBox(height: 20),
          const Divider(),
          const SizedBox(height: 18),
          const SectionHeading('カテゴリ別の内訳'),
          const SizedBox(height: 8),
          SegmentedButton<EntryKind>(
            showSelectedIcon: false,
            segments: const [
              ButtonSegment(value: EntryKind.expense, label: Text('支出')),
              ButtonSegment(value: EntryKind.income, label: Text('収入')),
            ],
            selected: {kind},
            onSelectionChanged: (value) => setState(() => kind = value.single),
          ),
          const SizedBox(height: 10),
          if (ranked.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Text('この月の${kind.label}はありません。'),
            ),
          for (final item in ranked)
            InkWell(
              onTap: () async {
                final chosen = await Navigator.of(context).push<Entry>(
                  MaterialPageRoute(
                    builder: (route) => Scaffold(
                      appBar: AppBar(title: Text(item.key)),
                      body: ListView(
                        padding: const EdgeInsets.all(24),
                        children: [
                          for (final entry in matching.where(
                            (e) => e.category == item.key,
                          ))
                            EntryRow(
                              entry: entry,
                              ledger: ledger,
                              showDay: true,
                              onTap: () => Navigator.pop(route, entry),
                            ),
                        ],
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
                        Icon(categoryIcon(item.key), size: 17),
                        const SizedBox(width: 8),
                        Expanded(child: Text(item.key)),
                        Money(item.value),
                        const SizedBox(width: 10),
                        SizedBox(
                          width: 35,
                          child: Text(
                            '${(item.value / composition * 100).round()}%',
                            textAlign: TextAlign.end,
                            style: context.type.labelSmall,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 7),
                    LinearProgressIndicator(
                      value: item.value / ranked.first.value,
                      color: highlight,
                      minHeight: 5,
                      borderRadius: BorderRadius.circular(5),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _ColumnBar extends StatelessWidget {
  const _ColumnBar({required this.value, required this.color});
  final double value;
  final Color color;
  @override
  Widget build(BuildContext context) => Container(
    width: 13,
    height: 108 * value,
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
