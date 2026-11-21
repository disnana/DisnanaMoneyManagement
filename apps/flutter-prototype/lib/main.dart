import 'package:material_ui/material_ui.dart';
import 'package:intl/intl.dart';

import 'ledger.dart';

void main() => runApp(ManeApp(storage: DeviceLedgerStorage()));

final _yen = NumberFormat.decimalPattern('ja_JP');
String yen(int amount) =>
    '${amount < 0 ? '−' : ''}¥${_yen.format(amount.abs())}';
String monthLabel(DateTime month) => '${month.year}年${month.month}月';
int parseAmount(String text) {
  final normalized = text.trim().replaceAllMapped(
    RegExp(r'[０-９]'),
    (match) => String.fromCharCode(match[0]!.codeUnitAt(0) - 0xfee0),
  );
  return int.tryParse(normalized) ?? 0;
}

const _amountFeatures = [FontFeature.tabularFigures()];

class ManeApp extends StatelessWidget {
  const ManeApp({super.key, required this.storage});

  final LedgerStorage storage;

  ThemeData _theme(Brightness brightness) {
    final scheme = ColorScheme.fromSeed(
      seedColor: const Color(0xff23645c),
      brightness: brightness,
    );
    return ThemeData(
      colorScheme: scheme,
      scaffoldBackgroundColor: scheme.surface,
      appBarTheme: AppBarTheme(
        backgroundColor: scheme.surface,
        surfaceTintColor: Colors.transparent,
      ),
      snackBarTheme: const SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'マネーちゃん',
    debugShowCheckedModeBanner: false,
    locale: const Locale('ja'),
    localizationsDelegates: GlobalMaterialLocalizations.delegates,
    supportedLocales: const [Locale('ja')],
    theme: _theme(Brightness.light),
    darkTheme: _theme(Brightness.dark),
    home: LedgerScreen(storage: storage),
  );
}

class LedgerScreen extends StatefulWidget {
  const LedgerScreen({super.key, required this.storage});

  final LedgerStorage storage;

  @override
  State<LedgerScreen> createState() => _LedgerScreenState();
}

class _LedgerScreenState extends State<LedgerScreen> {
  late Future<Ledger> _startup;
  Ledger? _ledger;
  var _month = DateTime(DateTime.now().year, DateTime.now().month);
  bool _writing = false;
  bool _formOpen = false;

  @override
  void initState() {
    super.initState();
    _startup = widget.storage.load();
  }

