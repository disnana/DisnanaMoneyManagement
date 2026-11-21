part of 'main.dart';

class RecurrencesScreen extends StatefulWidget {
  const RecurrencesScreen({
    super.key,
    required this.ledger,
    required this.save,
  });
  final Ledger ledger;
  final SaveLedger save;
  @override
  State<RecurrencesScreen> createState() => _RecurrencesScreenState();
}

class _RecurrencesScreenState extends State<RecurrencesScreen>
    with BookEditing<RecurrencesScreen> {
  @override
  Ledger get initialBook => widget.ledger;
  @override
  SaveLedger get saveBook => widget.save;
  var month = monthOf(DateTime.now());

  Future<void> edit([Recurrence? previous]) async {
    final entry = await showDialog<Recurrence>(
      context: context,
      builder: (_) =>
          PlanDialog(ledger: book, repeat: true, recurrence: previous),
    );
    if (!mounted || entry == null) return;
    await commit(
      book.copyWith(
        recurrences: [
          for (final item in book.recurrences)
            item.id == entry.id ? entry : item,
          if (previous == null) entry,
        ],
      ),
    );
  }

  Future<void> record(List<Entry> entries) async {
    if (!await confirm(
          context,
          '定期取引を記録しますか？',
          '${monthLabel(month)}の未記録 ${entries.length}件を追加します。',
          '記録する',
        ) ||
        !mounted) {
      return;
    }
    if (await commit(book.copyWith(entries: [...entries, ...book.entries])) &&
        mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('${entries.length}件を記録しました')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final due = book.newRecurringEntries(month);
    return Scaffold(
      appBar: AppBar(
        title: const Text('定期取引'),
        actions: [
          IconButton(
            tooltip: '定期取引を追加',
            icon: const Icon(Icons.add),
            onPressed: saving ? null : () => edit(),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          PeriodBar(
            month: month,
            onMonth: (value) => setState(() => month = value),
            groups: const [],
            group: null,
            onGroup: (_) {},
          ),
          const SizedBox(height: 8),
          if (book.recurrences.isEmpty)
            const Text('家賃や給与を登録して、毎月まとめて記録できます。')
          else
            FilledButton.icon(
              onPressed: saving || due.isEmpty ? null : () => record(due),
              icon: const Icon(Icons.event_available_outlined),
              label: Text('${due.length}件を記録'),
            ),
          const SizedBox(height: 12),
          for (final item in book.recurrences) ...[
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(
                item.kind == EntryKind.income
                    ? Icons.north_east
                    : Icons.south_east,
              ),
              title: Text(item.name),
              subtitle: Text(
                '毎月${item.day}日 · ${item.group} · ${yen(item.amount)}${item.active ? '' : ' · 停止中'}',
              ),
              onTap: saving ? null : () => edit(item),
              trailing: IconButton(
                tooltip: '定期取引を削除',
                icon: const Icon(Icons.delete_outline),
                onPressed: saving
                    ? null
                    : () async {
                        if (await confirm(
                              context,
                              '定期取引を削除しますか？',
                              item.name,
                              '削除',
                            ) &&
                            mounted) {
                          await commit(
                            book.copyWith(
                              recurrences: book.recurrences
                                  .where((r) => r.id != item.id)
                                  .toList(),
                            ),
                          );
                        }
                      },
              ),
            ),
            const Divider(),
          ],
        ],
      ),
    );
  }
}

class PurchasesScreen extends StatefulWidget {
  const PurchasesScreen({super.key, required this.ledger, required this.save});
  final Ledger ledger;
  final SaveLedger save;
  @override
  State<PurchasesScreen> createState() => _PurchasesScreenState();
}

class _PurchasesScreenState extends State<PurchasesScreen>
    with BookEditing<PurchasesScreen> {
  @override
  Ledger get initialBook => widget.ledger;
  @override
  SaveLedger get saveBook => widget.save;

  Future<void> edit([PurchasePlan? previous]) async {
    final item = await showDialog<PurchasePlan>(
      context: context,
      builder: (_) => PlanDialog(ledger: book, repeat: false, plan: previous),
    );
    if (!mounted || item == null) return;
    await commit(
      book.copyWith(
        purchases: [
          for (final plan in book.purchases) plan.id == item.id ? item : plan,
          if (previous == null) item,
        ],
      ),
    );
  }

  Future<void> record(PurchasePlan plan) async {
    if (saving) return;
    final entry = Entry(
      id: plan.expenseId ?? newId(),
      kind: EntryKind.expense,
      date: plan.date,
      amount: plan.amount,
      account: plan.account,
      category: plan.category,
      memo: plan.name,
      info: EntryInfo(group: book.groups.first),
    );
    await Navigator.of(context).push<DateTime>(
      MaterialPageRoute(
        builder: (_) => EntryEditor(
          ledger: book,
          initial: entry,
          delete: null,
          save: (value) => commit(
            book
                .withEntry(value)
                .copyWith(
                  purchases: [
                    for (final item in book.purchases)
                      item.id == plan.id ? item.recorded(value.id) : item,
                  ],
                ),
          ),
        ),
      ),
    );
  }

  bool recorded(PurchasePlan plan) =>
      plan.expenseId != null && book.entries.any((e) => e.id == plan.expenseId);

  @override
  Widget build(BuildContext context) {
    final plans = [...book.purchases]
      ..sort((a, b) {
        final result = (recorded(a) ? 1 : 0).compareTo(recorded(b) ? 1 : 0);
        return result != 0 ? result : a.priority.compareTo(b.priority);
      });
    final upcoming = plans.where(
      (p) => !recorded(p) && monthOf(p.date) == monthOf(DateTime.now()),
    );
    return Scaffold(
      appBar: AppBar(
        title: const Text('購入予定'),
        actions: [
          IconButton(
            tooltip: '候補を追加',
            icon: const Icon(Icons.add),
            onPressed: saving ? null : () => edit(),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          Text('今月の購入予定', style: context.type.titleSmall),
          const SizedBox(height: 4),
          Align(
            alignment: Alignment.centerLeft,
            child: Money(
              upcoming.fold(0, (total, p) => total + p.amount),
              size: 30,
            ),
          ),
          const SizedBox(height: 18),
          if (plans.isEmpty) const Text('購入候補を追加すると、優先度と金額を見比べられます。'),
          for (final plan in plans) ...[
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(
                recorded(plan)
                    ? Icons.check_circle_outline
                    : Icons.shopping_bag_outlined,
              ),
              title: Text(plan.name),
              subtitle: Text(
                '${recorded(plan) ? '記録済み' : ['高', '中', '低'][plan.priority - 1]} · ${dayLabel(plan.date)}${plan.note.isEmpty ? '' : ' · ${plan.note}'}',
              ),
              trailing: Money(plan.amount),
              onTap: saving ? null : () => edit(plan),
            ),
            if (!recorded(plan))
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: saving ? null : () => record(plan),
                  child: const Text('支出として記録'),
                ),
              ),
            const Divider(),
          ],
        ],
      ),
    );
  }
}

