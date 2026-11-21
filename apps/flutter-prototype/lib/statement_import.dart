import 'dart:convert';

import 'package:charset/charset.dart';
import 'package:crypto/crypto.dart';
import 'package:csv/csv.dart';

import 'ledger.dart';

enum StatementFormat {
  smbc('三井住友銀行', AccountKind.bank),
  paypay('PayPay銀行', AccountKind.bank),
  rakuten('楽天カード', AccountKind.card),
  monemy('Monemy', null);

  const StatementFormat(this.label, this.accountKind);
  final String label;
  final AccountKind? accountKind;

  bool accepts(Account account) =>
      account.currency == 'JPY' &&
      (accountKind == null
          ? account.kind != AccountKind.debit
          : account.kind == accountKind);
}

const _monemy = ['日付', '区分', '項目', '収入金額', '支出金額', '内容', 'メモ'];
const _smbc = ['年月日', 'お引出し', 'お預入れ', 'お取り扱い内容', '残高', 'メモ', 'ラベル'];
const _paypay = [
  '操作日(年)',
  '操作日(月)',
  '操作日(日)',
  '操作時刻(時)',
  '操作時刻(分)',
  '操作時刻(秒)',
  '取引順番号',
  '摘要',
  'お支払金額',
  'お預り金額',
  '残高',
  'メモ',
];
const _rakuten = ['利用日', '利用店名・商品名', '利用者', '支払方法', '利用金額', '手数料/利息', '支払総額'];

class StatementRow {
  const StatementRow(
    this.key,
    this.date,
    this.kind,
    this.amount,
    this.title,
    this.category,
  );
  final String key;
  final DateTime date;
  final EntryKind kind;
  final int amount;
  final String title, category;
}

class Statement {
  const Statement(this.format, this.rows, this.skipped);
  final StatementFormat format;
  final List<StatementRow> rows;
  final int skipped;

  List<Entry> newEntries(Ledger ledger, Account account) {
    if (!format.accepts(account) ||
        !ledger.accounts.any(
          (a) => a.id == account.id && a.kind == account.kind,
        )) {
      throw const FormatException('取り込み先の口座が変わりました。');
    }
    final ids = ledger.entries.map((e) => e.id).toSet();
    final result = <Entry>[];
    for (final row in rows) {
      final id =
          'csv-${format.name}-${Uri.encodeComponent(account.id)}-${row.key}';
      if (!ids.add(id)) continue;
      result.add(
        Entry(
          id: id,
          date: row.date,
          kind: row.kind,
          amount: row.amount,
          account: account.id,
          category: row.category.isNotEmpty
              ? row.category
              : (row.kind == EntryKind.expense
                        ? ledger.categories
                        : ledger.incomeCategories)
                    .last,
          info: EntryInfo(
            group: ledger.groups.contains(account.group)
                ? account.group!
                : ledger.groups.first,
          ),
          memo: row.title,
        ),
      );
    }
    return result;
  }
}

Statement decodeStatement(List<int> bytes) {
  if (bytes.length > 5 * 1024 * 1024) {
    throw const FormatException('CSVは5MB以下で選んでください。');
  }
  String text;
  try {
    text = utf8.decode(bytes);
  } on FormatException {
    text = const ShiftJISDecoder().convert(bytes);
  }
  return parseStatement(text);
}

bool _startsWith(List<String> cells, List<String> expected) =>
    cells.length >= expected.length &&
    expected.indexed.every((pair) => cells[pair.$1] == pair.$2);

String _normalize(String value) => value.trim().replaceAllMapped(
  RegExp(r'[！-～]'),
  (m) => String.fromCharCode(m[0]!.codeUnitAt(0) - 0xfee0),
);

