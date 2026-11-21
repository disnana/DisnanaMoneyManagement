import 'ledger.dart';

const _categories = {
  'food': '食費',
  'dining': '外食・カフェ・会議',
  'daily': '日用品・消耗品',
  'housing': '住居費・家賃',
  'utilities': '水道・光熱・通信',
  'transport': '交通費・移動',
  'hobby': '趣味・娯楽・交際',
  'clothing': '衣服・美容',
  'medical': '医療・保険',
  'education': '書籍・ソフト・研修',
  'business_ops': '業務委託・広告・手数料',
  'other_expense': 'その他支出',
  'salary': '給与・賞与',
  'side_income': '事業・フリーランス売上',
  'misc_income': '雑収入・ポイント・ギフト',
  'investment_income': '配当・利息・売却益',
  'other_income': '臨時収入・その他',
};

Ledger readBackup(Map<String, dynamic> document) {
  if (document.containsKey('sampleMonth') ||
      document['version'] == 2 && document.containsKey('entries')) {
    return Ledger.fromJson(document);
  }
  final Map<String, dynamic> data;
  if (document.containsKey('format')) {
    if (document['format'] != 'dmm-finance-backup' ||
        document['version'] != 1) {
      throw const FormatException('対応しているバックアップ形式を確認してください。');
    }
    data = document['state'] as Map<String, dynamic>;
  } else {
    data = document;
  }
  if (data['accounts'] is! List || data['transactions'] is! List) {
    throw const FormatException('家計簿バックアップの形式が違います。');
  }

  final categoriesById = {..._categories};
  final expenseCategories = <String>{...defaultCategories};
  final income = <String>{...defaultIncomeCategories};
  for (final item in _rows(data['customCategories'])) {
    final name = _text(item['name']);
    if (name.isEmpty) continue;
    categoriesById[item['id'] as String] = name;
    (item['type'] == 'income' ? income : expenseCategories).add(name);
  }

  final groups = <String>{...householdDefaults};
  final importedGroups = <String, String>{};
  final customGroups = <String>{};
  for (final item in _rows(data['ledgers'])) {
    final name = _text(item['name']);
    if (name.isEmpty) continue;
    var label = name;
    var count = 2;
    while (!customGroups.add(label)) {
      label = '$name ${count++}';
    }
    groups.add(label);
    importedGroups[item['id'] as String] = label;
  }

  String groupFor(Map<String, dynamic> item) =>
      importedGroups[item['ledgerId']] ??
      switch (item['scope'] ?? item['usageScope']) {
        'business' => '事業',
        'household' => '家庭',
        _ => '個人',
      };
  String categoryFor(Map<String, dynamic> item) {
    final key = _text(item['categoryId']);
    final name = categoriesById[key] ?? (key.isEmpty ? 'その他' : key);
    (item['type'] == 'income' ? income : expenseCategories).add(name);
    return name;
  }

  final accounts = [
    for (final item in _rows(data['accounts']))
      Account(
        item['id'] as String,
        item['name'] as String,
        switch (item['type']) {
          'bank' => AccountKind.bank,
          'psp' => AccountKind.psp,
          'foreign_bank' => AccountKind.foreignBank,
          'credit' => AccountKind.card,
          'debit' => AccountKind.debit,
          'cash' => AccountKind.cash,
          'emoney' => AccountKind.electronic,
          'investment' => AccountKind.investment,
          _ => throw const FormatException('未対応の口座種別が含まれています。'),
        },
        _money(item['initialBalance']),
        group: groupFor(item),
        note: _text(item['note']),
        institution: _text(item['institution']),
        currency: item['currency'] as String? ?? 'JPY',
        rate: (item['fxRateToJpy'] as num?)?.toDouble(),
        linked: item['linkedBankAccountId'] as String?,
        card: CardTerms(
          closing: _money(item['closingDay'], fallback: 31),
          payment: _money(item['paymentDay'], fallback: 27),
          offset: _money(item['paymentMonthOffset'], fallback: 1),
          limit: _money(item['creditLimit']),
          warningDays: _money(item['paymentWarningDays']),
          confirmed: {
            for (final pair
                in (item['confirmedBillings'] as Map? ?? {}).entries)
              pair.key as String: _money(pair.value),
          },
        ),
      ),
  ];
  final rawEntries = _rows(data['transactions']);
  final entries = <Entry>[];
  for (final item in rawEntries) {
    final kind = EntryKind.values.byName(item['type'] as String);
    final group = groupFor(item);
    final amount = _money(item['amount']);
    final rawAdvance = item['advance'] as Map?;
    final reimbursement = item['reimbursementOf'] as String?;
    final label = _text(item['title']);
    final memo = _text(item['memo']);
    entries.add(
      Entry(
        id: item['id'] as String,
        kind: kind,
        date: DateTime.parse(item['date'] as String),
        amount: amount,
        account: item['accountId'] as String,
        category: kind == EntryKind.transfer ? '' : categoryFor(item),
        destination: kind == EntryKind.transfer
            ? item['toAccountId'] as String?
            : null,
        memo: [label, memo].where((text) => text.isNotEmpty).join('\n'),
        points: _money(item['pointUsed']).clamp(0, amount < 0 ? 0 : amount),
        info: EntryInfo(
          group: group,
          business: item['scope'] == 'business',
          ratio: _money(item['businessRatio'], fallback: 100),
          subject: _text(item['accountingSubject']),
          counterparty: _text(item['counterparty']),
          advance: rawAdvance == null
              ? ''
              : ((_text(rawAdvance['for']).isEmpty)
                    ? '立て替え'
                    : _text(rawAdvance['for'])),
          reimbursementOf: reimbursement,
          withholding: _money(item['withholdingTax']),
          fee:
              _money(item['transferFee']) +
              _money(item['platformTransferFee']) +
              _money(item['fxConversionFee']),
          recurring: item['recurringId'] as String?,
          cardMonth: item['targetBillingMonth'] as String?,
        ),
      ),
    );
  }

  final recurring = [
    for (final item in _rows(data['recurringItems']))
      Recurrence(
        item['id'] as String,
        item['title'] as String,
        _money(item['amount']),
        EntryKind.values.byName(item['type'] as String),
        item['accountId'] as String,
        categoryFor(item),
        _money(item['dayOfMonth']),
        groupFor(item),
        active: item['isActive'] != false,
      ),
  ];
  final goals = [
    for (final item in _rows(data['savingsGoals']))
      Goal(
        item['id'] as String,
        item['title'] as String,
        _money(item['targetAmount']),
        _money(item['currentAmount']),
        targetDate: DateTime.tryParse(_text(item['targetDate'])),
        monthly: _money(item['monthlyContribution']),
        note: _text(item['note']),
      ),
  ];
  final categoryBudgets = <String, int>{};
  for (final item in _rows(data['budgets'])) {
    final category = categoryFor(item);
    categoryBudgets.update(
      category,
      (value) => value + _money(item['monthlyLimit']),
      ifAbsent: () => _money(item['monthlyLimit']),
    );
  }
  final plans = <PurchasePlan>[];
  for (final item in _rows(data['purchaseCandidates'])) {
    final month = _text(item['month']);
    final date =
        DateTime.tryParse(_text(item['plannedDate'])) ??
        DateTime.tryParse('$month-01') ??
        DateTime.now();
    final account =
        accounts
            .where((account) => account.id == item['accountId'])
            .firstOrNull ??
        accounts.firstOrNull;
    if (account == null) continue;
    plans.add(
      PurchasePlan(
        item['id'] as String,
        item['title'] as String,
        _money(item['amount']),
        date,
        categoryFor(item),
        account.id,
        _money(item['priority'], fallback: 2),
        _text(item['note']),
        expenseId: null,
      ),
    );
  }

  // Round-trip through the Flutter validator before replacing local data.
  return Ledger.checked(
    Ledger(
      accounts: accounts,
      entries: entries,
      categories: expenseCategories.toList(),
      incomeCategories: income.toList(),
      goals: goals,
      groups: groups.toList(),
      recurrences: recurring,
      purchases: plans,
      categoryBudgets: categoryBudgets,
    ),
  );
}

Iterable<Map<String, dynamic>> _rows(dynamic input) =>
    (input as List? ?? const []).cast<Map<String, dynamic>>();

String _text(Object? input) => input is String ? input.trim() : '';

int _money(Object? input, {int fallback = 0}) {
  if (input == null) return fallback;
  final value = input is num ? input : num.tryParse(input.toString());
  if (value == null ||
      !value.isFinite ||
      value.roundToDouble() != value.toDouble()) {
    throw const FormatException('円未満の金額または不正な数字が含まれています。元のバックアップをご確認ください。');
  }
  return value.toInt();
}
