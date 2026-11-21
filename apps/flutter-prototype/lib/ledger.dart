import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

part 'book_features.dart';
part 'card_data.dart';

enum EntryKind {
  expense('支出'),
  income('収入'),
  transfer('振替');

  const EntryKind(this.label);
  final String label;
}

enum AccountKind {
  bank('銀行口座'),
  foreignBank('外貨口座'),
  psp('決済サービス'),
  investment('投資'),
  debit('デビットカード'),
  cash('現金'),
  electronic('電子マネー'),
  card('クレジットカード');

  const AccountKind(this.label);
  final String label;
}

const defaultCategories = [
  '食費',
  '日用品',
  '交通費',
  '住居費',
  '水道・光熱費',
  '通信費',
  '娯楽費',
  'その他',
];
const defaultIncomeCategories = ['給与', '副収入', '返金', 'その他'];
const maxAmount = 999999999;
String newId() => DateTime.now().microsecondsSinceEpoch.toString();
DateTime monthOf(DateTime date) => DateTime(date.year, date.month);
DateTime dayOf(DateTime date) => DateTime(date.year, date.month, date.day);
DateTime moveMonth(DateTime date, int by) =>
    DateTime(date.year, date.month + by);

class Account {
  const Account(
    this.id,
    this.name,
    this.kind,
    this.opening, {
    this.card = const CardTerms(),
    this.linked,
    this.currency = 'JPY',
    this.rate,
    this.note = '',
    this.institution = '',
    this.group,
  });
  factory Account.fromJson(Map<String, dynamic> json) => Account(
    json['id'] as String,
    json['name'] as String,
    AccountKind.values.byName(json['kind'] as String),
    json['opening'] as int,
    card: CardTerms.fromJson(json['card'] as Map<String, dynamic>? ?? const {}),
    linked: json['linked'] as String?,
    currency: json['currency'] as String? ?? 'JPY',
    rate: (json['rate'] as num?)?.toDouble(),
    note: json['note'] as String? ?? '',
    institution: json['institution'] as String? ?? '',
    group: json['group'] as String?,
  );
  final String id, name;
  final AccountKind kind;
  final int opening;
  final CardTerms card;
  final String? linked, group;
  final String currency, note, institution;
  final double? rate;
  Account withCard(CardTerms value) => Account(
    id,
    name,
    kind,
    opening,
    card: value,
    linked: linked,
    currency: currency,
    rate: rate,
    note: note,
    institution: institution,
    group: group,
  );
  Map<String, Object?> toJson() => {
    'id': id,
    'name': name,
    'kind': kind.name,
    'opening': opening,
    'card': card,
    'linked': linked,
    'currency': currency,
    'rate': rate,
    'note': note,
    'institution': institution,
    'group': group,
  };
}

class Entry {
  const Entry({
    required this.id,
    required this.kind,
    required this.date,
    required this.amount,
    required this.account,
    this.category = '',
    this.destination,
    this.memo = '',
    this.points = 0,
    this.info = const EntryInfo(),
  });
  factory Entry.fromJson(Map<String, dynamic> json) => Entry(
    id: json['id'] as String,
    kind: EntryKind.values.byName(json['kind'] as String),
    date: DateTime.parse(json['date'] as String),
    amount: json['amount'] as int,
    account: json['account'] as String,
    category: json['category'] as String,
    destination: json['destination'] as String?,
    memo: json['memo'] as String,
    points: json['points'] as int? ?? 0,
    info: EntryInfo.fromJson(json['info'] as Map<String, dynamic>? ?? const {}),
  );
  final String id, account, category, memo;
  final String? destination;
  final DateTime date;
  final EntryKind kind;
  final int amount, points;
  final EntryInfo info;
  int get paid => amount - points;
  int get outflow => paid + (kind == EntryKind.transfer ? info.fee : 0);
  int get inflow =>
      kind == EntryKind.income ? amount - info.withholding : amount;
  bool get countsInSummary =>
      info.advance.isEmpty && info.reimbursementOf == null;
  Entry withInfo(EntryInfo value) => Entry(
    id: id,
    kind: kind,
    date: date,
    amount: amount,
    account: account,
    category: category,
    destination: destination,
    memo: memo,
    points: points,
    info: value,
  );
  Map<String, Object?> toJson() => {
    'id': id,
    'kind': kind.name,
    'date': date.toIso8601String(),
    'amount': amount,
    'account': account,
    'category': category,
    'destination': destination,
    'memo': memo,
    'points': points,
    'info': info.toJson(),
  };
}