class PlanDialog extends StatefulWidget {
  const PlanDialog({
    super.key,
    required this.ledger,
    required this.repeat,
    this.recurrence,
    this.plan,
  });
  final Ledger ledger;
  final bool repeat;
  final Recurrence? recurrence;
  final PurchasePlan? plan;
  @override
  State<PlanDialog> createState() => _PlanDialogState();
}

class _PlanDialogState extends State<PlanDialog> {
  final form = GlobalKey<FormState>();
  late final id = widget.recurrence?.id ?? widget.plan?.id ?? newId();
  late final name = TextEditingController(
    text: widget.recurrence?.name ?? widget.plan?.name,
  );
  late final amount = TextEditingController(
    text: (widget.recurrence?.amount ?? widget.plan?.amount)?.toString(),
  );
  late final day = TextEditingController(
    text: (widget.recurrence?.day ?? DateTime.now().day).toString(),
  );
  late final note = TextEditingController(text: widget.plan?.note);
  late EntryKind kind = widget.recurrence?.kind ?? EntryKind.expense;
  late String account =
      widget.recurrence?.account ??
      widget.plan?.account ??
      widget.ledger.accounts.first.id;
  late String category =
      widget.recurrence?.category ??
      widget.plan?.category ??
      widget.ledger.categories.first;
  late String group = widget.recurrence?.group ?? widget.ledger.groups.first;
  late bool active = widget.recurrence?.active ?? true;
  late DateTime date = widget.plan?.date ?? dayOf(DateTime.now());
  late int priority = widget.plan?.priority ?? 2;
  List<String> get categoryNames => kind == EntryKind.income
      ? widget.ledger.incomeCategories
      : widget.ledger.categories;

  @override
  void dispose() {
    name.dispose();
    amount.dispose();
    day.dispose();
    note.dispose();
    super.dispose();
  }

