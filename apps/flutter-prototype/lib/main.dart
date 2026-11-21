import 'dart:convert';

import 'package:file_selector/file_selector.dart';
import 'package:flutter/foundation.dart'
    show kIsWeb, defaultTargetPlatform, TargetPlatform;
import 'package:flutter/services.dart';
import 'package:local_auth/local_auth.dart';
import 'package:share_plus/share_plus.dart' hide XFile;
import 'package:intl/intl.dart';
import 'package:material_ui/material_ui.dart';

import 'expo_backup.dart';
import 'ledger.dart';
import 'statement_import.dart';

part 'home.dart';
part 'transactions.dart';
part 'overview.dart';
part 'settings.dart';
part 'statement_screen.dart';
part 'book_screens.dart';
part 'plan_screens.dart';
part 'card_screen.dart';
part 'launcher_screen.dart';
part 'guide_screen.dart';

void main() => runApp(ManeApp(storage: DeviceLedgerStorage()));

final _yen = NumberFormat.decimalPattern('ja_JP');
String yen(int n) => '${n < 0 ? '−' : ''}¥${_yen.format(n.abs())}';
String monthLabel(DateTime month) => '${month.year}年${month.month}月';
String dayLabel(DateTime date) => DateFormat.MMMEd('ja_JP').format(date);
int? parseAmount(String text) => int.tryParse(
  text
      .trim()
      .replaceAllMapped(
        RegExp(r'[０-９]'),
        (match) => String.fromCharCode(match[0]!.codeUnitAt(0) - 0xfee0),
      )
      .replaceAll(RegExp('[,，]'), ''),
);
const _figures = [FontFeature.tabularFigures()];
const _tabs = [
  ('ホーム', Icons.home_rounded),
  ('取引', Icons.receipt_long_rounded),
  ('分析', Icons.bar_chart_rounded),
  ('口座', Icons.account_balance_wallet_outlined),
];

extension Palette on BuildContext {
  ColorScheme get colors => Theme.of(this).colorScheme;
  TextTheme get type => Theme.of(this).textTheme;
  bool get dark => Theme.of(this).brightness == Brightness.dark;
  Color get income => dark ? const Color(0xff92d8b5) : const Color(0xff216947);
  Color get expense => dark ? const Color(0xffffb6a9) : const Color(0xffa64034);
}

class ManeApp extends StatefulWidget {
  const ManeApp({super.key, required this.storage});
  final LedgerStorage storage;
  @override
  State<ManeApp> createState() => _ManeAppState();
}

