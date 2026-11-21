part of 'main.dart';

class TransactionsContent extends StatelessWidget {
  const TransactionsContent({
    super.key,
    required this.ledger,
    required this.month,
    this.group,
    required this.periodBar,
    required this.period,
    required this.query,
    required this.kind,
    required this.onKind,
    required this.onSearch,
    required this.onEdit,
    required this.controller,
    required this.calendar,
    required this.selectedDay,
    required this.selectDay,
  });
  final Ledger ledger;
  final DateTime month;
  final String? group;
  final Widget periodBar;
  final DateTimeRange? period;
  final String query;
  final EntryKind? kind;
  final ValueChanged<EntryKind?> onKind;
  final VoidCallback onSearch;
  final ValueChanged<Entry> onEdit;
  final ScrollController controller;
  final bool calendar;
  final DateTime? selectedDay;
  final ValueChanged<DateTime?> selectDay;

  @override
  Widget build(BuildContext context) {
    final range = period;
    final needle = query.toLowerCase();
    final accounts = {for (final a in ledger.accounts) a.id: a.name};
    final entries =
        (range == null
                ? ledger.monthEntries(month, group: group)
                : ledger.entries.where(
                    (e) =>
                        !dayOf(e.date).isBefore(dayOf(range.start)) &&
                        !dayOf(e.date).isAfter(dayOf(range.end)),
                  ))
            .where(
              (e) =>
                  (kind == null || e.kind == kind) &&
                  (group == null || e.info.group == group) &&
                  (needle.isEmpty ||
                      [
                        e.memo,
                        e.category,
                        accounts[e.account] ?? '',
                        if (e.destination != null)
                          accounts[e.destination] ?? '',
                      ].any((value) => value.toLowerCase().contains(needle))),
            )
            .toList()
          ..sort((a, b) => b.date.compareTo(a.date));
    final days = <DateTime, List<Entry>>{};
    for (final entry in entries) {
      days.putIfAbsent(dayOf(entry.date), () => []).add(entry);
    }
    final filteredDays = calendar && selectedDay != null
        ? days.entries.where((day) => day.key == selectedDay)
        : days.entries;
    final heading = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (range == null)
          periodBar
        else
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: onSearch,
              icon: const Icon(Icons.date_range_rounded),
              label: Text(
                range.start.year == 1900 && range.end.year == 2199
                    ? '全期間'
                    : '${DateFormat.yMMMd("ja").format(range.start)} – ${DateFormat.yMMMd("ja").format(range.end)}',
              ),
            ),
          ),
        if (calendar) ...[
          const SizedBox(height: 8),
          CalendarGrid(
            month: month,
            totals: {
              for (final day in days.entries)
                day.key.day:
                    sumKind(day.value, EntryKind.income) -
                    sumKind(day.value, EntryKind.expense),
            },
            selected: selectedDay,
            onDay: selectDay,
          ),
          const SizedBox(height: 10),
        ],
        const SizedBox(height: 8),
        Wrap(
          spacing: 6,
          runSpacing: 4,
          children: [
            for (final option in <EntryKind?>[null, ...EntryKind.values])
              ChoiceChip(
                showCheckmark: false,
                label: Text(option?.label ?? 'すべて'),
                selected: option == kind,
                onSelected: (_) => onKind(option),
              ),
          ],
        ),
        if (query.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text('検索語「$query」', style: context.type.bodySmall),
          ),
        const SizedBox(height: 16),
        if (filteredDays.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 22),
            child: Text('該当する取引はありません。'),
          ),
      ],
    );
    final cells = <Object>[
      heading,
      for (final day in filteredDays) ...[day, ...day.value],
    ];
    return ListView.builder(
      controller: controller,
      padding: const EdgeInsets.fromLTRB(24, 12, 24, 24),
      itemCount: cells.length,
      itemBuilder: (context, index) {
        final cell = cells[index];
        final Widget row;
        if (cell is Entry) {
          row = EntryRow(
            entry: cell,
            ledger: ledger,
            onTap: () => onEdit(cell),
          );
        } else if (cell is MapEntry<DateTime, List<Entry>>) {
          row = Padding(
            padding: EdgeInsets.only(top: index == 1 ? 0 : 14),
            child: ColoredBox(
              color: context.colors.surfaceContainerLow,
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 9,
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        dayLabel(cell.key),
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                    Money(
                      sumKind(cell.value, EntryKind.income) -
                          sumKind(cell.value, EntryKind.expense),
                      plus: true,
                    ),
                  ],
                ),
              ),
            ),
          );
        } else {
          row = heading;
        }
        return Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 632),
            child: SizedBox(width: double.infinity, child: row),
          ),
        );
      },
    );
  }
}

