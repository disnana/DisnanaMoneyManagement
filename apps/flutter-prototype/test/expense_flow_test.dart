import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mane_chan_prototype/ledger.dart';
import 'package:mane_chan_prototype/main.dart';
import 'package:material_ui/material_ui.dart';

class TestStorage implements LedgerStorage {
  Ledger ledger = Ledger.empty();
  bool failNextSave = false;

  @override
  Future<Ledger> load() async => ledger;

  @override
  Future<void> save(Ledger newLedger) async {
    if (failNextSave) {
      failNextSave = false;
      throw Exception('Test write failed');
    }
    ledger = newLedger;
  }
}

void main() {
  test(
    'income, expense with points, and transfer have consistent balances',
    () {
      final date = DateTime(2026, 11, 21);
      final received = Entry(
        id: 'income',
        kind: EntryKind.income,
        date: date,
        amount: 3500,
        account: 'bank',
        category: '給与',
      );
      final paid = Entry(
        id: 'expense',
        kind: EntryKind.expense,
        date: date,
        amount: 1200,
        points: 200,
        account: 'bank',
        category: '食費',
      );
      final transferred = Entry(
        id: 'transfer',
        kind: EntryKind.transfer,
        date: date,
        amount: 500,
        account: 'bank',
        destination: 'cash',
      );
      final ledger = Ledger.empty()
          .withEntry(received)
          .withEntry(paid)
          .withEntry(transferred);
      expect(ledger.balances, {'cash': 500, 'bank': 2000});
      expect(ledger.balance, 2500);
      expect(sumKind(ledger.monthEntries(date), EntryKind.expense), 1000);
      final restored = Ledger.fromJson(
        jsonDecode(jsonEncode(ledger)) as Map<String, dynamic>,
      );
      expect(restored.balances, ledger.balances);
      expect(restored.withoutEntry(transferred.id).balances, {
        'cash': 0,
        'bank': 2500,
      });
    },
  );

  test('the previous prototype migrates committed expenses and visibility', () {
    final ledger = Ledger.fromJson({
      'sampleMonth': '2026-11-01T00:00:00.000',
      'expenses': [
        {
          'amount': 1280,
          'date': '2026-11-21T00:00:00.000',
          'category': '食費',
          'account': 'メイン銀行（普通）',
          'memo': '',
        },
      ],
      'hideBalance': true,
    });
    expect(ledger.balance, 4124641);
    expect(ledger.hideBalance, isTrue);
    expect(ledger.entries.singleWhere((e) => e.id == 'legacy-0').amount, 1280);
  });

  testWidgets(
    'validates an amount and keeps the draft open after a failed save',
    (tester) async {
      tester.view.physicalSize = const Size(1080, 2424);
      tester.view.devicePixelRatio = 2.625;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final storage = TestStorage();
      await tester.pumpWidget(ManeApp(storage: storage));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('取引を記録'));
      await tester.pumpAndSettle();

      final submit = find.widgetWithText(FilledButton, '支出を登録');
      await tester.tap(submit);
      await tester.pumpAndSettle();
      expect(find.text('1〜999,999,999円で入力してください'), findsOneWidget);
      expect(storage.ledger.entries, isEmpty);

      await tester.enterText(find.byType(TextFormField).first, '１２８０');
      storage.failNextSave = true;
      await tester.tap(submit);
      await tester.pumpAndSettle();
      expect(submit, findsOneWidget);
      expect(storage.ledger.entries, isEmpty);

      await tester.tap(submit);
      await tester.pumpAndSettle();
      expect(find.text('−¥1,280'), findsWidgets);
      expect(storage.ledger.entries.single.amount, 1280);
      expect(storage.ledger.balance, -1280);
    },
  );

  testWidgets(
    'save an income, find it on the transactions tab, and remove it after confirmation',
    (tester) async {
      final storage = TestStorage();
      await tester.pumpWidget(ManeApp(storage: storage));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('取引を記録'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('収入'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextFormField).first, '2500');
      await tester.tap(find.widgetWithText(FilledButton, '収入を登録'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('取引'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('給与').first);
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('取引を削除'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('キャンセル'));
      await tester.pumpAndSettle();
      expect(storage.ledger.entries.single.amount, 2500);
      await tester.tap(find.byTooltip('取引を削除'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, '削除'));
      await tester.pumpAndSettle();
      expect(storage.ledger.entries, isEmpty);
      expect(find.text('該当する取引はありません。'), findsOneWidget);
    },
  );

  testWidgets('keeps the yen sign when hiding the public total', (
    tester,
  ) async {
    final storage = TestStorage();
    await tester.pumpWidget(ManeApp(storage: storage));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('総資産を非表示'));
    await tester.pumpAndSettle();
    expect(find.text('¥・・・・・・'), findsOneWidget);
    expect(storage.ledger.hideBalance, isTrue);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpWidget(ManeApp(storage: storage));
    await tester.pumpAndSettle();
    expect(find.text('¥・・・・・・'), findsOneWidget);
  });
}