Statement parseStatement(String text) {
  final rows =
      const CsvToListConverter(
            shouldParseNumbers: false,
            allowInvalid: false,
            eol: '\n',
          )
          .convert(
            text
                .replaceFirst(RegExp(r'^\uFEFF'), '')
                .replaceAll('\r\n', '\n')
                .replaceAll('\r', '\n'),
          )
          .map((row) => row.map((cell) => cell.toString().trim()).toList())
          .where((row) => row.any((cell) => cell.isNotEmpty))
          .toList();
  if (rows.isEmpty || rows.length > 10001) {
    throw const FormatException('取引は10,000件以下のCSVで選んでください。');
  }
  final head = rows.first.map(_normalize).toList();
  final format = switch (head.length) {
    7 when _startsWith(head, _smbc) => StatementFormat.smbc,
    7 when _startsWith(head, _monemy) => StatementFormat.monemy,
    12 when _startsWith(head, _paypay) => StatementFormat.paypay,
    11
        when _startsWith(head, _rakuten) &&
            RegExp(r'^\d{1,2}月支払金額$').hasMatch(head[7]) &&
            head[8] == '当月請求額' &&
            RegExp(r'^\d{1,2}月繰越残高$').hasMatch(head[9]) &&
            head[10] == '新規サイン' =>
      StatementFormat.rakuten,
    _ => throw const FormatException('対応している銀行・楽天カード・Monemyの明細CSVを選んでください。'),
  };

  final result = <StatementRow>[];
  final occurrences = <String, int>{};
  final fingerprints = <String, String>{};
  var skipped = 0;
  for (final (index, row) in rows.skip(1).indexed) {
    try {
      if (row.length != head.length) throw const FormatException('列数が一致しません。');
      late final DateTime date;
      late final int value;
      late final EntryKind kind;
      late final String title;
      late final List<Object> identity;
      var category = '';
      if (format == StatementFormat.monemy) {
        date = _date(row[0].split(RegExp('[-/]')));
        if (row[1] != '収入' && row[1] != '支出') {
          throw const FormatException('収入・支出を確認してください。');
        }
        kind = row[1] == '収入' ? EntryKind.income : EntryKind.expense;
        final income = kind == EntryKind.income;
        if (row[income ? 4 : 3].isNotEmpty) {
          throw const FormatException('反対側の金額欄は空欄にしてください。');
        }
        value = _integer(row[income ? 3 : 4]);
        if (value <= 0) throw const FormatException('金額は1円以上で入力してください。');
        category = row[2].isEmpty ? '未分類' : row[2];
        title = [row[5], row[6]].where((part) => part.isNotEmpty).join('\n');
        identity = [
          date.toIso8601String(),
          kind.name,
          row[2],
          value,
          row[5],
          row[6],
        ];
      } else if (format == StatementFormat.rakuten) {
        if (row[0].isEmpty &&
            row[1].startsWith('現地利用額') &&
            row.skip(2).every((v) => v.isEmpty)) {
          skipped++;
          continue;
        }
        date = _date(row[0].split('/'));
        final amount = _integer(row[4]);
        final fee = _integer(row[5], emptyAsZero: true);
        if (amount <= 0 ||
            fee != 0 ||
            !RegExp(r'^(?:1回払(?:い)?|一括(?:払(?:い)?)?)$')
                .hasMatch(_normalize(row[3]))) {
          skipped++;
          continue;
        }
        value = amount;
        kind = EntryKind.expense;
        title = row[1];
        identity = [date.toIso8601String(), title, row[2], value];
      } else {
        final paypay = format == StatementFormat.paypay;
        date = _date(paypay ? row.take(3).toList() : row[0].split('/'));
        final out = _integer(row[paypay ? 8 : 1], emptyAsZero: true);
        final incoming = _integer(row[paypay ? 9 : 2], emptyAsZero: true);
        final balance = _integer(row[paypay ? 10 : 4]);
        if (out < 0 || incoming < 0 || (out > 0 && incoming > 0)) {
          throw const FormatException('入出金額を確認してください。');
        }
        if (out == 0 && incoming == 0) {
          skipped++;
          continue;
        }
        kind = out > 0 ? EntryKind.expense : EntryKind.income;
        value = out + incoming;
        title = row[paypay ? 7 : 3];
        if (paypay) {
          final time = [
            _time(row[3], 23),
            _time(row[4], 59),
            _time(row[5], 59),
          ];
          if (!RegExp(r'^\d+$').hasMatch(row[6])) {
            throw const FormatException('取引順番号を確認してください。');
          }
          identity = [date.toIso8601String(), ...time, row[6]];
          final key = jsonEncode(identity);
          final details = jsonEncode([kind.name, value, balance, title]);
          if (fingerprints[key] case final previous?) {
            if (previous != details) {
              throw const FormatException('同じ時刻・取引順番号の内容が一致しません。');
            }
            skipped++;
            continue;
          }
          fingerprints[key] = details;
        } else {
          identity = [date.toIso8601String(), kind.name, value, balance, title];
        }
      }
      if (value > maxAmount) throw const FormatException('金額が上限を超えています。');
      final identityHash = sha256
          .convert(utf8.encode(jsonEncode(identity)))
          .toString();
      final ordinal = occurrences.update(
        identityHash,
        (value) => value + 1,
        ifAbsent: () => 1,
      );
      result.add(
        StatementRow(
          '${identityHash}_$ordinal',
          date,
          kind,
          value,
          title.isEmpty ? '${format.label}明細' : title,
          category,
        ),
      );
    } on FormatException catch (error) {
      throw FormatException('${index + 2}行目　${error.message}');
    }
  }
  if (result.isEmpty) throw const FormatException('取り込める取引がありません。');
  return Statement(format, result, skipped);
}

DateTime _date(List<String> parts) {
  if (parts.length != 3) throw const FormatException('日付を確認してください。');
  final year = int.tryParse(_normalize(parts[0]));
  final month = int.tryParse(_normalize(parts[1]));
  final day = int.tryParse(_normalize(parts[2]));
  if (year == null ||
      month == null ||
      day == null ||
      year < 1900 ||
      year > 2199) {
    throw const FormatException('日付を確認してください。');
  }
  final date = DateTime(year, month, day);
  if (date.month != month || date.day != day) {
    throw const FormatException('日付を確認してください。');
  }
  return date;
}

int _integer(String raw, {bool emptyAsZero = false}) {
  final text = _normalize(raw).replaceAll(',', '');
  if (text.isEmpty && emptyAsZero) return 0;
  final parsed = int.tryParse(text);
  if (parsed == null) throw const FormatException('金額を確認してください。');
  return parsed;
}

String _time(String raw, int end) {
  final number = int.tryParse(raw);
  if (number == null || number < 0 || number > end) {
    throw const FormatException('取引時刻を確認してください。');
  }
  return number.toString().padLeft(2, '0');
}
