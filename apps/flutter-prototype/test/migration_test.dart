import 'dart:convert';

import 'package:charset/charset.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mane_chan_prototype/expo_backup.dart';
import 'package:mane_chan_prototype/ledger.dart';
import 'package:mane_chan_prototype/main.dart';
import 'package:mane_chan_prototype/statement_import.dart';

void main() {
  test(
    'Expo backup preserves balances, accounting fields, and monthly payments',
    () {
      final ledger = readBackup({
        'format': 'dmm-finance-backup',
        'version': 1,
        'state': {
          'ledgers': [
            {'id': 'business', 'name': '仕事', 'kind': 'business'},
          ],
          'accounts': [
            {
              'id': 'bank',
              'name': '銀行',
              'type': 'bank',
              'initialBalance': 20000,
            },
            {
              'id': 'visa',
              'name': 'カード',
              'type': 'credit',
              'initialBalance': 0,
              'closingDay': 15,
              'paymentDay': 10,
              'linkedBankAccountId': 'bank',
              'creditLimit': 100000,
            },
            {
              'id': 'debit',
              'name': 'デビット',
              'type': 'debit',
              'initialBalance': 0,
              'linkedBankAccountId': 'bank',
            },
          ],
          'transactions': [
            {
              'id': 'charge',
              'type': 'expense',
              'amount': 5000,
              'pointUsed': 100,
              'date': '2026-10-15',
              'categoryId': 'food',
              'accountId': 'visa',
              'title': '食料品',
              'ledgerId': 'business',
              'scope': 'business',
              'businessRatio': 35,
              'accountingSubject': '会議費',
            },
            {
              'id': 'payment',
              'type': 'transfer',
              'amount': 3000,
              'pointUsed': 500,
              'transferFee': 100,
              'date': '2026-11-10',
              'targetBillingMonth': '2026-11',
              'accountId': 'bank',
              'toAccountId': 'visa',
              'title': 'カードの支払い',
            },
            {
              'id': 'debit-charge',
              'type': 'expense',
              'amount': 700,
              'date': '2026-10-20',
              'categoryId': 'food',
              'accountId': 'debit',
              'title': 'デビット利用',
            },
          ],
          'savingsGoals': [
            {
              'id': 'goal',
              'title': '旅行',
              'targetAmount': 12000,
              'currentAmount': 2500,
              'targetDate': '2027-01-01',
              'monthlyContribution': 1000,
            },
          ],
        },
      });
      expect(ledger.balances, {'bank': 16700, 'visa': -1900, 'debit': 0});
      final statement = ledger.statement(
        ledger.findAccount('visa'),
        DateTime(2026, 11),
      );
      expect(
        (statement.total, statement.paid, statement.remaining),
        (4900, 3000, 1900),
      );
      expect(
        ledger.monthEntries(DateTime(2026, 10), group: '仕事').single.info.ratio,
        35,
      );
      expect(ledger.goals.single.monthly, 1000);
    },
  );

  test('advances move real balances but neither payment nor recovery affects monthly cash flow', () {
    final date = DateTime(2026, 11, 21);
    final expense = Entry(
      id: 'advance',
      kind: EntryKind.expense,
      date: date,
      amount: 1000,
      account: 'bank',
      category: '食費',
      info: const EntryInfo(advance: '友人'),
    );
    final ledger = Ledger.empty().withEntry(expense);
    expect(ledger.balance, -1000);
    expect(sumKind(ledger.monthEntries(date), EntryKind.expense), 0);
    final settled = ledger.reimburse(expense, ledger.findAccount('cash'), date);
    expect(settled.balance, 0);
    expect(sumKind(settled.monthEntries(date), EntryKind.income), 0);
    expect(settled.withoutEntry(expense.id).entries, isEmpty);
    expect(
      settled.reimburse(expense, ledger.findAccount('cash'), date),
      same(settled),
    );
  });

  test(
    'recurring entry clamps 31 to the end of a short month and is idempotent',
    () {
      final ledger = Ledger.empty().copyWith(
        recurrences: [
          const Recurrence(
            'rent',
            '家賃',
            1500,
            EntryKind.expense,
            'bank',
            '住居費',
            31,
            '個人',
          ),
        ],
      );
      final reference = DateTime(2027, 2, 1);
      final entry = ledger.newRecurringEntries(reference).single;
      expect(entry.date, DateTime(2027, 2, 28));
      expect(ledger.withEntry(entry).newRecurringEntries(reference), isEmpty);
    },
  );

  test('Shift-JIS SMBC and UTF-8 PayPay imports preserve amounts and can be safely repeated', () {
    final bank = Ledger.empty().findAccount('bank');
    const smbc =
        '年月日,お引出し,お預入れ,お取り扱い内容,残高,メモ,ラベル\r\n'
        '2026/11/11,"1,250",,食料品,1000,,\r\n';
    final smbcStatement = decodeStatement(
      const ShiftJISEncoder().convert(smbc),
    );
    expect(smbcStatement.format, StatementFormat.smbc);
    expect(smbcStatement.rows.single.amount, 1250);

    const paypay =
        '操作日(年),操作日(月),操作日(日),操作時刻(時),操作時刻(分),操作時刻(秒),取引順番号,摘要,お支払金額,お預り金額,残高,メモ\n'
        '2026,11,11,19,5,32,0000401,コインプラス,290,,156,\n';
    final bankLedger = Ledger.empty();
    final parsed = decodeStatement(utf8.encode(paypay));
    final imported = parsed.newEntries(bankLedger, bank).single;
    expect(imported.amount, 290);
    expect(parsed.newEntries(bankLedger.withEntry(imported), bank), isEmpty);
  });

  test(
    'Rakuten preview counts unsupported instalments, and Monemy keeps category',
    () {
      const rakuten =
          '利用日,利用店名・商品名,利用者,支払方法,利用金額,手数料/利息,支払総額,11月支払金額,当月請求額,12月繰越残高,新規サイン\n'
          '2026/10/10,スーパー,本人,１回払い,500,0,500,500,500,0,\n'
          '2026/10/11,商店,本人,分割,1000,50,1050,500,500,550,\n';
      final card = parseStatement(rakuten);
      expect(card.format, StatementFormat.rakuten);
      expect((card.rows.single.amount, card.skipped), (500, 1));

      const monemy = '日付,区分,項目,収入金額,支出金額,内容,メモ\n2026-11-11,支出,食料品,,500,スーパー,\n';
      final bankLedger = Ledger.empty();
      final entry = parseStatement(monemy)
          .newEntries(bankLedger, bankLedger.findAccount('bank'))
          .single;
      expect((entry.amount, entry.category), (500, '食料品'));
    },
  );
}