class CalendarGrid extends StatelessWidget {
  const CalendarGrid({
    super.key,
    required this.month,
    required this.totals,
    required this.selected,
    required this.onDay,
  });
  final DateTime month;
  final Map<int, int> totals;
  final DateTime? selected;
  final ValueChanged<DateTime?> onDay;

  @override
  Widget build(BuildContext context) {
    final first = monthOf(month);
    final firstWeekday = first.weekday % 7;
    final count = DateTime(month.year, month.month + 1, 0).day;
    final weeks = ((firstWeekday + count) / 7).ceil();
    final compact = NumberFormat.compact(locale: 'ja');
    return Column(
      children: [
        Row(
          children: [
            for (final weekday in ['日', '月', '火', '水', '木', '金', '土'])
              Expanded(
                child: Text(
                  weekday,
                  style: context.type.labelSmall,
                  textAlign: TextAlign.center,
                ),
              ),
          ],
        ),
        const SizedBox(height: 6),
        for (var row = 0; row < weeks; row++)
          Row(
            children: [
              for (var column = 0; column < 7; column++)
                if (row * 7 + column + 1 - firstWeekday case final day)
                  Expanded(
                    child: day < 1 || day > count
                        ? const SizedBox(height: 45)
                        : dayCell(
                            context,
                            DateTime(first.year, first.month, day),
                            totals[day],
                            compact,
                          ),
                  ),
            ],
          ),
      ],
    );
  }

