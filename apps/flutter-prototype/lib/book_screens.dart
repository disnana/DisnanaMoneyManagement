part of 'main.dart';

mixin BookEditing<T extends StatefulWidget> on State<T> {
  Ledger get initialBook;
  SaveLedger get saveBook;

  late Ledger book = initialBook;
  bool saving = false;

  Future<bool> commit(Ledger next) async {
    if (saving) return false;
    setState(() => saving = true);
    final saved = await saveBook(next);
    if (mounted) {
      setState(() {
        if (saved) book = next;
        saving = false;
      });
    }
    return saved;
  }
}

class GroupsScreen extends StatefulWidget {
  const GroupsScreen({super.key, required this.ledger, required this.save});
  final Ledger ledger;
  final SaveLedger save;
  @override
  State<GroupsScreen> createState() => _GroupsScreenState();
}

class _GroupsScreenState extends State<GroupsScreen>
    with BookEditing<GroupsScreen> {
  @override
  Ledger get initialBook => widget.ledger;
  @override
  SaveLedger get saveBook => widget.save;

  Future<void> edit([String? old]) async {
    final name = await showDialog<String>(
      context: context,
      builder: (_) => NameDialog(
        title: old == null ? '家計グループを追加' : '家計グループを編集',
        label: 'グループ名',
        value: old,
        taken: book.groups.where((name) => name != old).toSet(),
      ),
    );
    if (!mounted || name == null || name == old) return;
    await commit(
      book.copyWith(
        groups: [
          for (final group in book.groups) group == old ? name : group,
          if (old == null) name,
        ],
        entries: [
          for (final e in book.entries)
            e.info.group == old ? e.withInfo(e.info.inGroup(name)) : e,
        ],
        recurrences: [
          for (final r in book.recurrences)
            r.group == old
                ? Recurrence(
                    r.id,
                    r.name,
                    r.amount,
                    r.kind,
                    r.account,
                    r.category,
                    r.day,
                    name,
                    active: r.active,
                  )
                : r,
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('家計グループ'),
      actions: [
        IconButton(
          tooltip: '家計グループを追加',
          icon: const Icon(Icons.add),
          onPressed: saving ? null : () => edit(),
        ),
      ],
    ),
    body: ListView(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      children: [
        for (final group in book.groups) ...[
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.workspaces_outline),
            title: Text(group),
            onTap: saving ? null : () => edit(group),
            subtitle: Text(
              '${book.entries.where((e) => e.info.group == group).length}件の取引',
            ),
            trailing:
                book.groups.length > 1 &&
                    !book.entries.any((e) => e.info.group == group) &&
                    !book.recurrences.any((r) => r.group == group)
                ? IconButton(
                    tooltip: '削除',
                    icon: const Icon(Icons.delete_outline),
                    onPressed: saving
                        ? null
                        : () async {
                            if (await confirm(
                                  context,
                                  'グループを削除しますか？',
                                  group,
                                  '削除',
                                ) &&
                                mounted) {
                              await commit(
                                book.copyWith(
                                  groups: book.groups
                                      .where((item) => item != group)
                                      .toList(),
                                ),
                              );
                            }
                          },
                  )
                : null,
          ),
          const Divider(),
        ],
      ],
    ),
  );
}

class CategoryBudgetsScreen extends StatefulWidget {
  const CategoryBudgetsScreen({
    super.key,
    required this.ledger,
    required this.save,
  });
  final Ledger ledger;
  final SaveLedger save;
  @override
  State<CategoryBudgetsScreen> createState() => _CategoryBudgetsScreenState();
}

class _CategoryBudgetsScreenState extends State<CategoryBudgetsScreen>
    with BookEditing<CategoryBudgetsScreen> {
  @override
  Ledger get initialBook => widget.ledger;
  @override
  SaveLedger get saveBook => widget.save;
  var month = monthOf(DateTime.now());

  @override
  Widget build(BuildContext context) {
    final entries = book.monthEntries(month);
    return Scaffold(
      appBar: AppBar(title: const Text('カテゴリ別予算')),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          PeriodBar(
            month: month,
            onMonth: (date) => setState(() => month = date),
            groups: const [],
            group: null,
            onGroup: (_) {},
          ),
          for (final category in book.categories) ...[
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(categoryIcon(category)),
              title: Text(category),
              subtitle: Text(
                '支出 ${yen(sumKind(entries.where((e) => e.category == category), EntryKind.expense))}',
              ),
              trailing: Text(
                book.categoryBudgets[category] == null
                    ? '未設定'
                    : yen(book.categoryBudgets[category]!),
              ),
              onTap: saving
                  ? null
                  : () async {
                      final value = await showDialog<int>(
                        context: context,
                        builder: (_) => BudgetDialog(
                          budget: book.categoryBudgets[category] ?? 0,
                        ),
                      );
                      if (value == null || !mounted) return;
                      final next = {...book.categoryBudgets}..remove(category);
                      if (value > 0) next[category] = value;
                      await commit(book.copyWith(categoryBudgets: next));
                    },
            ),
            const Divider(),
          ],
        ],
      ),
    );
  }
}

class AdvancesScreen extends StatefulWidget {
  const AdvancesScreen({super.key, required this.ledger, required this.save});
  final Ledger ledger;
  final SaveLedger save;
  @override
  State<AdvancesScreen> createState() => _AdvancesScreenState();
}