  void submit() {
    if (!form.currentState!.validate()) return;
    final total = parseAmount(amount.text)!;
    if (widget.repeat) {
      Navigator.pop(
        context,
        Recurrence(
          id,
          name.text.trim(),
          total,
          kind,
          account,
          category,
          parseAmount(day.text)!,
          group,
          active: active,
        ),
      );
    } else {
      Navigator.pop(
        context,
        PurchasePlan(
          id,
          name.text.trim(),
          total,
          date,
          category,
          account,
          priority,
          note.text.trim(),
          expenseId: widget.plan?.expenseId,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    scrollable: true,
    title: Text(widget.repeat ? '定期取引' : '購入候補'),
    content: SizedBox(
      width: 360,
      child: Form(
        key: form,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextFormField(
              controller: name,
              maxLength: 60,
              decoration: const InputDecoration(
                labelText: '名前',
                prefixIcon: Icon(Icons.label_outline),
              ),
              validator: (v) =>
                  v == null || v.trim().isEmpty ? '名前を入力してください' : null,
            ),
            const SizedBox(height: 8),
            TextFormField(
              controller: amount,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: '金額',
                prefixText: '¥ ',
              ),
              validator: (v) => (parseAmount(v ?? '') ?? 0) < 1
                  ? '1円以上で入力してください'
                  : validateNonNegative(v),
            ),
            const SizedBox(height: 14),
            if (widget.repeat) ...[
              DropdownButtonFormField<EntryKind>(
                initialValue: kind,
                isExpanded: true,
                decoration: const InputDecoration(labelText: '種類'),
                items: const [
                  DropdownMenuItem(value: EntryKind.expense, child: Text('支出')),
                  DropdownMenuItem(value: EntryKind.income, child: Text('収入')),
                ],
                onChanged: (value) => setState(() {
                  kind = value!;
                  category = categoryNames.first;
                }),
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: day,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: '毎月の日',
                  suffixText: '日',
                ),
                validator: (v) {
                  final n = parseAmount(v ?? '') ?? 0;
                  return n < 1 || n > 31 ? '1〜31日で入力してください' : null;
                },
              ),
              const SizedBox(height: 14),
              DropdownButtonFormField<String>(
                initialValue: group,
                isExpanded: true,
                decoration: const InputDecoration(labelText: '家計グループ'),
                items: [
                  for (final g in widget.ledger.groups)
                    DropdownMenuItem(value: g, child: Text(g)),
                ],
                onChanged: (v) => setState(() => group = v!),
              ),
              const SizedBox(height: 14),
            ],
            DropdownButtonFormField<String>(
              key: ValueKey(kind),
              initialValue: category,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'カテゴリ'),
              items: [
                for (final value in {...categoryNames, category})
                  DropdownMenuItem(value: value, child: Text(value)),
              ],
              onChanged: (v) => setState(() => category = v!),
            ),
            const SizedBox(height: 14),
            DropdownButtonFormField<String>(
              initialValue: account,
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: '口座',
                prefixIcon: Icon(Icons.account_balance_wallet_outlined),
              ),
              items: [
                for (final a in widget.ledger.accounts)
                  DropdownMenuItem(
                    value: a.id,
                    child: Text(a.name, overflow: TextOverflow.ellipsis),
                  ),
              ],
              onChanged: (value) => setState(() => account = value!),
            ),
            if (widget.repeat)
              SwitchListTile.adaptive(
                title: const Text('有効'),
                contentPadding: EdgeInsets.zero,
                value: active,
                onChanged: (v) => setState(() => active = v),
              )
            else ...[
              const SizedBox(height: 10),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('購入予定日'),
                subtitle: Text(DateFormat.yMMMd('ja').format(date)),
                trailing: const Icon(Icons.calendar_today_outlined),
                onTap: () async {
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: date,
                    firstDate: DateTime(1900),
                    lastDate: DateTime(2199, 12, 31),
                  );
                  if (picked != null && mounted) setState(() => date = picked);
                },
              ),
              DropdownButtonFormField<int>(
                initialValue: priority,
                isExpanded: true,
                decoration: const InputDecoration(labelText: '優先度'),
                items: const [
                  DropdownMenuItem(value: 1, child: Text('高')),
                  DropdownMenuItem(value: 2, child: Text('中')),
                  DropdownMenuItem(value: 3, child: Text('低')),
                ],
                onChanged: (value) => setState(() => priority = value!),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: note,
                decoration: const InputDecoration(labelText: 'メモ（任意）'),
              ),
            ],
          ],
        ),
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('キャンセル'),
      ),
      FilledButton(onPressed: submit, child: const Text('保存')),
    ],
  );
}