  Future<bool> _save(Ledger ledger) async {
    if (_writing) return false;
    setState(() => _writing = true);
    try {
      await widget.storage.save(ledger);
      if (mounted) setState(() => _ledger = ledger);
      return true;
    } on Exception {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('保存できませんでした。もう一度お試しください。')),
        );
      }
      return false;
    } finally {
      if (mounted) setState(() => _writing = false);
    }
  }

  Future<void> _record(Ledger ledger) async {
    if (_formOpen || _writing) return;
    _formOpen = true;
    final date = await Navigator.of(context).push<DateTime>(
      MaterialPageRoute(
        builder: (context) =>
            ExpenseScreen(save: (expense) => _save(ledger.record(expense))),
      ),
    );
    _formOpen = false;
    if (!mounted || date == null) return;
    setState(() => _month = DateTime(date.year, date.month));
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('支出を記録しました')));
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<Ledger>(
    future: _startup,
    builder: (context, snapshot) {
      final ledger = _ledger ?? snapshot.data;
      if (ledger == null) {
        return Scaffold(
          body: Center(
            child: snapshot.hasError
                ? FilledButton(
                    onPressed: () =>
                        setState(() => _startup = widget.storage.load()),
                    child: const Text('データを読み込み直す'),
                  )
                : const CircularProgressIndicator(semanticsLabel: '読み込み中'),
          ),
        );
      }

      return Scaffold(
        body: CustomScrollView(
          slivers: [
            const SliverAppBar(
              pinned: true,
              title: Text(
                'マネーちゃん',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
            SliverList.list(
              children: [
                BalanceBand(
                  ledger: ledger,
                  toggleBalance: _writing
                      ? null
                      : () => _save(ledger.toggleBalance()),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 20, 24, 24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      MonthSummary(
                        ledger: ledger,
                        month: _month,
                        changeMonth: (offset) => setState(
                          () => _month = DateTime(
                            _month.year,
                            _month.month + offset,
                          ),
                        ),
                      ),
                      const SizedBox(height: 24),
                      const SectionTitle('口座別残高'),
                      ...accounts.keys
                          .take(4)
                          .map(
                            (account) =>
                                AccountRow(ledger: ledger, account: account),
                          ),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: TextButton(
                          onPressed: () => Navigator.of(context).push(
                            MaterialPageRoute<void>(
                              builder: (_) => Scaffold(
                                appBar: AppBar(title: const Text('口座別残高')),
                                body: ListView(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 24,
                                  ),
                                  children: accounts.keys
                                      .map(
                                        (account) => AccountRow(
                                          ledger: ledger,
                                          account: account,
                                        ),
                                      )
                                      .toList(),
                                ),
                              ),
                            ),
                          ),
                          child: const Text('すべての口座を見る'),
                        ),
                      ),
                      const SizedBox(height: 16),
                      const SectionTitle('最近の支出'),
                      if (ledger.history(_month).isEmpty)
                        const Padding(
                          padding: EdgeInsets.symmetric(vertical: 16),
                          child: Text('この月の記録はありません'),
                        )
                      else
                        ...ledger
                            .history(_month)
                            .take(5)
                            .map((expense) => ExpenseRow(expense)),
                    ],
                  ),
                ),
              ],
            ),
          ],
        ),
        bottomNavigationBar: BottomAppBar(
          height: 76,
          child: FilledButton.icon(
            onPressed: _writing ? null : () => _record(ledger),
            icon: const Icon(Icons.add),
            label: const Text('支出を記録'),
          ),
        ),
      );
    },
  );
}

class BalanceBand extends StatelessWidget {
  const BalanceBand({
    super.key,
    required this.ledger,
    required this.toggleBalance,
  });