class Goal {
  const Goal(
    this.id,
    this.name,
    this.target,
    this.saved, {
    this.targetDate,
    this.monthly = 0,
    this.note = '',
  });
  factory Goal.fromJson(Map<String, dynamic> json) => Goal(
    json['id'] as String,
    json['name'] as String,
    json['target'] as int,
    json['saved'] as int,
    targetDate: DateTime.tryParse(json['targetDate'] as String? ?? ''),
    monthly: json['monthly'] as int? ?? 0,
    note: json['note'] as String? ?? '',
  );
  final String id, name;
  final int target, saved, monthly;
  final DateTime? targetDate;
  final String note;
  Map<String, Object?> toJson() => {
    'id': id,
    'name': name,
    'target': target,
    'saved': saved,
    'targetDate': targetDate?.toIso8601String(),
    'monthly': monthly,
    'note': note,
  };
}

class Ledger {
  const Ledger({
    required this.accounts,
    this.entries = const [],
    this.categories = defaultCategories,
    this.incomeCategories = defaultIncomeCategories,
    this.goals = const [],
    this.budget = 0,
    this.hideBalance = false,
    this.theme = 'system',
    this.reduceMotion = false,
    this.haptics = false,
    this.appLock = false,
    this.guideSeen = false,
    this.groups = householdDefaults,
    this.recurrences = const [],
    this.purchases = const [],
    this.categoryBudgets = const {},
  });

  factory Ledger.empty() => const Ledger(
    accounts: [
      Account('cash', '現金・財布', AccountKind.cash, 0),
      Account('bank', 'メイン銀行', AccountKind.bank, 0),
    ],
  );