class _ManeAppState extends State<ManeApp> with WidgetsBindingObserver {
  Ledger? _ledger;
  bool _busy = false;
  bool _loadFailed = false;
  String? _launcherId;
  bool _locked = false;
  bool _showGuide = false;
  bool _authenticating = false;
  bool _authFailed = false;

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if ((_ledger?.appLock ?? false) &&
        _mobile &&
        !_authenticating &&
        state == AppLifecycleState.paused) {
      FocusManager.instance.primaryFocus?.unfocus();
      setState(() {
        _locked = true;
        _authFailed = false;
      });
    }
  }

  Future<void> unlock() async {
    if (_authenticating) return;
    setState(() {
      _authenticating = true;
      _authFailed = false;
    });
    final ok = await verifyDevice('家計簿を開くために認証してください。');
    if (mounted) {
      setState(() {
        _authenticating = false;
        _locked = !ok;
        _authFailed = !ok;
      });
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  final _messenger = GlobalKey<ScaffoldMessengerState>();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
    launcherSelection().then((id) {
      if (mounted && id != null) setState(() => _launcherId = id);
    });
  }

  Future<void> _load() async {
    if (_loadFailed) setState(() => _loadFailed = false);
    try {
      final ledger = await widget.storage.load();
      if (mounted) {
        setState(() {
          _ledger = ledger;
          _locked = _mobile && ledger.appLock;
          _showGuide = !_locked && !ledger.guideSeen && ledger.entries.isEmpty;
        });
      }
    } on Object {
      if (mounted) setState(() => _loadFailed = true);
    }
  }

  Future<bool> _save(Ledger ledger) async {
    if (_busy) return false;
    setState(() => _busy = true);
    try {
      await widget.storage.save(ledger);
      if (mounted) setState(() => _ledger = ledger);
      return true;
    } on Exception {
      _messenger.currentState?.showSnackBar(
        const SnackBar(content: Text('保存できませんでした。もう一度お試しください。')),
      );
      return false;
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void finishGuide() {
    final ledger = _ledger;
    if (!_showGuide || ledger == null) return;
    setState(() => _showGuide = false);
    _save(ledger.copyWith(guideSeen: true));
  }

  ThemeData _theme(Brightness brightness) {
    final dark = brightness == Brightness.dark;
    final colors = ColorScheme.fromSeed(
      seedColor: const Color(0xff2f6860),
      brightness: brightness,
      surface: dark ? const Color(0xff171e21) : const Color(0xfffaf8f3),
      surfaceContainerLowest: dark
          ? const Color(0xff171e21)
          : const Color(0xfffaf8f3),
      surfaceContainerLow: dark
          ? const Color(0xff20282b)
          : const Color(0xfff3f1eb),
    );
    return ThemeData(
      colorScheme: colors,
      scaffoldBackgroundColor: colors.surface,
      splashFactory: _ledger?.reduceMotion == true
          ? NoSplash.splashFactory
          : null,
      appBarTheme: AppBarTheme(
        backgroundColor: colors.surface,
        surfaceTintColor: Colors.transparent,
      ),
      dividerTheme: DividerThemeData(
        color: colors.outlineVariant.withValues(alpha: .62),
        space: 1,
      ),
      snackBarTheme: const SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
      ),
      inputDecorationTheme: InputDecorationTheme(
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'マネーちゃん',
    debugShowCheckedModeBanner: false,
    scaffoldMessengerKey: _messenger,
    locale: const Locale('ja'),
    localizationsDelegates: GlobalMaterialLocalizations.delegates,
    supportedLocales: const [Locale('ja')],
    builder: (context, navigator) {
      final media = MediaQuery.of(context);
      return MediaQuery(
        data: _ledger?.reduceMotion == true
            ? media.copyWith(disableAnimations: true)
            : media,
        child: Stack(
          fit: StackFit.expand,
          children: [
            Offstage(offstage: _locked, child: navigator),
            if (_locked)
              Positioned.fill(
                child: Scaffold(
                  body: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Image(
                          image: AssetImage('assets/mane-start.png'),
                          width: 84,
                          height: 84,
                        ),
                        const SizedBox(height: 16),
                        Text('マネーちゃん', style: context.type.headlineSmall),
                        const SizedBox(height: 16),
                        FilledButton(
                          onPressed: _authenticating ? null : unlock,
                          child: Text(_authenticating ? '認証中…' : 'ロックを解除'),
                        ),
                        if (_authFailed) const Text('端末の認証をもう一度お試しください。'),
                      ],
                    ),
                  ),
                ),
              ),
          ],
        ),
      );
    },
    theme: _theme(Brightness.light),
    darkTheme: _theme(Brightness.dark),
    themeMode: switch (_ledger?.theme) {
      'light' => ThemeMode.light,
      'dark' => ThemeMode.dark,
      _ => ThemeMode.system,
    },
    home: _ledger != null
        ? _showGuide
              ? GettingStarted(onClose: finishGuide)
              : Workspace(ledger: _ledger!, save: _save, busy: _busy)
        : Scaffold(
            body: Center(
              child: _loadFailed
                  ? FilledButton(
                      onPressed: _load,
                      child: const Text('読み込みを再試行'),
                    )
                  : Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Image.asset(
                          launcherAsset(
                            _launcherId ?? 'smile_auto',
                            MediaQuery.platformBrightnessOf(context),
                          ),
                          width: 76,
                          height: 76,
                        ),
                        const SizedBox(height: 12),
                        const Text(
                          'マネーちゃん',
                          style: TextStyle(
                            fontSize: 23,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 18),
                        const CircularProgressIndicator(
                          semanticsLabel: '読み込み中',
                        ),
                      ],
                    ),
            ),
          ),
  );
}

bool get _mobile =>
    !kIsWeb &&
    (defaultTargetPlatform == TargetPlatform.android ||
        defaultTargetPlatform == TargetPlatform.iOS);