  Widget dayCell(
    BuildContext context,
    DateTime date,
    int? net,
    NumberFormat compact,
  ) {
    final active = date == selected;
    return Semantics(
      button: true,
      selected: active,
      label: '${dayLabel(date)}${net == null ? '' : ' 収支 ${yen(net)}'}',
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: () => onDay(active ? null : date),
        child: ExcludeSemantics(
          child: Container(
            height: 48,
            decoration: BoxDecoration(
              color: active ? context.colors.secondaryContainer : null,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  '${date.day}',
                  style: context.type.labelMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                if (net != null)
                  Text(
                    '${net > 0
                        ? '+'
                        : net < 0
                        ? '−'
                        : ''}${compact.format(net.abs())}',
                    maxLines: 1,
                    overflow: TextOverflow.clip,
                    style: TextStyle(
                      fontSize: 9,
                      color: net < 0 ? context.expense : context.income,
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class SearchSheet extends StatefulWidget {
  const SearchSheet({super.key, required this.query, required this.period});
  final String query;
  final DateTimeRange? period;
  @override
  State<SearchSheet> createState() => _SearchSheetState();
}

class _SearchSheetState extends State<SearchSheet> {
  late final input = TextEditingController(text: widget.query);
  late DateTimeRange? period = widget.period;

  @override
  void dispose() {
    input.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => SafeArea(
    top: false,
    child: SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(
        24,
        0,
        24,
        20 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('取引を検索', style: context.type.titleLarge),
          const SizedBox(height: 16),
          TextField(
            controller: input,
            decoration: const InputDecoration(
              labelText: '内容・カテゴリ・口座',
              prefixIcon: Icon(Icons.search_rounded),
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            children: [
              for (final (label, months) in [
                ('表示中の月', 0),
                ('過去3か月', 3),
                ('今年', 12),
                ('すべて', -1),
              ])
                ActionChip(
                  label: Text(label),
                  onPressed: () {
                    final now = DateTime.now();
                    setState(
                      () => period = switch (months) {
                        0 => null,
                        -1 => DateTimeRange(
                          start: DateTime(1900),
                          end: DateTime(2199, 12, 31),
                        ),
                        12 => DateTimeRange(
                          start: DateTime(now.year),
                          end: DateTime(now.year, 12, 31),
                        ),
                        _ => DateTimeRange(
                          start: moveMonth(now, 1 - months),
                          end: dayOf(now),
                        ),
                      },
                    );
                  },
                ),
            ],
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.date_range_rounded),
            title: const Text('期間を指定'),
            subtitle: Text(
              period == null
                  ? '表示中の月'
                  : period!.start.year == 1900 && period!.end.year == 2199
                  ? 'すべて'
                  : '${DateFormat.yMMMd('ja').format(period!.start)} – ${DateFormat.yMMMd('ja').format(period!.end)}',
            ),
            onTap: () async {
              final selected = await showDateRangePicker(
                context: context,
                firstDate: DateTime(1900),
                lastDate: DateTime(2199, 12, 31),
                initialDateRange: period,
              );
              if (mounted && selected != null) {
                setState(() => period = selected);
              }
            },
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, (
              query: input.text.trim(),
              period: period,
            )),
            child: const Text('検索する'),
          ),
        ],
      ),
    ),
  );
}

class EntryEditor extends StatefulWidget {
  const EntryEditor({
    super.key,
    required this.ledger,
    required this.initial,
    required this.save,
    required this.delete,
    this.initialGroup,
    this.cardPayment = false,
  });
  final Ledger ledger;
  final Entry? initial;
  final Future<bool> Function(Entry entry) save;
  final Future<bool> Function()? delete;
  final String? initialGroup;
  final bool cardPayment;
  @override
  State<EntryEditor> createState() => _EntryEditorState();
}

class _EntryEditorState extends State<EntryEditor> {
  final _form = GlobalKey<FormState>();
  late final amount = TextEditingController(
    text: widget.initial?.amount.toString(),
  );
  late final points = TextEditingController(
    text: widget.initial?.points == 0 ? '' : widget.initial?.points.toString(),
  );
  late final memo = TextEditingController(text: widget.initial?.memo);
  late final oldInfo = widget.initial?.info ?? const EntryInfo();
  late String household =
      widget.initial?.info.group ??
      widget.initialGroup ??
      widget.ledger.groups.first;
  late bool business = oldInfo.business;
  late final ratio = TextEditingController(text: oldInfo.ratio.toString());
  late final subject = TextEditingController(text: oldInfo.subject);
  late final counterparty = TextEditingController(text: oldInfo.counterparty);
  late final advance = TextEditingController(text: oldInfo.advance);
  late final fee = TextEditingController(
    text: oldInfo.fee > 0 ? oldInfo.fee.toString() : '',
  );
  late final withholding = TextEditingController(
    text: oldInfo.withholding > 0 ? oldInfo.withholding.toString() : '',
  );
  bool get lockedAdvance =>
      widget.initial != null &&
      widget.ledger.reimbursementFor(widget.initial!) != null;
  bool get isRepayment => oldInfo.reimbursementOf != null;
  bool get supportsPoints =>
      isExpense ||
      (isTransfer &&
          to != null &&
          widget.ledger.findAccount(to!).kind == AccountKind.card);
  late EntryKind kind = widget.initial?.kind ?? EntryKind.expense;
  late DateTime date = widget.initial?.date ?? dayOf(DateTime.now());
  late String from =
      widget.initial?.account ??
      widget.ledger.accounts
          .firstWhere(
            (a) => a.kind != AccountKind.card,
            orElse: () => widget.ledger.accounts.first,
          )
          .id;
  late String? to = widget.initial?.destination;
  late String category = widget.initial?.category.isNotEmpty == true
      ? widget.initial!.category
      : widget.ledger.categories.first;
  late bool details =
      widget.initial?.points != 0 && widget.initial != null ||
      widget.initial?.memo.isNotEmpty == true ||
      oldInfo.business ||
      oldInfo.advance.isNotEmpty ||
      oldInfo.fee > 0 ||
      oldInfo.withholding > 0 ||
      household != widget.ledger.groups.first;
  bool busy = false;

  bool get isTransfer => kind == EntryKind.transfer;
  bool get isExpense => kind == EntryKind.expense;

  @override
  void dispose() {
    amount.dispose();
    points.dispose();
    memo.dispose();
    ratio.dispose();
    subject.dispose();
    counterparty.dispose();
    advance.dispose();
    fee.dispose();
    withholding.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    if (busy || !_form.currentState!.validate()) return;
    final credit = supportsPoints ? parseAmount(points.text) ?? 0 : 0;
    if (supportsPoints &&
        points.text.trim().isNotEmpty &&
        (parseAmount(points.text) == null ||
            credit < 0 ||
            credit > parseAmount(amount.text)!)) {
      setState(() => details = true);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('ポイントは金額以下の整数で入力してください。')));
      return;
    }
    if (isTransfer && (to == null || to == from)) return;
    final parsed = parseAmount(amount.text)!;
    final businessRatio = business && !isTransfer
        ? parseAmount(ratio.text)
        : 100;
    final withholdingValue =
        kind == EntryKind.income && withholding.text.trim().isNotEmpty
        ? parseAmount(withholding.text)
        : 0;
    final feeValue = isTransfer && fee.text.trim().isNotEmpty
        ? parseAmount(fee.text)
        : 0;
    if (businessRatio == null ||
        businessRatio < 0 ||
        businessRatio > 100 ||
        withholdingValue == null ||
        withholdingValue < 0 ||
        withholdingValue >= parsed ||
        feeValue == null ||
        feeValue < 0 ||
        feeValue > maxAmount ||
        (widget.cardPayment && parsed > widget.initial!.amount)) {
      setState(() => details = true);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            widget.cardPayment
                ? '支払額が未払い残高を超えていないか確認してください。'
                : '事業割合・源泉徴収・手数料の金額を確認してください。',
          ),
        ),
      );
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() => busy = true);
    final ok = await widget.save(
      Entry(
        id: widget.initial?.id ?? newId(),
        kind: kind,
        date: date,
        amount: parseAmount(amount.text)!,
        account: from,
        destination: isTransfer ? to : null,
        category: isTransfer ? '' : category,
        points: credit,
        info: EntryInfo(
          group: household,
          business: business && !isTransfer,
          ratio: businessRatio,
          subject: business && !isTransfer ? subject.text.trim() : '',
          counterparty: business && !isTransfer ? counterparty.text.trim() : '',
          advance: isExpense ? advance.text.trim() : '',
          reimbursementOf: oldInfo.reimbursementOf,
          withholding: withholdingValue,
          fee: feeValue,
          recurring: oldInfo.recurring,
          cardMonth: oldInfo.cardMonth,
        ),
        memo: memo.text.trim(),
      ),
    );
    if (!mounted) return;
    setState(() => busy = false);
    if (ok) Navigator.pop(context, date);
  }

