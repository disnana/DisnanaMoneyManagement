part of 'main.dart';

class StatementScreen extends StatefulWidget {
  const StatementScreen({
    super.key,
    required this.ledger,
    required this.statement,
    required this.save,
  });
  final Ledger ledger;
  final Statement statement;
  final SaveLedger save;
  @override
  State<StatementScreen> createState() => _StatementScreenState();
}

class _StatementScreenState extends State<StatementScreen> {
  late final accounts = widget.ledger.accounts
      .where(widget.statement.format.accepts)
      .toList();
  late Account? account = accounts.firstOrNull;
  bool busy = false;

  Future<void> apply(List<Entry> entries) async {
    if (busy || entries.isEmpty) return;
    setState(() => busy = true);
    final saved = await widget.save(
      widget.ledger.copyWith(
        entries: [...entries, ...widget.ledger.entries],
        categories: {
          ...widget.ledger.categories,
          ...entries
              .where((e) => e.kind == EntryKind.expense)
              .map((e) => e.category),
        }.toList(),
        incomeCategories: {
          ...widget.ledger.incomeCategories,
          ...entries
              .where((e) => e.kind == EntryKind.income)
              .map((e) => e.category),
        }.toList(),
      ),
    );
    if (!mounted) return;
    if (saved) {
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('${entries.length}件を取り込みました。')));
    } else {
      setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final selected = account;
    final entries = selected == null
        ? <Entry>[]
        : widget.statement.newEntries(widget.ledger, selected);
    return PopScope(
      canPop: !busy,
      child: Scaffold(
        appBar: AppBar(title: const Text('明細の取り込み')),
        body: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            Text(
              widget.statement.format.label,
              style: context.type.headlineSmall?.copyWith(
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 20),
            if (accounts.isEmpty)
              Text(
                '口座タブで${widget.statement.format.accountKind?.label ?? '日本円の口座'}を追加してください。',
              )
            else ...[
              DropdownButtonFormField<Account>(
                initialValue: account,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: '取り込み先',
                  prefixIcon: Icon(Icons.account_balance_wallet_outlined),
                ),
                items: [
                  for (final value in accounts)
                    DropdownMenuItem(value: value, child: Text(value.name)),
                ],
                onChanged: busy
                    ? null
                    : (value) => setState(() => account = value),
              ),
              const SizedBox(height: 21),
              Text(
                '取り込み対象 ${entries.length}件',
                style: context.type.titleMedium,
              ),
              Text(
                '重複 ${widget.statement.rows.length - entries.length}件 · 対象外 ${widget.statement.skipped}件',
              ),
              if (widget.statement.format == StatementFormat.rakuten)
                const Padding(
                  padding: EdgeInsets.only(top: 8),
                  child: Text('手数料のない一括払いを取り込みます。'),
                ),
              const SizedBox(height: 16),
              for (final entry in entries.take(8)) ...[
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(entry.memo),
                  subtitle: Text(dayLabel(entry.date)),
                  trailing: Money(
                    entry.kind == EntryKind.expense
                        ? -entry.amount
                        : entry.amount,
                    plus: entry.kind == EntryKind.income,
                  ),
                ),
                const Divider(),
              ],
              if (entries.length > 8)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  child: Text('ほか ${entries.length - 8}件'),
                ),
            ],
          ],
        ),
        bottomNavigationBar: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(24, 4, 24, 14),
            child: FilledButton(
              onPressed: entries.isEmpty || busy ? null : () => apply(entries),
              child: Text(busy ? '取り込み中…' : '${entries.length}件を取り込む'),
            ),
          ),
        ),
      ),
    );
  }
}