  factory Ledger.fromJson(Map<String, dynamic> json) {
    if (json['version'] == null && json.containsKey('sampleMonth')) {
      return Ledger._migrate(json);
    }
    if (json['version'] != 2) throw const FormatException('バックアップの形式が違います');
    final ledger = Ledger(
      accounts: (json['accounts'] as List)
          .map((item) => Account.fromJson(item as Map<String, dynamic>))
          .toList(),
      entries: (json['entries'] as List)
          .map((item) => Entry.fromJson(item as Map<String, dynamic>))
          .toList(),
      goals: (json['goals'] as List)
          .map((item) => Goal.fromJson(item as Map<String, dynamic>))
          .toList(),
      categories: (json['categories'] as List).cast<String>().toList(),
      incomeCategories:
          (json['incomeCategories'] as List?)?.cast<String>().toList() ??
          defaultIncomeCategories,
      budget: json['budget'] as int,
      hideBalance: json['hideBalance'] as bool,
      theme: json['theme'] as String,
      reduceMotion: json['reduceMotion'] as bool? ?? false,
      haptics: json['haptics'] as bool? ?? false,
      appLock: json['appLock'] as bool? ?? false,
      guideSeen: json['guideSeen'] as bool? ?? false,
      groups:
          (json['groups'] as List?)?.cast<String>().toList() ??
          householdDefaults,
      recurrences:
          (json['recurrences'] as List?)
              ?.map((e) => Recurrence.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
      purchases:
          (json['purchases'] as List?)
              ?.map((e) => PurchasePlan.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
      categoryBudgets:
          (json['categoryBudgets'] as Map?)?.cast<String, int>() ?? const {},
    );
    final ids = ledger.accounts.map((a) => a.id).toSet();
    final byId = {for (final account in ledger.accounts) account.id: account};
    final byEntryId = {for (final entry in ledger.entries) entry.id: entry};
    if (ledger.groups.isEmpty ||
        ledger.groups.toSet().length != ledger.groups.length ||
        ledger.groups.any((g) => g.trim().isEmpty) ||
        ledger.recurrences.any(
          (r) =>
              r.kind == EntryKind.transfer ||
              !ids.contains(r.account) ||
              r.amount <= 0 ||
              r.amount > maxAmount ||
              r.day < 1 ||
              r.day > 31 ||
              !ledger.groups.contains(r.group),
        ) ||
        ledger.purchases.any(
          (p) =>
              !ids.contains(p.account) || p.amount <= 0 || p.amount > maxAmount,
        ) ||
        ledger.categoryBudgets.values.any(
          (amount) => amount < 0 || amount > maxAmount,
        ) ||
        ids.isEmpty ||
        ids.length != ledger.accounts.length ||
        ledger.entries.map((e) => e.id).toSet().length !=
            ledger.entries.length ||
        ledger.goals.map((g) => g.id).toSet().length != ledger.goals.length ||
        ledger.categories.isEmpty ||
        ledger.incomeCategories.isEmpty ||
        ledger.categories.any((name) => name.trim().isEmpty) ||
        ledger.categories.toSet().length != ledger.categories.length ||
        ledger.accounts.any(
          (a) =>
              a.name.trim().isEmpty ||
              !a.card.valid ||
              (a.linked != null && byId[a.linked]?.kind != AccountKind.bank),
        ) ||
        !['system', 'light', 'dark'].contains(ledger.theme) ||
        ledger.budget < 0 ||
        ledger.goals.any(
          (g) => g.name.trim().isEmpty || g.target <= 0 || g.saved < 0,
        ) ||
        ledger.entries.any(
          (e) =>
              !ids.contains(e.account) ||
              e.amount <= 0 ||
              e.points < 0 ||
              !ledger.groups.contains(e.info.group) ||
              e.info.ratio < 0 ||
              e.info.ratio > 100 ||
              e.info.withholding < 0 ||
              e.info.withholding > e.amount ||
              (e.kind != EntryKind.income && e.info.withholding > 0) ||
              e.info.fee < 0 ||
              e.info.fee > maxAmount ||
              (e.kind != EntryKind.transfer && e.info.fee > 0) ||
              (e.info.advance.isNotEmpty && e.kind != EntryKind.expense) ||
              (e.info.reimbursementOf != null &&
                  (e.kind != EntryKind.income ||
                      byEntryId[e.info.reimbursementOf]
                              ?.info
                              .advance
                              .isNotEmpty !=
                          true)) ||
              e.points > e.amount ||
              (e.kind != EntryKind.expense &&
                  e.points != 0 &&
                  (e.kind != EntryKind.transfer ||
                      byId[e.destination]?.kind != AccountKind.card)) ||
              (e.kind == EntryKind.transfer
                  ? !ids.contains(e.destination) || e.account == e.destination
                  : e.destination != null || e.category.trim().isEmpty),
        )) {
      throw const FormatException('バックアップの内容を確認してください');
    }
    return ledger;
  }

  static Ledger checked(Ledger ledger) =>
      Ledger.fromJson(jsonDecode(jsonEncode(ledger)) as Map<String, dynamic>);

  factory Ledger._migrate(Map<String, dynamic> json) {
    final oldMonth = DateTime.parse(json['sampleMonth'] as String);
    final sample = Ledger.sample(oldMonth);
    const oldAccounts = {
      'メイン銀行（普通）': 'bank',
      '事業用口座（普通）': 'business',
      '現金・財布': 'cash',
      'モバイルSuica / Pay': 'mobile',
      'その他の口座': 'other',
    };
    final old = json['expenses'] as List;
    final converted = <Entry>[
      for (final (index, item) in old.indexed)
        Entry(
          id: 'legacy-$index',
          kind: EntryKind.expense,
          date: DateTime.parse(item['date'] as String),
          amount: item['amount'] as int,
          account: oldAccounts[item['account']] ?? 'bank',
          category: item['category'] as String,
          memo: item['memo'] as String,
        ),
    ];
    return sample.copyWith(
      entries: [...sample.entries, ...converted],
      hideBalance: json['hideBalance'] as bool,
    );
  }

  factory Ledger.sample(DateTime today) {
    final period = monthOf(today);
    final entries = <Entry>[];
    void add(
      String id,
      int day,
      EntryKind kind,
      int amount,
      String account,
      String category,
      String memo, {
      String? destination,
      int ago = 0,
      int points = 0,
    }) {
      final month = moveMonth(period, -ago);
      final end = DateTime(month.year, month.month + 1, 0).day;
      entries.add(
        Entry(
          id: id,
          kind: kind,
          date: DateTime(month.year, month.month, day.clamp(1, end)),
          amount: amount,
          account: account,
          category: category,
          memo: memo,
          destination: destination,
          points: points,
        ),
      );
    }

    final day = today.day;
    add('grocery', day, EntryKind.expense, 4280, 'bank', '食費', 'ライフ');
    add('rail', day - 1, EntryKind.expense, 680, 'mobile', '交通費', 'JR東日本');
    add('lunch', day - 1, EntryKind.expense, 1240, 'cash', '食費', 'ランチ');
    add('salary', day - 2, EntryKind.income, 328400, 'bank', '給与', '給与');
    add(
      'freelance',
      day - 3,
      EntryKind.income,
      218200,
      'business',
      '副収入',
      '制作報酬',
    );
    add('rent', day - 4, EntryKind.expense, 88000, 'bank', '住居費', '家賃');
    add(
      'supplies',
      day - 5,
      EntryKind.expense,
      6480,
      'card',
      '日用品',
      '生活用品',
      points: 480,
    );
    add('bill', day - 6, EntryKind.expense, 10680, 'bank', '水道・光熱費', '電気代');
    add('internet', day - 6, EntryKind.expense, 5180, 'card', '通信費', 'インターネット');
    add('fun', day - 7, EntryKind.expense, 8640, 'card', '娯楽費', '映画・書籍');
    add('grocery-2', day - 7, EntryKind.expense, 23800, 'bank', '食費', '食料品');
    add('commute', day - 8, EntryKind.expense, 14308, 'card', '交通費', '定期券');
    add(
      'charge',
      day - 9,
      EntryKind.transfer,
      5000,
      'bank',
      '',
      'チャージ',
      destination: 'mobile',
    );
    for (var ago = 1; ago <= 5; ago++) {
      add(
        'income-$ago',
        20,
        EntryKind.income,
        515000 - 23000 * ago,
        'bank',
        '給与',
        '給与',
        ago: ago,
      );
      add(
        'rent-$ago',
        5,
        EntryKind.expense,
        88000,
        'bank',
        '住居費',
        '家賃',
        ago: ago,
      );
      add(
        'food-$ago',
        16,
        EntryKind.expense,
        65500 - 5200 * ago,
        'bank',
        '食費',
        '食料品',
        ago: ago,
      );
    }
    const balances = [
      Account('bank', 'メイン銀行（普通）', AccountKind.bank, 2961560),
      Account('business', '事業用口座（普通）', AccountKind.bank, 612211),
      Account('cash', '現金・財布', AccountKind.cash, -800),
      Account('mobile', 'モバイルSuica / Pay', AccountKind.electronic, 36800),
      Account('other', '貯蓄口座', AccountKind.bank, 583650),
      Account(
        'card',
        'メインクレジットカード',
        AccountKind.card,
        -67500,
        linked: 'bank',
        card: CardTerms(closing: 15, payment: 10, limit: 500000),
      ),
    ];
    final activity = Ledger(accounts: balances, entries: entries);
    return Ledger(
      accounts: balances
          .map(
            (a) => Account(
              a.id,
              a.name,
              a.kind,
              a.opening - activity.delta(a.id),
              card: a.card,
              linked: a.linked,
            ),
          )
          .toList(),
      entries: entries,
      budget: 240000,
      goals: const [Goal('trip', '旅行用の積立', 150000, 84000)],
    );
  }

  final List<Account> accounts;
  final List<Entry> entries;
  final List<String> categories, incomeCategories;
  final List<Goal> goals;
  final int budget;
  final bool hideBalance, reduceMotion, haptics, appLock, guideSeen;
  final String theme;
  final List<String> groups;
  final List<Recurrence> recurrences;
  final List<PurchasePlan> purchases;
  final Map<String, int> categoryBudgets;

  Ledger copyWith({
    List<Account>? accounts,
    List<Entry>? entries,
    List<String>? categories,
    List<String>? incomeCategories,
    List<Goal>? goals,
    int? budget,
    bool? hideBalance,
    String? theme,
    bool? reduceMotion,
    bool? haptics,
    bool? appLock,
    bool? guideSeen,
    List<String>? groups,
    List<Recurrence>? recurrences,
    List<PurchasePlan>? purchases,
    Map<String, int>? categoryBudgets,
  }) => Ledger(
    accounts: accounts ?? this.accounts,
    entries: entries ?? this.entries,
    categories: categories ?? this.categories,
    incomeCategories: incomeCategories ?? this.incomeCategories,
    goals: goals ?? this.goals,
    budget: budget ?? this.budget,
    hideBalance: hideBalance ?? this.hideBalance,
    theme: theme ?? this.theme,
    reduceMotion: reduceMotion ?? this.reduceMotion,
    haptics: haptics ?? this.haptics,
    appLock: appLock ?? this.appLock,
    guideSeen: guideSeen ?? this.guideSeen,
    groups: groups ?? this.groups,
    recurrences: recurrences ?? this.recurrences,
    purchases: purchases ?? this.purchases,
    categoryBudgets: categoryBudgets ?? this.categoryBudgets,
  );

  Account findAccount(String id) => accounts.firstWhere((a) => a.id == id);

  String balanceAccount(String id, EntryKind kind) {
    final account = findAccount(id);
    return account.kind == AccountKind.debit && kind != EntryKind.transfer
        ? account.linked ?? id
        : id;
  }

  int delta(String id) {
    var total = 0;
    for (final entry in entries) {
      if (balanceAccount(entry.account, entry.kind) == id) {
        total += entry.kind == EntryKind.income ? entry.inflow : -entry.outflow;
      }
      if (entry.destination == id) total += entry.amount;
    }
    return total;
  }

  Map<String, int> get balances {
    final result = {
      for (final account in accounts) account.id: account.opening,
    };
    final debits = {
      for (final a in accounts)
        if (a.kind == AccountKind.debit && a.linked != null) a.id: a.linked!,
    };
    for (final entry in entries) {
      result.update(
        entry.kind == EntryKind.transfer
            ? entry.account
            : debits[entry.account] ?? entry.account,
        (value) =>
            value +
            (entry.kind == EntryKind.income ? entry.inflow : -entry.outflow),
      );
      if (entry.destination case final destination?) {
        result.update(destination, (value) => value + entry.amount);
      }
    }
    return result;
  }

  int get balance => balances.values.fold(0, (a, b) => a + b);
  List<Entry> monthEntries(DateTime month, {String? group}) {
    final start = monthOf(month);
    final end = moveMonth(start, 1);
    return entries
        .where(
          (e) =>
              !e.date.isBefore(start) &&
              e.date.isBefore(end) &&
              (group == null || e.info.group == group),
        )
        .toList();
  }

  Ledger withEntry(Entry entry) =>
      copyWith(entries: [entry, ...entries.where((e) => e.id != entry.id)]);
  Ledger withoutEntry(String id) => copyWith(
    entries: entries
        .where((e) => e.id != id && e.info.reimbursementOf != id)
        .toList(),
  );

  Map<String, Object> toJson() => {
    'version': 2,
    'accounts': accounts,
    'entries': entries,
    'categories': categories,
    'incomeCategories': incomeCategories,
    'goals': goals,
    'budget': budget,
    'hideBalance': hideBalance,
    'theme': theme,
    'reduceMotion': reduceMotion,
    'haptics': haptics,
    'appLock': appLock,
    'guideSeen': guideSeen,
    'groups': groups,
    'recurrences': recurrences,
    'purchases': purchases,
    'categoryBudgets': categoryBudgets,
  };
}

abstract interface class LedgerStorage {
  Future<Ledger> load();
  Future<void> save(Ledger ledger);
}

class DeviceLedgerStorage implements LedgerStorage {
  static const _key = 'prototype_ledger_v1';
  final _preferences = SharedPreferencesAsync();
  @override
  Future<Ledger> load() async {
    final saved = await _preferences.getString(_key);
    return saved == null
        ? Ledger.empty()
        : Ledger.fromJson(jsonDecode(saved) as Map<String, dynamic>);
  }

  @override
  Future<void> save(Ledger ledger) =>
      _preferences.setString(_key, jsonEncode(ledger));
}
