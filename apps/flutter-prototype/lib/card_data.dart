part of 'ledger.dart';

class CardTerms {
  const CardTerms({
    this.closing = 31,
    this.payment = 27,
    this.offset = 1,
    this.limit = 0,
    this.warningDays = 0,
    this.confirmed = const {},
  });
  factory CardTerms.fromJson(Map<String, dynamic> data) => CardTerms(
    closing: data['closing'] as int? ?? 31,
    payment: data['payment'] as int? ?? 27,
    offset: data['offset'] as int? ?? 1,
    limit: data['limit'] as int? ?? 0,
    warningDays: data['warningDays'] as int? ?? 0,
    confirmed: (data['confirmed'] as Map?)?.cast<String, int>() ?? const {},
  );
  final int closing, payment, offset, limit, warningDays;
  final Map<String, int> confirmed;

  bool get valid =>
      closing >= 1 &&
      closing <= 31 &&
      payment >= 1 &&
      payment <= 31 &&
      (offset == 1 || offset == 2) &&
      limit >= 0 &&
      warningDays >= 0 &&
      confirmed.entries.every(
        (entry) =>
            RegExp(r'^\d{4}-(?:0[1-9]|1[0-2])$').hasMatch(entry.key) &&
            entry.value >= 0,
      );

  DateTime paymentMonth(DateTime date) =>
      moveMonth(date, offset + (date.day <= closing ? 0 : 1));
  DateTime dueDate(DateTime month) => dayInMonth(month, payment);
  (DateTime, DateTime) cycle(DateTime month) {
    final closingMonth = moveMonth(month, -offset);
    final previous = dayInMonth(moveMonth(closingMonth, -1), closing);
    return (
      DateTime(previous.year, previous.month, previous.day + 1),
      dayInMonth(closingMonth, closing),
    );
  }

  CardTerms withBill(DateTime month, int? value) => CardTerms(
    closing: closing,
    payment: payment,
    offset: offset,
    limit: limit,
    warningDays: warningDays,
    confirmed: {...confirmed}..updateForMonth(monthKey(month), value),
  );
  Map<String, Object> toJson() => {
    'closing': closing,
    'payment': payment,
    'offset': offset,
    'limit': limit,
    'warningDays': warningDays,
    'confirmed': confirmed,
  };
}

extension on Map<String, int> {
  void updateForMonth(String key, int? value) {
    if (value == null) {
      remove(key);
    } else {
      this[key] = value;
    }
  }
}

class CardStatement {
  const CardStatement(
    this.month,
    this.total,
    this.paid,
    this.confirmed,
    this.charges,
  );
  final DateTime month;
  final int total, paid;
  final bool confirmed;
  final List<Entry> charges;
  int get remaining => (total - paid).clamp(0, total);
}

extension CardLedger on Ledger {
  CardStatement statement(Account card, DateTime month) {
    final terms = card.card;
    final key = monthKey(month);
    final charges = <Entry>[];
    var estimated = 0;
    var paid = 0;
    for (final entry in entries) {
      if (entry.kind == EntryKind.expense &&
          entry.account == card.id &&
          monthKey(terms.paymentMonth(entry.date)) == key) {
        charges.add(entry);
        estimated += entry.paid;
      }
      if ((entry.kind == EntryKind.transfer && entry.destination == card.id ||
              entry.kind == EntryKind.income && entry.account == card.id) &&
          (entry.info.cardMonth ?? monthKey(entry.date)) == key) {
        paid += entry.kind == EntryKind.income ? entry.inflow : entry.amount;
      }
    }
    charges.sort((a, b) => b.date.compareTo(a.date));
    final confirmed = terms.confirmed[key];
    return CardStatement(
      month,
      confirmed ?? estimated,
      paid,
      confirmed != null,
      charges,
    );
  }
}
