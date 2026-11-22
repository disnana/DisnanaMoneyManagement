// Run from the Flutter prototype with the fixture directory passed via --dart-define.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mane_chan_prototype/expo_backup.dart';
import 'package:mane_chan_prototype/ledger.dart';
import 'package:mane_chan_prototype/main.dart';
import 'package:material_ui/material_ui.dart';

void main() {
  const fixtureDirectory = String.fromEnvironment('HISTORY_FIXTURE_DIR');
  if (fixtureDirectory.isEmpty) {
    throw StateError(
      'Specify the directory containing 0.json through 10000.json with --dart-define=HISTORY_FIXTURE_DIR=...',
    );
  }
  final month = DateTime(2026, 11);
  setUpAll(() => initializeDateFormatting('ja_JP'));

  for (final count in [0, 5, 50, 1000, 10000]) {
    final raw = jsonDecode(
      File('$fixtureDirectory/$count.json').readAsStringSync(),
    ) as Map<String, dynamic>;
    final ledger = readBackup(raw);
    testWidgets('browse $count shared November records', (tester) async {
      final controller = ScrollController();
      addTearDown(controller.dispose);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetPhysicalSize);
      Entry? opened;

      final entries = ledger.monthEntries(month);
      expect(entries, hasLength(count));
      final income = sumKind(entries, EntryKind.income);
      final expense = sumKind(entries, EntryKind.expense);
      int dailyNet(int day) {
        final daily = entries.where((e) => e.date.day == day);
        return sumKind(daily, EntryKind.income) -
            sumKind(daily, EntryKind.expense);
      }

      Future<void> show(
        double width,
        double scale,
        Brightness brightness, {
        EntryKind? kind,
        String query = '',
      }) async {
        tester.view.physicalSize = Size(width, 830);
        await tester.pumpWidget(
          MaterialApp(
            theme: ThemeData(brightness: brightness),
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context)
                  .copyWith(textScaler: TextScaler.linear(scale)),
              child: child!,
            ),
            home: Scaffold(
              body: TransactionsContent(
                ledger: ledger,
                month: month,
                period: null,
                periodBar: const Text('2026年11月'),
                kind: kind,
                onKind: (_) {},
                query: query,
                onSearch: () {},
                onEdit: (entry) => opened = entry,
                calendar: false,
                selectDay: (_) {},
                selectedDay: null,
                controller: controller,
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(
          tester.takeException(),
          isNull,
          reason: '$count records at $width, $brightness, scale $scale',
        );
      }

      for (final width in [360.0, 393.0, 600.0]) {
        for (final brightness in Brightness.values) {
          for (final scale in [1.0, 1.5]) {
            await show(width, scale, brightness);
            if (count == 0) {
              expect(find.text('該当する取引はありません。'), findsOneWidget);
            } else {
              expect(find.text('青葉ベーカリー'), findsOneWidget);
              if (count > 5)
                expect(
                  find.byType(EntryRow).evaluate().length,
                  lessThan(count),
                );
            }
          }
        }
      }

      await show(393, 1, Brightness.light);
      final mountedRows = find.byType(EntryRow).evaluate().length;
      if (count > 0) {
        await tester.tap(find.text('青葉ベーカリー'));
        await tester.pumpAndSettle();
        expect(opened?.id, 'preview-0');
      }
      if (count > 5) {
        final initial = controller.offset;
        await tester.fling(find.byType(ListView), const Offset(0, -450), 650);
        await tester.pumpAndSettle();
        expect(controller.offset, greaterThan(initial));
        controller.jumpTo(0);
        await tester.pumpAndSettle();
      }
      if (count == 5) {
        expect(find.text('−¥1,080'), findsOneWidget);
        await show(393, 1, Brightness.light, kind: EntryKind.transfer);
        expect(find.text('財布へ現金を移動'), findsOneWidget);
        expect(find.text('青葉ベーカリー'), findsNothing);
        await show(393, 1, Brightness.light, query: 'ベーカリー');
        expect(find.byType(EntryRow), findsOneWidget);
      }
      print(
        'count=$count mounted=$mountedRows income=$income expense=$expense net=${income - expense} '
        'day22=${dailyNet(22)} day21=${dailyNet(21)} accounts=${ledger.balances}',
      );
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }
}
