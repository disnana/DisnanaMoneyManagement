import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mane_chan_prototype/ledger.dart';
import 'package:mane_chan_prototype/main.dart';

class TestStorage implements LedgerStorage {
  Ledger ledger = Ledger(sampleMonth: DateTime.now());
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
  testWidgets('validates the amount and returns home after a successful save', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1080, 2424);
    tester.view.devicePixelRatio = 2.625;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final storage = TestStorage();
    await tester.pumpWidget(ManeApp(storage: storage));
    await tester.pumpAndSettle();

    expect(find.text('¥4,125,921'), findsOneWidget);
    await tester.tap(find.text('支出を記録'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('支出を登録'));
    await tester.pumpAndSettle();
    expect(find.text('1〜999,999,999円で入力してください'), findsOneWidget);
    expect(storage.ledger.expenses, isEmpty);

    await tester.enterText(find.byType(TextFormField), '１２８０');
    storage.failNextSave = true;
    await tester.tap(find.text('支出を登録'));
    await tester.pumpAndSettle();
    expect(find.text('支出を登録'), findsOneWidget);
    expect(storage.ledger.expenses, isEmpty);

    await tester.tap(find.text('支出を登録'));
    await tester.pumpAndSettle();
    expect(find.text('¥4,124,641'), findsOneWidget);
    expect(storage.ledger.expenses.single.amount, 1280);
    expect(storage.ledger.spending(DateTime.now()), 164088);
  });

  testWidgets('hides the amount and saves the privacy setting', (tester) async {
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