Future<bool> verifyDevice(String reason) async {
  try {
    if (!_mobile) return false;
    return await LocalAuthentication().authenticate(
      localizedReason: reason,
      persistAcrossBackgrounding: false,
    );
  } on Exception {
    return false;
  }
}

typedef SaveLedger = Future<bool> Function(Ledger ledger);

class Workspace extends StatefulWidget {
  const Workspace({
    super.key,
    required this.ledger,
    required this.save,
    required this.busy,
  });
  final Ledger ledger;
  final SaveLedger save;
  final bool busy;
  @override
  State<Workspace> createState() => _WorkspaceState();
}

class _WorkspaceState extends State<Workspace> {
  var tab = 0;
  var month = monthOf(DateTime.now());
  var openingEditor = false;
  final _scroll = ScrollController();
  DateTimeRange? period;
  String query = '';
  EntryKind? filter;
  bool calendar = false;
  DateTime? selectedDay;
  String? group;
  String? get selectedGroup => ledger.groups.contains(group) ? group : null;
  Ledger get ledger => widget.ledger;

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  void selectTab(int next) {
    if (tab == next) return;
    if (ledger.haptics) {
      HapticFeedback.selectionClick().catchError((Object _) {});
    }
    if (_scroll.hasClients) _scroll.jumpTo(0);
    setState(() {
      month = monthOf(DateTime.now());
      period = null;
      query = '';
      filter = null;
      selectedDay = null;
      tab = next;
    });
  }

