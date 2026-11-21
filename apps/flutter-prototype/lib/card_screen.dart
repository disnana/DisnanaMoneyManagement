part of 'main.dart';

class CardBillingScreen extends StatefulWidget {
  const CardBillingScreen({
    super.key,
    required this.ledger,
    required this.id,
    required this.save,
  });
  final Ledger ledger;
  final String id;
  final SaveLedger save;
  @override
  State<CardBillingScreen> createState() => _CardBillingScreenState();
}

class _CardBillingScreenState extends State<CardBillingScreen>
    with BookEditing<CardBillingScreen> {
  @override
  Ledger get initialBook => widget.ledger;
  @override
  SaveLedger get saveBook => widget.save;
  var month = monthOf(DateTime.now());

  Future<void> confirmBill(Account account, CardStatement bill) async {
    final value = await showDialog<int>(
      context: context,
      builder: (_) =>
          CardAmountDialog(original: bill.total, isConfirmed: bill.confirmed),
    );
    if (!mounted || value == null) return;
    final updated = account.withCard(
      account.card.withBill(month, value < 0 ? null : value),
    );
    await commit(
      book.copyWith(
        accounts: [
          for (final item in book.accounts)
            if (item.id == updated.id) updated else item,
        ],
      ),
    );
  }

  Future<void> pay(Account card, CardStatement bill) async {
    final source = book.accounts
        .where((a) => a.id != card.id && a.kind != AccountKind.card)
        .toList();
    if (source.isEmpty || saving) return;
    final bank =
        source.where((a) => a.id == card.linked).firstOrNull ?? source.first;
    final entry = Entry(
      id: newId(),
      kind: EntryKind.transfer,
      date: dayOf(DateTime.now()),
      amount: bill.remaining,
      account: bank.id,
      destination: card.id,
      memo: 'カード支払い',
      info: EntryInfo(
        group: card.group ?? book.groups.first,
        cardMonth: monthKey(bill.month),
      ),
    );
    await Navigator.of(context).push<DateTime>(
      MaterialPageRoute(
        builder: (_) => EntryEditor(
          ledger: book,
          initial: entry,
          save: (value) => commit(book.withEntry(value)),
          delete: null,
          cardPayment: true,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final account = book.findAccount(widget.id);
    final bill = book.statement(account, month);
    final next = book.statement(account, moveMonth(month, 1));
    final (start, end) = account.card.cycle(month);
    final due = account.card.dueDate(month);
    final totalUnpaid = (-(book.balances[account.id]!)).clamp(0, 999999999999);
    final warning = due.difference(dayOf(DateTime.now())).inDays;

    return Scaffold(
      appBar: AppBar(title: const Text('カード請求の明細')),
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
          const SizedBox(height: 10),
          Text(account.name, style: context.type.titleMedium),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(child: Text('支払残額', style: context.type.titleMedium)),
              Text(
                bill.confirmed ? '確定' : '見込み',
                style: context.type.labelMedium,
              ),
            ],
          ),
          const SizedBox(height: 5),
          Align(
            alignment: Alignment.centerLeft,
            child: Money(bill.remaining, size: 42, color: context.expense),
          ),
          const SizedBox(height: 8),
          Text(
            '${start.month}/${start.day}〜${end.month}/${end.day}利用分 · ${due.month}/${due.day}支払い',
            style: context.type.bodySmall,
          ),
          if (bill.remaining > 0 &&
              warning >= 0 &&
              warning <= account.card.warningDays &&
              account.card.warningDays > 0)
            Text(
              warning == 0 ? '今日が支払日です' : '支払日まであと$warning日',
              style: TextStyle(color: context.expense),
            ),
          const SizedBox(height: 15),
          if (bill.remaining > 0 &&
              book.accounts.any(
                (a) => a.id != account.id && a.kind != AccountKind.card,
              ))
            FilledButton(
              onPressed: saving ? null : () => pay(account, bill),
              child: const Text('支払いを記録'),
            ),
          TextButton(
            onPressed: saving ? null : () => confirmBill(account, bill),
            child: const Text('確定額を入力'),
          ),
          const SizedBox(height: 8),
          const Divider(),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('請求額'),
            trailing: Money(bill.total),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('支払い記帳済み'),
            trailing: Money(bill.paid),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('翌月の支払残額'),
            trailing: Money(next.remaining),
            onTap: () => setState(() => month = next.month),
          ),
          if (account.card.limit > 0) ...[
            const Divider(),
            const SizedBox(height: 14),
            const SectionHeading('カードの利用状況'),
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('利用可能額'),
              subtitle: Text('利用枠 ${yen(account.card.limit)}'),
              trailing: Money(
                (account.card.limit - totalUnpaid).clamp(0, account.card.limit),
              ),
            ),
            LinearProgressIndicator(
              value: (totalUnpaid / account.card.limit).clamp(0, 1),
              minHeight: 7,
            ),
            const SizedBox(height: 8),
          ],
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('現在の未払い残高'),
            trailing: Money(totalUnpaid),
          ),
          const Divider(),
          const SizedBox(height: 16),
          const SectionHeading('請求に含まれる支出'),
          if (bill.charges.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 10),
              child: Text('この請求月の利用明細はありません。'),
            ),
          for (final item in bill.charges)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(item.memo.isEmpty ? item.category : item.memo),
              subtitle: Text(dayLabel(item.date)),
              trailing: Money(-item.paid, color: context.expense),
            ),
        ],
      ),
    );
  }
}

class CardAmountDialog extends StatefulWidget {
  const CardAmountDialog({
    super.key,
    required this.original,
    required this.isConfirmed,
  });
  final int original;
  final bool isConfirmed;
  @override
  State<CardAmountDialog> createState() => _CardAmountDialogState();
}

class _CardAmountDialogState extends State<CardAmountDialog> {
  final keyForm = GlobalKey<FormState>();
  late final input = TextEditingController(text: widget.original.toString());
  @override
  void dispose() {
    input.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('請求の確定額'),
    content: Form(
      key: keyForm,
      child: TextFormField(
        controller: input,
        keyboardType: TextInputType.number,
        decoration: const InputDecoration(labelText: '確定額', prefixText: '¥ '),
        validator: validateNonNegative,
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('キャンセル'),
      ),
      if (widget.isConfirmed)
        TextButton(
          onPressed: () => Navigator.pop(context, -1),
          child: const Text('見込みに戻す'),
        ),
      FilledButton(
        onPressed: () {
          if (keyForm.currentState!.validate()) {
            Navigator.pop(context, parseAmount(input.text));
          }
        },
        child: const Text('保存'),
      ),
    ],
  );
}
