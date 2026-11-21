import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

const accounts = <String, int>{
  'メイン銀行（普通）': 2961560,
  '事業用口座（普通）': 612211,
  '現金・財布': -800,
  'モバイルSuica / Pay': 36800,
  'その他の口座': 516150,
};

const categories = ['食費', '交通費', '日用品', 'その他'];

class Expense {
  const Expense(this.amount, this.date, this.category, this.account, this.memo);

  factory Expense.fromJson(Map<String, dynamic> json) => Expense(
    json['amount'] as int,
    DateTime.parse(json['date'] as String),
    json['category'] as String,
    json['account'] as String,
    json['memo'] as String,
  );

  final int amount;
  final DateTime date;
  final String category;
  final String account;
  final String memo;

  Map<String, Object> toJson() => {
    'amount': amount,
    'date': date.toIso8601String(),
    'category': category,
    'account': account,
    'memo': memo,
  };
}

class Ledger {
  const Ledger({
    required this.sampleMonth,
    this.expenses = const [],
    this.hideBalance = false,
  });

  factory Ledger.fromJson(Map<String, dynamic> json) => Ledger(
    sampleMonth: DateTime.parse(json['sampleMonth'] as String),
    expenses: (json['expenses'] as List<dynamic>)
        .map((expense) => Expense.fromJson(expense as Map<String, dynamic>))
        .toList(growable: false),
    hideBalance: json['hideBalance'] as bool,
  );

  final DateTime sampleMonth;
  final List<Expense> expenses;
  final bool hideBalance;

  int accountBalance(String account) => expenses
      .where((expense) => expense.account == account)
      .fold(accounts[account]!, (balance, expense) => balance - expense.amount);

  int get balance => accounts.keys.fold(
    0,
    (total, account) => total + accountBalance(account),
  );

  List<Expense> history(DateTime month) {
    final items = [
      ...expenses,
      if (sameMonth(month, sampleMonth)) ...[
        Expense(
          4280,
          DateTime(month.year, month.month, 17),
          '食費',
          accounts.keys.first,
          'ライフ',
        ),
        Expense(
          680,
          DateTime(month.year, month.month, 16),
          '交通費',
          'モバイルSuica / Pay',
          'JR東日本',
        ),
      ],
    ].where((expense) => sameMonth(expense.date, month)).toList();
    items.sort((a, b) => b.date.compareTo(a.date));
    return items;
  }

  int income(DateTime month) => sameMonth(month, sampleMonth) ? 546600 : 0;

  int spending(DateTime month) =>
      (sameMonth(month, sampleMonth) ? 162808 : 0) +
      expenses
          .where((expense) => sameMonth(expense.date, month))
          .fold(0, (total, expense) => total + expense.amount);

  Ledger record(Expense expense) => Ledger(
    sampleMonth: sampleMonth,
    expenses: [expense, ...expenses],
    hideBalance: hideBalance,
  );

  Ledger toggleBalance() => Ledger(
    sampleMonth: sampleMonth,
    expenses: expenses,
    hideBalance: !hideBalance,
  );

  Map<String, Object> toJson() => {
    'sampleMonth': sampleMonth.toIso8601String(),
    'expenses': expenses,
    'hideBalance': hideBalance,
  };
}

bool sameMonth(DateTime a, DateTime b) =>
    a.year == b.year && a.month == b.month;

abstract interface class LedgerStorage {
  Future<Ledger> load();
  Future<void> save(Ledger ledger);
}

class DeviceLedgerStorage implements LedgerStorage {
  DeviceLedgerStorage() : _preferences = SharedPreferencesAsync();

  static const _key = 'prototype_ledger_v1';
  final SharedPreferencesAsync _preferences;

  @override
  Future<Ledger> load() async {
    final saved = await _preferences.getString(_key);
    if (saved != null) {
      return Ledger.fromJson(jsonDecode(saved) as Map<String, dynamic>);
    }
    final now = DateTime.now();
    final ledger = Ledger(sampleMonth: DateTime(now.year, now.month));
    await save(ledger);
    return ledger;
  }

  @override
  Future<void> save(Ledger ledger) =>
      _preferences.setString(_key, jsonEncode(ledger.toJson()));
}