  Future<void> edit([Entry? entry]) async {
    if (widget.busy || openingEditor) return;
    openingEditor = true;
    if (ledger.haptics) HapticFeedback.lightImpact().catchError((Object _) {});
    try {
      final result = await Navigator.of(context).push<DateTime>(
        MaterialPageRoute(
          builder: (_) => EntryEditor(
            ledger: ledger,
            initial: entry,
            initialGroup: selectedGroup,
            save: (value) => widget.save(ledger.withEntry(value)),
            delete: entry == null
                ? null
                : () => widget.save(ledger.withoutEntry(entry.id)),
          ),
        ),
      );
      if (!mounted || result == null) return;
      final saved = result.year != 1;
      if (saved) {
        setState(() {
          month = monthOf(result);
          period = null;
        });
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(saved ? '取引を保存しました' : '取引を削除しました')),
      );
    } finally {
      openingEditor = false;
    }
  }

  Future<void> openSettings() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => SettingsScreen(ledger: ledger, save: widget.save),
      ),
    );
  }

  Future<void> openGoals() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => GoalsScreen(ledger: ledger, save: widget.save),
      ),
    );
  }

  Future<void> openSearch() async {
    final result =
        await showModalBottomSheet<({String query, DateTimeRange? period})>(
          context: context,
          isScrollControlled: true,
          showDragHandle: true,
          builder: (_) => SearchSheet(query: query, period: period),
        );
    if (mounted && result != null) {
      setState(() {
        query = result.query;
        period = result.period;
        selectedDay = null;
        if (period != null) calendar = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final title = tab == 0 ? 'マネーちゃん' : _tabs[tab].$1;
    final header = PeriodBar(
      month: month,
      groups: ledger.groups,
      group: selectedGroup,
      onGroup: (value) => setState(() => group = value),
      onMonth: (date) => setState(() {
        month = date;
        period = null;
        selectedDay = null;
      }),
    );
    final body = switch (tab) {
      0 => HomeContent(
        ledger: ledger,
        month: month,
        group: selectedGroup,
        period: header,
        toggleBalance: widget.busy
            ? null
            : () => widget.save(
                ledger.copyWith(hideBalance: !ledger.hideBalance),
              ),
        onTransactions: () => selectTab(1),
        onGoals: openGoals,
        onAccounts: () => selectTab(3),
        onEdit: edit,
        onSettings: openSettings,
      ),
      1 => TransactionsContent(
        ledger: ledger,
        controller: _scroll,
        calendar: calendar,
        selectedDay: selectedDay,
        selectDay: (value) => setState(() => selectedDay = value),
        month: month,
        group: selectedGroup,
        periodBar: header,
        period: period,
        query: query,
        kind: filter,
        onKind: (value) => setState(() => filter = value),
        onSearch: openSearch,
        onEdit: edit,
      ),
      2 => AnalyticsContent(
        onEdit: edit,
        ledger: ledger,
        month: month,
        group: selectedGroup,
        period: header,
      ),
      _ => AccountsContent(
        ledger: ledger,
        save: widget.save,
        goals: openGoals,
        onEdit: edit,
      ),
    };
    return Scaffold(
      appBar: AppBar(
        title: Text(
          title,
          style: TextStyle(
            fontWeight: FontWeight.w800,
            letterSpacing: tab == 0 ? -.7 : -.3,
          ),
        ),
        actions: [
          if (tab == 1) ...[
            IconButton(
              tooltip: calendar ? '一覧表示' : 'カレンダー表示',
              icon: Icon(
                calendar
                    ? Icons.view_list_outlined
                    : Icons.calendar_month_outlined,
              ),
              onPressed: () => setState(() {
                calendar = !calendar;
                selectedDay = null;
                if (calendar) period = null;
              }),
            ),
            IconButton(
              tooltip: '取引を検索',
              icon: const Icon(Icons.search_rounded),
              onPressed: openSearch,
            ),
          ] else
            IconButton(
              tooltip: '設定',
              icon: const Icon(Icons.settings_outlined),
              onPressed: widget.busy ? null : openSettings,
            ),
          const SizedBox(width: 6),
        ],
      ),
      body: tab == 1
          ? body
          : CustomScrollView(
              controller: _scroll,
              slivers: [
                SliverToBoxAdapter(
                  child: Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 680),
                      child: body,
                    ),
                  ),
                ),
              ],
            ),
      bottomNavigationBar: SafeArea(
        top: false,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: context.colors.surfaceContainerLow,
            border: Border(
              top: BorderSide(
                color: context.colors.outlineVariant.withValues(alpha: .55),
              ),
            ),
          ),
          child: SizedBox(
            height: 74,
            child: Row(
              children: [
                nav(0),
                nav(1),
                SizedBox(
                  width: 64,
                  child: Center(
                    child: FilledButton(
                      onPressed: widget.busy ? null : () => edit(),
                      style: FilledButton.styleFrom(
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(19),
                        ),
                        padding: EdgeInsets.zero,
                        minimumSize: const Size(52, 52),
                      ),
                      child: const Tooltip(
                        message: '取引を記録',
                        child: Icon(Icons.add_rounded, size: 29),
                      ),
                    ),
                  ),
                ),
                nav(2),
                nav(3),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget nav(int index) {
    final (label, icon) = _tabs[index];
    final selected = tab == index;
    final colors = context.colors;
    return Expanded(
      child: Semantics(
        selected: selected,
        button: true,
        child: InkWell(
          onTap: () => selectTab(index),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              AnimatedContainer(
                duration: MediaQuery.disableAnimationsOf(context)
                    ? Duration.zero
                    : const Duration(milliseconds: 140),
                width: 49,
                height: 30,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(20),
                  color: selected
                      ? colors.secondaryContainer
                      : Colors.transparent,
                ),
                child: Icon(
                  icon,
                  size: 21,
                  color: selected
                      ? colors.onSecondaryContainer
                      : colors.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                label,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class PeriodBar extends StatelessWidget {
  const PeriodBar({
    super.key,
    required this.month,
    required this.onMonth,
    required this.groups,
    required this.group,
    required this.onGroup,
  });
  final DateTime month;
  final ValueChanged<DateTime> onMonth;
  final List<String> groups;
  final String? group;
  final ValueChanged<String?> onGroup;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Expanded(
        child: Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () async {
              final chosen = await showModalBottomSheet<DateTime>(
                context: context,
                showDragHandle: true,
                builder: (_) => MonthSheet(month: month),
              );
              if (chosen != null) onMonth(monthOf(chosen));
            },
            icon: const Icon(Icons.calendar_month_outlined, size: 18),
            label: Text(
              monthLabel(month),
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
        ),
      ),
      if (groups.isNotEmpty)
        PopupMenuButton<String>(
          tooltip: '家計グループ',
          onSelected: (value) => onGroup(value.isEmpty ? null : value),
          itemBuilder: (context) => [
            const PopupMenuItem(value: '', child: Text('すべてのグループ')),
            for (final name in groups)
              CheckedPopupMenuItem(
                value: name,
                checked: group == name,
                child: Text(name),
              ),
          ],
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(group ?? 'すべて', style: context.type.labelMedium),
                const Icon(Icons.expand_more, size: 16),
              ],
            ),
          ),
        ),
      IconButton(
        tooltip: '前の月',
        onPressed: month.year <= 1900 && month.month == 1
            ? null
            : () => onMonth(moveMonth(month, -1)),
        icon: const Icon(Icons.chevron_left_rounded),
      ),
      IconButton(
        tooltip: '次の月',
        onPressed: month.year >= 2199 && month.month == 12
            ? null
            : () => onMonth(moveMonth(month, 1)),
        icon: const Icon(Icons.chevron_right_rounded),
      ),
    ],
  );
}

class MonthSheet extends StatefulWidget {
  const MonthSheet({super.key, required this.month});
  final DateTime month;
  @override
  State<MonthSheet> createState() => _MonthSheetState();
}

class _MonthSheetState extends State<MonthSheet> {
  late int year = widget.month.year;

  @override
  Widget build(BuildContext context) => SafeArea(
    top: false,
    child: Padding(
      padding: const EdgeInsets.fromLTRB(24, 0, 24, 22),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              IconButton(
                tooltip: '前年',
                icon: const Icon(Icons.chevron_left),
                onPressed: year > 1900 ? () => setState(() => year--) : null,
              ),
              Expanded(
                child: Text(
                  '$year年',
                  textAlign: TextAlign.center,
                  style: context.type.titleLarge,
                ),
              ),
              IconButton(
                tooltip: '翌年',
                icon: const Icon(Icons.chevron_right),
                onPressed: year < 2199 ? () => setState(() => year++) : null,
              ),
            ],
          ),
          for (var row = 0; row < 4; row++)
            Row(
              children: [
                for (var column = 1; column <= 3; column++)
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.all(3),
                      child: TextButton(
                        style:
                            widget.month.year == year &&
                                widget.month.month == row * 3 + column
                            ? TextButton.styleFrom(
                                backgroundColor:
                                    context.colors.secondaryContainer,
                              )
                            : null,
                        onPressed: () => Navigator.pop(
                          context,
                          DateTime(year, row * 3 + column),
                        ),
                        child: Text('${row * 3 + column}月'),
                      ),
                    ),
                  ),
              ],
            ),
          TextButton(
            onPressed: () => Navigator.pop(context, monthOf(DateTime.now())),
            child: const Text('今月に戻る'),
          ),
        ],
      ),
    ),
  );
}

