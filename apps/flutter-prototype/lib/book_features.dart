part of 'ledger.dart';

const householdDefaults = ['個人', '家庭', '事業'];

class EntryInfo {
  const EntryInfo({
    this.group = '個人',
    this.business = false,
    this.ratio = 100,
    this.subject = '',
    this.counterparty = '',
    this.advance = '',
    this.reimbursementOf,
    this.withholding = 0,
    this.fee = 0,
    this.recurring,
    this.cardMonth,
  });
  factory EntryInfo.fromJson(Map<String, dynamic> json) => EntryInfo(
    group: json['group'] as String? ?? '個人',
    business: json['business'] as bool? ?? false,
    ratio: json['ratio'] as int? ?? 100,
    subject: json['subject'] as String? ?? '',
    counterparty: json['counterparty'] as String? ?? '',
    advance: json['advance'] as String? ?? '',
    reimbursementOf: json['reimbursementOf'] as String?,
    withholding: json['withholding'] as int? ?? 0,
    fee: json['fee'] as int? ?? 0,
    recurring: json['recurring'] as String?,
    cardMonth: json['cardMonth'] as String?,
  );
  final String group, subject, counterparty, advance;
  final bool business;
  final int ratio, withholding, fee;
  final String? reimbursementOf, recurring, cardMonth;
  EntryInfo inGroup(String value) => EntryInfo(
    group: value,
    business: business,
    ratio: ratio,
    subject: subject,
    counterparty: counterparty,
    advance: advance,
    reimbursementOf: reimbursementOf,
    withholding: withholding,
    fee: fee,
    recurring: recurring,
    cardMonth: cardMonth,
  );
  Map<String, Object?> toJson() => {
    'group': group,
    'business': business,
    'ratio': ratio,
    'subject': subject,
    'counterparty': counterparty,
    'advance': advance,
    'reimbursementOf': reimbursementOf,
    'withholding': withholding,
    'fee': fee,
    'recurring': recurring,
    'cardMonth': cardMonth,
  };
}

class Recurrence {
  const Recurrence(
    this.id,
    this.name,
    this.amount,
    this.kind,
    this.account,
    this.category,
    this.day,
    this.group, {
    this.active = true,
  });
  factory Recurrence.fromJson(Map<String, dynamic> json) => Recurrence(
    json['id'] as String,
    json['name'] as String,
    json['amount'] as int,
    EntryKind.values.byName(json['kind'] as String),
    json['account'] as String,
    json['category'] as String,
    json['day'] as int,
    json['group'] as String,
    active: json['active'] as bool? ?? true,
  );
  final String id, name, account, category, group;
  final int amount, day;
  final EntryKind kind;
  final bool active;

  Entry entryFor(DateTime month) {
    final date = dayInMonth(month, day);
    return Entry(
      id: 'repeat-$id-${monthKey(date)}',
      kind: kind,
      date: date,
      amount: amount,
      account: account,
      category: category,
      memo: name,
      info: EntryInfo(group: group, recurring: id),
    );
  }

  Map<String, Object> toJson() => {
    'id': id,
    'name': name,
    'amount': amount,
    'kind': kind.name,
    'account': account,
    'category': category,
    'day': day,
    'group': group,
    'active': active,
  };
}

class PurchasePlan {
  const PurchasePlan(
    this.id,
    this.name,
    this.amount,
    this.date,
    this.category,
    this.account,
    this.priority,
    this.note, {
    this.expenseId,
  });
  factory PurchasePlan.fromJson(Map<String, dynamic> json) => PurchasePlan(
    json['id'] as String,
    json['name'] as String,
    json['amount'] as int,
    DateTime.parse(json['date'] as String),
    json['category'] as String,
    json['account'] as String,
    json['priority'] as int,
    json['note'] as String,
    expenseId: json['expenseId'] as String?,
  );
  final String id, name, category, account, note;
  final String? expenseId;
  final int amount, priority;
  final DateTime date;

  PurchasePlan recorded(String id) => PurchasePlan(
    this.id,
    name,
    amount,
    date,
    category,
    account,
    priority,
    note,
    expenseId: id,
  );
  Map<String, Object?> toJson() => {
    'id': id,
    'name': name,
    'amount': amount,
    'date': date.toIso8601String(),
    'category': category,
    'account': account,
    'priority': priority,
    'note': note,
    'expenseId': expenseId,
  };
}

String monthKey(DateTime month) =>
    '${month.year}-${month.month.toString().padLeft(2, '0')}';
DateTime dayInMonth(DateTime month, int day) => DateTime(
  month.year,
  month.month,
  day.clamp(1, DateTime(month.year, month.month + 1, 0).day),
);

extension BookFeatures on Ledger {
  List<Entry> newRecurringEntries(DateTime month) {
    final ids = entries.map((entry) => entry.id).toSet();
    final existing = entries
        .where((entry) => monthOf(entry.date) == monthOf(month))
        .map((entry) => entry.info.recurring)
        .toSet();
    return [
      for (final schedule in recurrences)
        if (schedule.active && !existing.contains(schedule.id))
          if (schedule.entryFor(month) case final entry
              when !ids.contains(entry.id))
            entry,
    ];
  }

  List<Entry> get advances => entries
      .where(
        (entry) =>
            entry.kind == EntryKind.expense && entry.info.advance.isNotEmpty,
      )
      .toList();
  Entry? reimbursementFor(Entry entry) =>
      entries.where((e) => e.info.reimbursementOf == entry.id).firstOrNull;
  Ledger reimburse(Entry entry, Account account, DateTime date) {
    if (entry.kind != EntryKind.expense ||
        entry.info.advance.isEmpty ||
        entry.paid <= 0 ||
        reimbursementFor(entry) != null ||
        !accounts.contains(account)) {
      return this;
    }
    return withEntry(
      Entry(
        id: newId(),
        kind: EntryKind.income,
        date: date,
        amount: entry.paid,
        account: account.id,
        category: '返金',
        memo: '${entry.info.advance}から回収',
        info: EntryInfo(group: entry.info.group, reimbursementOf: entry.id),
      ),
    );
  }
}