class _AdvancesScreenState extends State<AdvancesScreen>
    with BookEditing<AdvancesScreen> {
  @override
  Ledger get initialBook => widget.ledger;
  @override
  SaveLedger get saveBook => widget.save;

  Future<void> recover(Entry entry) async {
    final account = await showModalBottomSheet<Account>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
          children: [
            Text('回収先の口座', style: context.type.titleLarge),
            for (final account in book.accounts.where(
              (a) => a.kind != AccountKind.card,
            ))
              ListTile(
                leading: Icon(accountIcon(account.kind)),
                title: Text(account.name),
                onTap: () => Navigator.pop(context, account),
              ),
          ],
        ),
      ),
    );
    if (!mounted || account == null) return;
    final today = dayOf(DateTime.now());
    final date = await showDatePicker(
      context: context,
      initialDate: today.isBefore(entry.date) ? entry.date : today,
      firstDate: dayOf(entry.date),
      lastDate: DateTime(2199, 12, 31),
      helpText: '回収した日',
    );
    if (date == null || !mounted) return;
    await commit(book.reimburse(entry, account, date));
  }

  @override
  Widget build(BuildContext context) {
    final pending = book.advances
        .where((e) => book.reimbursementFor(e) == null)
        .toList();
    final settled = book.advances
        .where((e) => book.reimbursementFor(e) != null)
        .toList();
    return Scaffold(
      appBar: AppBar(title: const Text('立て替え')),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const Text('回収待ち'),
          Money(pending.fold(0, (total, e) => total + e.paid), size: 28),
          const SizedBox(height: 13),
          if (pending.isEmpty) const Text('回収待ちの立て替えはありません。'),
          for (final entry in pending)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(entry.info.advance),
              subtitle: Text('${dayLabel(entry.date)} · ${yen(entry.paid)}'),
              trailing: TextButton(
                onPressed: saving || entry.paid <= 0
                    ? null
                    : () => recover(entry),
                child: const Text('回収を記録'),
              ),
            ),
          const SizedBox(height: 20),
          const Divider(),
          const SizedBox(height: 20),
          const SectionHeading('回収済み'),
          for (final entry in settled)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.check_circle_outline),
              title: Text(entry.info.advance),
              subtitle: Text(dayLabel(book.reimbursementFor(entry)!.date)),
              trailing: Money(entry.paid),
            ),
        ],
      ),
    );
  }
}

class TaxScreen extends StatefulWidget {
  const TaxScreen({super.key, required this.ledger});
  final Ledger ledger;
  @override
  State<TaxScreen> createState() => _TaxScreenState();
}

class _TaxScreenState extends State<TaxScreen> {
  int year = DateTime.now().year;

  @override
  Widget build(BuildContext context) {
    final entries =
        widget.ledger.entries
            .where(
              (e) =>
                  e.date.year == year &&
                  e.info.business &&
                  e.kind != EntryKind.transfer &&
                  e.countsInSummary,
            )
            .toList()
          ..sort((a, b) => a.date.compareTo(b.date));
    final income = entries.where((e) => e.kind == EntryKind.income);
    final expenses = entries.where((e) => e.kind == EntryKind.expense);
    final gross = income.fold(0, (sum, e) => sum + e.amount);
    final cost = expenses.fold(
      0,
      (sum, e) => sum + (e.paid * e.info.ratio / 100).round(),
    );
    final tax = income.fold(0, (sum, e) => sum + e.info.withholding);

    return Scaffold(
      appBar: AppBar(title: const Text('確定申告の準備')),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          Row(
            children: [
              Expanded(
                child: Text('$year年', style: context.type.headlineSmall),
              ),
              IconButton(
                tooltip: '前年',
                onPressed: () => setState(() => year--),
                icon: const Icon(Icons.chevron_left),
              ),
              IconButton(
                tooltip: '翌年',
                onPressed: () => setState(() => year++),
                icon: const Icon(Icons.chevron_right),
              ),
            ],
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('事業収入（源泉徴収前）'),
            trailing: Money(gross),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('経費（事業利用分）'),
            trailing: Money(cost),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('源泉徴収額'),
            trailing: Money(tax),
          ),
          const Divider(),
          const SizedBox(height: 14),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('収入 − 経費'),
            trailing: Money(gross - cost, size: 20),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: entries.isEmpty
                ? null
                : () async {
                    String cell(Object value) {
                      final text = value.toString();
                      final safe =
                          value is String &&
                              RegExp(r'^[=+@\-\t\r]').hasMatch(text)
                          ? "'$text"
                          : text;
                      return '"${safe.replaceAll('"', '""')}"';
                    }

                    final rows = [
                      [
                        '日付',
                        '種類',
                        '金額',
                        'ポイント',
                        '事業割合',
                        '勘定科目',
                        '取引先',
                        '源泉徴収',
                        '内容',
                      ],
                      for (final e in entries)
                        [
                          DateFormat('yyyy-MM-dd').format(e.date),
                          e.kind.label,
                          e.amount,
                          e.points,
                          e.info.ratio,
                          e.info.subject,
                          e.info.counterparty,
                          e.info.withholding,
                          e.memo,
                        ],
                    ];
                    await Clipboard.setData(
                      ClipboardData(
                        text: rows
                            .map((r) => r.map(cell).join(','))
                            .join('\r\n'),
                      ),
                    );
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('事業取引のCSVをコピーしました')),
                      );
                    }
                  },
            icon: const Icon(Icons.copy),
            label: const Text('事業取引のCSVをコピー'),
          ),
          const SizedBox(height: 16),
          for (final e in entries.reversed.take(60))
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(e.memo.isEmpty ? e.category : e.memo),
              subtitle: Text(
                '${dayLabel(e.date)} · ${e.info.subject.isEmpty ? e.category : e.info.subject}',
              ),
              trailing: Money(
                e.kind == EntryKind.expense
                    ? -(e.paid * e.info.ratio / 100).round()
                    : e.amount,
              ),
            ),
        ],
      ),
    );
  }
}