  Future<void> remove() async {
    if (busy || widget.delete == null) return;
    if (!await confirm(context, 'この取引を削除しますか？', '取引と口座残高に反映されます。', '削除') ||
        !mounted) {
      return;
    }
    setState(() => busy = true);
    final ok = await widget.delete!();
    if (!mounted) return;
    setState(() => busy = false);
    if (ok) Navigator.pop(context, DateTime(1));
  }

  @override
  Widget build(BuildContext context) {
    final categories = isExpense
        ? widget.ledger.categories
        : widget.ledger.incomeCategories;
    final options = {...categories, if (category.isNotEmpty) category};
    final saveLabel = widget.cardPayment
        ? '支払いを登録'
        : widget.initial == null
        ? '${kind.label}を登録'
        : '変更を保存';
    return PopScope(
      canPop: !busy,
      child: Scaffold(
        appBar: AppBar(
          title: Text(
            widget.cardPayment
                ? 'カード支払いを記録'
                : widget.initial == null
                ? '取引を記録'
                : '取引を編集',
          ),
          actions: [
            if (widget.delete != null)
              IconButton(
                tooltip: '取引を削除',
                onPressed: busy ? null : remove,
                icon: const Icon(Icons.delete_outline),
              ),
            IconButton.filledTonal(
              tooltip: saveLabel,
              onPressed: busy ? null : submit,
              icon: const Icon(Icons.check),
            ),
            const SizedBox(width: 10),
          ],
        ),
        body: Form(
          key: _form,
          child: ListView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 26),
            children: [
              if (!widget.cardPayment && !lockedAdvance && !isRepayment)
                SegmentedButton<EntryKind>(
                  showSelectedIcon: false,
                  segments: [
                    for (final value in EntryKind.values)
                      ButtonSegment(
                        value: value,
                        label: Text(value.label),
                        enabled:
                            value != EntryKind.transfer ||
                            widget.ledger.accounts.length >= 2,
                      ),
                  ],
                  selected: {kind},
                  onSelectionChanged: busy
                      ? null
                      : (values) => setState(() {
                          kind = values.single;
                          category = isExpense
                              ? widget.ledger.categories.first
                              : widget.ledger.incomeCategories.first;
                          if (isTransfer && (to == null || to == from)) {
                            to = widget.ledger.accounts
                                .firstWhere((a) => a.id != from)
                                .id;
                          }
                        }),
                ),
              const SizedBox(height: 18),
              TextFormField(
                controller: amount,
                enabled: !busy && !lockedAdvance && !isRepayment,
                keyboardType: TextInputType.number,
                textInputAction: TextInputAction.done,
                style: context.type.displaySmall?.copyWith(
                  fontFeatures: _figures,
                  fontWeight: FontWeight.w800,
                ),
                decoration: InputDecoration(
                  labelText: '金額',
                  floatingLabelBehavior: FloatingLabelBehavior.always,
                  prefixText: '¥ ',
                  hintText: '0',
                  filled: true,
                  fillColor: context.colors.secondaryContainer,
                  border: OutlineInputBorder(
                    borderSide: BorderSide.none,
                    borderRadius: BorderRadius.circular(22),
                  ),
                  contentPadding: const EdgeInsets.fromLTRB(22, 23, 20, 17),
                ),
                validator: (value) {
                  final parsed = parseAmount(value ?? '');
                  return parsed == null || parsed < 1 || parsed > maxAmount
                      ? '1〜999,999,999円で入力してください'
                      : null;
                },
              ),
              const SizedBox(height: 12),
              ListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 6),
                leading: const Icon(Icons.calendar_today_outlined),
                title: const Text('日付'),
                subtitle: Text(DateFormat.yMMMd('ja').format(date)),
                trailing: const Icon(Icons.chevron_right),
                onTap: busy
                    ? null
                    : () async {
                        final picked = await showDatePicker(
                          context: context,
                          initialDate: date,
                          firstDate: DateTime(1900),
                          lastDate: DateTime(2199, 12, 31),
                        );
                        if (mounted && picked != null) {
                          setState(() => date = picked);
                        }
                      },
              ),
              const SizedBox(height: 10),
              if (!isTransfer) ...[
                DropdownButtonFormField<String>(
                  key: ValueKey(kind),
                  initialValue: category,
                  isExpanded: true,
                  decoration: const InputDecoration(
                    labelText: 'カテゴリ',
                    prefixIcon: Icon(Icons.category_outlined),
                  ),
                  items: options
                      .map(
                        (name) =>
                            DropdownMenuItem(value: name, child: Text(name)),
                      )
                      .toList(),
                  onChanged: busy
                      ? null
                      : (value) => setState(() => category = value!),
                ),
                const SizedBox(height: 14),
              ],
              accountField(
                from,
                isTransfer
                    ? '振替元'
                    : isExpense
                    ? '支払い方法'
                    : '入金先',
                null,
                (value) => setState(() {
                  from = value;
                  if (isTransfer && to == from) {
                    to = widget.ledger.accounts
                        .firstWhere((a) => a.id != from)
                        .id;
                  }
                }),
              ),
              if (widget.cardPayment)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.credit_card_outlined),
                  title: const Text('支払い先'),
                  subtitle: Text(widget.ledger.findAccount(to!).name),
                ),
              if (isTransfer && !widget.cardPayment) ...[
                const SizedBox(height: 14),
                accountField(
                  to,
                  '振替先',
                  from,
                  (value) => setState(() => to = value),
                ),
              ],
              const SizedBox(height: 12),
              const Divider(),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.tune_rounded),
                title: Text(details ? '詳細を閉じる' : '詳細を追加'),
                subtitle: const Text('家計グループ・ポイント・事業・メモ'),
                trailing: Icon(details ? Icons.expand_less : Icons.expand_more),
                onTap: busy ? null : () => setState(() => details = !details),
              ),
              if (details) ...[
                DropdownButtonFormField<String>(
                  initialValue: household,
                  isExpanded: true,
                  decoration: const InputDecoration(
                    labelText: '家計グループ',
                    prefixIcon: Icon(Icons.workspaces_outline),
                  ),
                  items: [
                    for (final name in widget.ledger.groups)
                      DropdownMenuItem(value: name, child: Text(name)),
                  ],
                  onChanged: busy
                      ? null
                      : (value) => setState(() => household = value!),
                ),
                const SizedBox(height: 14),
                if (supportsPoints) ...[
                  TextField(
                    controller: points,
                    enabled: !busy && !lockedAdvance,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'うちポイント充当',
                      prefixIcon: Icon(Icons.stars_outlined),
                      suffixText: '円',
                    ),
                  ),
                  const SizedBox(height: 14),
                ],
                if (isTransfer) ...[
                  detailInput(
                    fee,
                    '振替手数料',
                    Icons.payments_outlined,
                    number: true,
                  ),
                  const SizedBox(height: 14),
                ],
                if (isExpense) ...[
                  detailInput(
                    advance,
                    '立て替えた相手（任意）',
                    Icons.person_outline,
                    locked: lockedAdvance,
                  ),
                  const SizedBox(height: 14),
                ],
                if (!isTransfer && !isRepayment) ...[
                  const Divider(),
                  SwitchListTile.adaptive(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('事業用の取引'),
                    secondary: const Icon(Icons.business_center_outlined),
                    value: business,
                    onChanged: busy
                        ? null
                        : (value) => setState(() => business = value),
                  ),
                  if (business) ...[
                    const SectionHeading('事業の内訳'),
                    const SizedBox(height: 9),
                    detailInput(subject, '勘定科目', Icons.account_tree_outlined),
                    const SizedBox(height: 14),
                    detailInput(
                      ratio,
                      '事業で使った割合（%）',
                      Icons.percent_rounded,
                      number: true,
                    ),
                    const SizedBox(height: 14),
                    detailInput(counterparty, '取引先（任意）', Icons.badge_outlined),
                    const SizedBox(height: 14),
                  ],
                  if (kind == EntryKind.income) ...[
                    detailInput(
                      withholding,
                      '源泉徴収額',
                      Icons.request_quote_outlined,
                      number: true,
                    ),
                    const SizedBox(height: 14),
                  ],
                ],
                TextField(
                  controller: memo,
                  enabled: !busy,
                  maxLength: 120,
                  maxLines: 2,
                  decoration: const InputDecoration(
                    labelText: 'メモ',
                    prefixIcon: Icon(Icons.notes_rounded),
                  ),
                ),
              ],
            ],
          ),
        ),
        bottomNavigationBar: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
            child: FilledButton(
              onPressed: busy ? null : submit,
              child: Text(busy ? '保存中…' : saveLabel),
            ),
          ),
        ),
      ),
    );
  }

  Widget detailInput(
    TextEditingController input,
    String label,
    IconData icon, {
    bool number = false,
    bool locked = false,
  }) => TextField(
    controller: input,
    enabled: !busy && !locked,
    keyboardType: number ? TextInputType.number : TextInputType.text,
    decoration: InputDecoration(labelText: label, prefixIcon: Icon(icon)),
  );

  Widget accountField(
    String? value,
    String label,
    String? excluded,
    ValueChanged<String> onChange,
  ) => DropdownButtonFormField<String>(
    key: ValueKey((label, value)),
    initialValue: value,
    isExpanded: true,
    decoration: InputDecoration(
      labelText: label,
      prefixIcon: const Icon(Icons.account_balance_wallet_outlined),
    ),
    items: [
      for (final account in widget.ledger.accounts.where(
        (a) =>
            a.id != excluded &&
            (!widget.cardPayment || a.kind != AccountKind.card),
      ))
        DropdownMenuItem(
          value: account.id,
          child: Text(account.name, overflow: TextOverflow.ellipsis),
        ),
    ],
    onChanged: busy ? null : (next) => onChange(next!),
    validator: (selected) => selected == null ? '口座を選択してください' : null,
  );
}