int sumKind(Iterable<Entry> entries, EntryKind kind) => entries
    .where((e) => e.kind == kind && e.countsInSummary)
    .fold(0, (sum, e) => sum + (kind == EntryKind.expense ? e.paid : e.inflow));

Future<bool> confirm(
  BuildContext context,
  String title,
  String detail,
  String action,
) async =>
    await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text(title),
        content: Text(detail),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialog, false),
            child: const Text('キャンセル'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialog, true),
            child: Text(action),
          ),
        ],
      ),
    ) ??
    false;

class SectionHeading extends StatelessWidget {
  const SectionHeading(this.title, {super.key, this.action, this.onTap});
  final String title;
  final String? action;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => Row(
    children: [
      Expanded(
        child: Text(
          title,
          style: context.type.titleMedium?.copyWith(
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
      if (action != null) TextButton(onPressed: onTap, child: Text(action!)),
    ],
  );
}

class PageInset extends StatelessWidget {
  const PageInset({super.key, required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) =>
      Padding(padding: const EdgeInsets.fromLTRB(24, 12, 24, 24), child: child);
}

class Money extends StatelessWidget {
  const Money(
    this.amount, {
    super.key,
    this.color,
    this.size,
    this.plus = false,
  });
  final int amount;
  final Color? color;
  final double? size;
  final bool plus;
  @override
  Widget build(BuildContext context) => Text(
    '${plus && amount > 0 ? '+' : ''}${yen(amount)}',
    textAlign: TextAlign.end,
    style: TextStyle(
      color: color,
      fontWeight: FontWeight.w700,
      fontSize: size,
      fontFeatures: _figures,
    ),
  );
}