  final Ledger ledger;
  final VoidCallback? toggleBalance;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return ColoredBox(
      color: colors.primaryContainer,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 19, 24, 26),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  '現在の総資産',
                  style: TextStyle(color: colors.onPrimaryContainer),
                ),
                IconButton(
                  tooltip: ledger.hideBalance ? '総資産を表示' : '総資産を非表示',
                  onPressed: toggleBalance,
                  icon: Icon(
                    ledger.hideBalance
                        ? Icons.visibility_off_outlined
                        : Icons.visibility_outlined,
                  ),
                  color: colors.onPrimaryContainer,
                ),
              ],
            ),
            Text(
              ledger.hideBalance ? '¥・・・・・・' : yen(ledger.balance),
              semanticsLabel: ledger.hideBalance ? '総資産を非表示にしています' : null,
              style: Theme.of(context).textTheme.displaySmall?.copyWith(
                color: colors.onPrimaryContainer,
                fontWeight: FontWeight.w700,
                fontFeatures: _amountFeatures,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class MonthSummary extends StatelessWidget {
  const MonthSummary({
    super.key,
    required this.ledger,
    required this.month,
    required this.changeMonth,
  });

  final Ledger ledger;
  final DateTime month;
  final ValueChanged<int> changeMonth;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final income = ledger.income(month);
    final spending = ledger.spending(month);
    final net = income - spending;
    return Column(
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                monthLabel(month),
                style: Theme.of(context).textTheme.titleMedium
                    ?.copyWith(fontWeight: FontWeight.w700),
              ),
            ),
            IconButton(
              tooltip: '前の月',
              onPressed: () => changeMonth(-1),
              icon: const Icon(Icons.chevron_left),
            ),
            IconButton(
              tooltip: '次の月',
              onPressed: () => changeMonth(1),
              icon: const Icon(Icons.chevron_right),
            ),
          ],
        ),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            border: Border.all(color: colors.outlineVariant),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(
                    child: Metric(
                      '収入',
                      income,
                      Icons.north_east,
                      colors.primary,
                    ),
                  ),
                  Expanded(
                    child: Metric(
                      '支出',
                      spending,
                      Icons.south_east,
                      colors.error,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  if (income > 0)
                    Expanded(
                      flex: income,
                      child: Container(height: 4, color: colors.primary),
                    ),
                  if (spending > 0)
                    Expanded(
                      flex: spending,
                      child: Container(height: 4, color: colors.error),
                    ),
                  if (income + spending == 0)
                    Expanded(
                      child: Container(height: 4, color: colors.outlineVariant),
                    ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('月の収支'),
                  Text(
                    '${net > 0 ? '+' : ''}${yen(net)}',
                    style: TextStyle(
                      color: net < 0 ? colors.error : colors.onSurface,
                      fontWeight: FontWeight.w700,
                      fontFeatures: _amountFeatures,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class Metric extends StatelessWidget {
  const Metric(this.label, this.value, this.icon, this.color, {super.key});

  final String label;
  final int value;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Row(
        children: [
          Icon(icon, color: color, size: 16),
          const SizedBox(width: 5),
          Flexible(child: Text(label)),
        ],
      ),
      const SizedBox(height: 3),
      Text(
        yen(value),
        style: Theme.of(context).textTheme.titleMedium?.copyWith(
          color: color,
          fontFeatures: _amountFeatures,
          fontWeight: FontWeight.w700,
        ),
      ),
    ],
  );
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.label, {super.key});
  final String label;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Text(
      label,
      style: Theme.of(context).textTheme.titleMedium
          ?.copyWith(fontWeight: FontWeight.w700),
    ),
  );
}

class AccountRow extends StatelessWidget {
  const AccountRow({super.key, required this.ledger, required this.account});

  final Ledger ledger;
  final String account;

  @override
  Widget build(BuildContext context) {
    final (icon, type) = switch (account) {
      '現金・財布' => (Icons.wallet_outlined, '現金'),
      'モバイルSuica / Pay' => (Icons.smartphone_outlined, '電子マネー'),
      'その他の口座' => (Icons.account_balance_wallet_outlined, 'その他'),
      _ => (Icons.account_balance_outlined, '銀行口座'),
    };
    return LedgerRow(
      icon: icon,
      title: account,
      subtitle: type,
      amount: ledger.accountBalance(account),
    );
  }
}

class ExpenseRow extends StatelessWidget {
  const ExpenseRow(this.expense, {super.key});
  final Expense expense;

  @override
  Widget build(BuildContext context) => LedgerRow(
    icon: Icons.receipt_long_outlined,
    title: expense.memo.isEmpty ? expense.category : expense.memo,
    subtitle: '${expense.date.month}/${expense.date.day} ・ ${expense.category}',
    amount: -expense.amount,
  );
}

class LedgerRow extends StatelessWidget {
  const LedgerRow({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.amount,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final int amount;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Row(
            children: [
              CircleAvatar(
                radius: 18,
                backgroundColor: colors.secondaryContainer,
                foregroundColor: colors.onSecondaryContainer,
                child: Icon(icon, size: 18),
              ),
              const SizedBox(width: 12),
              Expanded(
                flex: 3,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    Text(
                      subtitle,
                      style: TextStyle(
                        color: colors.onSurfaceVariant,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Flexible(
                flex: 2,
                child: Align(
                  alignment: Alignment.centerRight,
                  child: Text(
                    yen(amount),
                    textAlign: TextAlign.end,
                    style: TextStyle(
                      color: amount < 0 ? colors.error : colors.onSurface,
                      fontWeight: FontWeight.w700,
                      fontFeatures: _amountFeatures,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        const Divider(height: 1),
      ],
    );
  }
}

class ExpenseScreen extends StatefulWidget {
  const ExpenseScreen({super.key, required this.save});

  final Future<bool> Function(Expense) save;

  @override
  State<ExpenseScreen> createState() => _ExpenseScreenState();
}

class _ExpenseScreenState extends State<ExpenseScreen> {
  final _form = GlobalKey<FormState>();
  final _amount = TextEditingController();
  final _memo = TextEditingController();
  var _date = DateUtils.dateOnly(DateTime.now());
  var _category = categories.first;
  var _account = accounts.keys.first;
  bool _saving = false;

  @override
  void dispose() {
    _amount.dispose();
    _memo.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2000),
      lastDate: DateTime(2100, 12, 31),
    );
    if (mounted && date != null) setState(() => _date = date);
  }

  Future<void> _submit() async {
    if (_saving || !_form.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    setState(() => _saving = true);
    final expense = Expense(
      parseAmount(_amount.text),
      _date,
      _category,
      _account,
      _memo.text.trim(),
    );
    final saved = await widget.save(expense);
    if (!mounted) return;
    setState(() => _saving = false);
    if (saved) Navigator.of(context).pop(_date);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    return PopScope(
      canPop: !_saving,
      child: Scaffold(
        appBar: AppBar(title: const Text('支出を記録')),
        body: Form(
          key: _form,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            children: [
              TextFormField(
                controller: _amount,
                enabled: !_saving,
                keyboardType: TextInputType.number,
                textInputAction: TextInputAction.done,
                style: theme.textTheme.displaySmall?.copyWith(
                  fontWeight: FontWeight.w700,
                  fontFeatures: _amountFeatures,
                ),
                decoration: InputDecoration(
                  labelText: '金額',
                  floatingLabelBehavior: FloatingLabelBehavior.always,
                  hintText: '0',
                  prefixText: '¥ ',
                  filled: true,
                  fillColor: colors.primaryContainer,
                  contentPadding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
                  border: OutlineInputBorder(
                    borderSide: BorderSide.none,
                    borderRadius: BorderRadius.circular(24),
                  ),
                ),
                validator: (text) {
                  final amount = parseAmount(text ?? '');
                  return amount < 1 || amount > 999999999
                      ? '1〜999,999,999円で入力してください'
                      : null;
                },
              ),
              const SizedBox(height: 22),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.calendar_today_outlined),
                title: const Text('日付'),
                subtitle: Text(DateFormat.yMMMd('ja_JP').format(_date)),
                trailing: const Icon(Icons.chevron_right),
                onTap: _saving ? null : _pickDate,
              ),
              const Divider(height: 1),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                initialValue: _category,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'カテゴリ',
                  prefixIcon: Icon(Icons.category_outlined),
                  border: OutlineInputBorder(),
                ),
                items: categories
                    .map(
                      (item) =>
                          DropdownMenuItem(value: item, child: Text(item)),
                    )
                    .toList(),
                onChanged: _saving
                    ? null
                    : (item) => setState(() => _category = item!),
              ),
              const SizedBox(height: 18),
              DropdownButtonFormField<String>(
                initialValue: _account,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: '支払い方法',
                  prefixIcon: Icon(Icons.account_balance_wallet_outlined),
                  border: OutlineInputBorder(),
                ),
                items: accounts.keys
                    .map(
                      (item) =>
                          DropdownMenuItem(value: item, child: Text(item)),
                    )
                    .toList(),
                onChanged: _saving
                    ? null
                    : (item) => setState(() => _account = item!),
              ),
              const SizedBox(height: 12),
              ExpansionTile(
                enabled: !_saving,
                tilePadding: EdgeInsets.zero,
                leading: const Icon(Icons.notes_outlined),
                title: const Text('メモを追加'),
                children: [
                  TextFormField(
                    controller: _memo,
                    enabled: !_saving,
                    maxLength: 100,
                    maxLines: 2,
                    decoration: const InputDecoration(
                      labelText: 'メモ（任意）',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        bottomNavigationBar: BottomAppBar(
          height: 76,
          child: FilledButton(
            onPressed: _saving ? null : _submit,
            child: Text(_saving ? '保存中…' : '支出を登録'),
          ),
        ),
      ),
    );
  }
}
