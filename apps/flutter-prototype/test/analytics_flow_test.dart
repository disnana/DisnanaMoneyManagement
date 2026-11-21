import 'package:flutter_test/flutter_test.dart';
import 'package:mane_chan_prototype/ledger.dart';
import 'package:mane_chan_prototype/main.dart';
import 'package:material_ui/material_ui.dart';

void main() {
  testWidgets('analysis respects filters, points, date boundaries and edits', (
    tester,
  ) async {
    final month = DateTime(2026, 1);
    Entry expense(
      String id,
      DateTime date,
      int amount, {
      String group = '家庭',
    }) => Entry(
      id: id,
      kind: EntryKind.expense,
      date: date,
      amount: amount,
      points: 200,
      account: 'bank',
      category: '食費',
      memo: id,
      info: EntryInfo(group: group),
    );
    final ledger = Ledger.empty().copyWith(
      entries: [
        expense('食料品', month, 1000),
        expense('対象外のグループ', month, 3000, group: '事業'),
        expense('前月の取引', DateTime(2025, 12, 31, 23, 59), 500),
        expense('翌月の取引', DateTime(2026, 2), 700),
        Entry(
          id: 'salary',
          kind: EntryKind.income,
          date: month,
          amount: 5000,
          account: 'bank',
          category: '給与',
          info: const EntryInfo(group: '家庭', withholding: 500),
        ),
      ],
    );

    Entry? edited;
    Future<void> show(Ledger data, {String? group = '家庭'}) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: AnalyticsContent(
                ledger: data,
                month: month,
                group: group,
                period: const SizedBox.shrink(),
                onEdit: (entry) => edited = entry,
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
    }

    await show(ledger);
    expect(find.text('支出合計'), findsOneWidget);
    expect(find.text('¥800'), findsWidgets);
    await tester.ensureVisible(find.text('食費'));
    await tester.tap(find.text('食費'));
    await tester.pumpAndSettle();
    expect(find.text('対象外のグループ'), findsNothing);
    await tester.tap(find.text('食料品'));
    await tester.pumpAndSettle();
    expect(edited?.id, '食料品');

    final incomeSwitch = find.descendant(
      of: find.byType(SegmentedButton<EntryKind>),
      matching: find.text('収入'),
    );
    await tester.ensureVisible(incomeSwitch);
    await tester.tap(incomeSwitch);
    await tester.pumpAndSettle();
    expect(find.text('収入合計'), findsOneWidget);
    expect(find.text('¥4,500'), findsWidgets);

    await tester.ensureVisible(find.text('推移'));
    await tester.tap(find.text('推移'));
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('12月 収入 ¥0 支出 ¥300'), findsOneWidget);

    await show(ledger, group: null);
    expect(find.bySemanticsLabel('1月 収入 ¥4,500 支出 ¥3,600'), findsOneWidget);
    await show(ledger.withoutEntry('食料品'), group: null);
    expect(find.bySemanticsLabel('1月 収入 ¥4,500 支出 ¥2,800'), findsOneWidget);
  });
}
