part of 'main.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key, required this.ledger, required this.save});
  final Ledger ledger;
  final SaveLedger save;
  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late Ledger ledger = widget.ledger;
  bool busy = false;

  Future<void> openBook(Widget Function(Ledger, SaveLedger) builder) =>
      Navigator.of(
        context,
      ).push<void>(MaterialPageRoute(builder: (_) => builder(ledger, apply)));

  Future<bool> apply(Ledger next) async {
    if (busy) return false;
    setState(() => busy = true);
    final success = await widget.save(next);
    if (mounted) {
      setState(() {
        if (success) ledger = next;
        busy = false;
      });
    }
    return success;
  }

  Future<void> seed() async {
    if (busy) return;
    if (!await confirm(
          context,
          'サンプルデータに置き換えますか？',
          '現在の取引、口座、貯金目標をサンプルに置き換えます。必要なデータは先にバックアップしてください。',
          '置き換える',
        ) ||
        !mounted) {
      return;
    }
    await apply(
      Ledger.sample(DateTime.now()).copyWith(
        theme: ledger.theme,
        hideBalance: ledger.hideBalance,
        reduceMotion: ledger.reduceMotion,
        haptics: ledger.haptics,
        appLock: ledger.appLock,
      ),
    );
  }

  Future<void> setBudget() async {
    final result = await showDialog<int>(
      context: context,
      builder: (_) => BudgetDialog(budget: ledger.budget),
    );
    if (mounted && result != null) await apply(ledger.copyWith(budget: result));
  }

  Future<void> importStatement() async {
    try {
      final file = await openFile(
        acceptedTypeGroups: const [
          XTypeGroup(
            label: '取引明細CSV',
            extensions: ['csv'],
            mimeTypes: [
              'text/csv',
              'application/vnd.ms-excel',
              'text/plain',
              'application/octet-stream',
            ],
            uniformTypeIdentifiers: [
              'public.comma-separated-values-text',
              'public.plain-text',
            ],
          ),
        ],
      );
      if (file == null || !mounted) return;
      if (await file.length() > 5 * 1024 * 1024) {
        throw const FormatException('CSVは5MB以下で選んでください。');
      }
      final statement = decodeStatement(await file.readAsBytes());
      if (!mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => StatementScreen(
            ledger: ledger,
            statement: statement,
            save: apply,
          ),
        ),
      );
    } on Object catch (error) {
      if (!mounted) return;
      final message = error is FormatException
          ? error.message.toString()
          : 'CSVを読み取れませんでした。';
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(message)));
    }
  }

  Future<void> restore({bool fromFile = false}) async {
    try {
      final String? content;
      if (fromFile) {
        final file = await openFile(
          acceptedTypeGroups: const [
            XTypeGroup(
              label: '家計簿バックアップ',
              extensions: ['json'],
              mimeTypes: [
                'application/json',
                'text/plain',
                'application/octet-stream',
              ],
              uniformTypeIdentifiers: ['public.json', 'public.plain-text'],
            ),
          ],
        );
        if (file == null) return;
        if (await file.length() > 30 * 1024 * 1024) {
          throw const FormatException('バックアップが大きすぎます。');
        }
        content = await file.readAsString();
      } else {
        content = await showDialog<String>(
          context: context,
          builder: (_) =>
              const PasteDialog(title: 'バックアップを復元', label: 'バックアップのJSON'),
        );
      }
      if (!mounted || content == null) return;
      final next = readBackup(
        jsonDecode(content.replaceFirst(RegExp(r'^\uFEFF'), ''))
            as Map<String, dynamic>,
      );
      if (await confirm(
            context,
            'データを復元しますか？',
            '${next.accounts.length}口座・${next.entries.length}件の取引で現在のデータを置き換えます。',
            '復元',
          ) &&
          mounted) {
        await apply(next.copyWith(appLock: ledger.appLock));
      }
    } on Object catch (error) {
      if (mounted) {
        final detail = error is FormatException
            ? error.message.toString()
            : 'バックアップを読み取れませんでした。';
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(detail)));
      }
    }
  }

  Future<void> shareBackup() async {
    final box = context.findRenderObject() as RenderBox?;
    final anchor = box == null
        ? null
        : box.localToGlobal(Offset.zero) & box.size;
    try {
      await SharePlus.instance.share(
        ShareParams(
          files: [
            XFile.fromData(
              utf8.encode(jsonEncode(ledger.copyWith(appLock: false))),
              mimeType: 'application/json',
            ),
          ],
          fileNameOverrides: [
            'mane-chan-${DateFormat('yyyy-MM-dd').format(DateTime.now())}.json',
          ],
          sharePositionOrigin: anchor,
        ),
      );
    } on Exception {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('バックアップファイルを共有できませんでした。')));
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('設定')),
    body: ListView(
      padding: const EdgeInsets.fromLTRB(24, 10, 24, 24),
      children: [
        const SectionHeading('表示'),
        if (_android)
          SettingRow(
            'アプリアイコン',
            Icons.apps_outlined,
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute<void>(builder: (_) => const LauncherScreen()),
            ),
          ),
        const SizedBox(height: 8),
        DropdownButtonFormField<String>(
          key: ValueKey(ledger.theme),
          initialValue: ledger.theme,
          isExpanded: true,
          decoration: const InputDecoration(
            labelText: 'テーマ',
            prefixIcon: Icon(Icons.contrast_outlined),
          ),
          items: const [
            DropdownMenuItem(value: 'system', child: Text('端末に合わせる')),
            DropdownMenuItem(value: 'light', child: Text('ライト')),
            DropdownMenuItem(value: 'dark', child: Text('ダーク')),
          ],
          onChanged: busy
              ? null
              : (value) => apply(ledger.copyWith(theme: value)),
        ),
        SwitchListTile.adaptive(
          contentPadding: EdgeInsets.zero,
          title: const Text('総資産を非表示'),
          secondary: const Icon(Icons.visibility_off_outlined),
          value: ledger.hideBalance,
          onChanged: busy
              ? null
              : (value) => apply(ledger.copyWith(hideBalance: value)),
        ),
        SwitchListTile.adaptive(
          contentPadding: EdgeInsets.zero,
          title: const Text('モーションを抑える'),
          secondary: const Icon(Icons.motion_photos_off_outlined),
          value: ledger.reduceMotion,
          onChanged: busy
              ? null
              : (value) => apply(ledger.copyWith(reduceMotion: value)),
        ),
        if (_mobile) ...[
          SwitchListTile.adaptive(
            contentPadding: EdgeInsets.zero,
            title: const Text('操作時の振動'),
            secondary: const Icon(Icons.vibration),
            value: ledger.haptics,
            onChanged: busy
                ? null
                : (value) => apply(ledger.copyWith(haptics: value)),
          ),
          SwitchListTile.adaptive(
            contentPadding: EdgeInsets.zero,
            title: const Text('アプリのロック'),
            subtitle: const Text('端末の生体認証・パスコードで開く'),
            secondary: const Icon(Icons.lock_outline),
            value: ledger.appLock,
            onChanged: busy
                ? null
                : (value) async {
                    if (value && !await verifyDevice('家計簿のロックを有効にします。')) {
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('端末の認証を確認してください。')),
                        );
                      }
                      return;
                    }
                    if (mounted) await apply(ledger.copyWith(appLock: value));
                  },
          ),
        ],
        const SizedBox(height: 10),
        const Divider(),
        const SizedBox(height: 18),
        const SectionHeading('家計'),
        SettingRow(
          '家計グループ',
          Icons.workspaces_outline,
          onTap: busy
              ? null
              : () => openBook(
                  (ledger, save) => GroupsScreen(ledger: ledger, save: save),
                ),
        ),
        SettingRow(
          '定期取引',
          Icons.event_repeat_outlined,
          onTap: busy
              ? null
              : () => openBook(
                  (ledger, save) =>
                      RecurrencesScreen(ledger: ledger, save: save),
                ),
        ),
        SettingRow(
          '購入予定',
          Icons.shopping_bag_outlined,
          onTap: busy
              ? null
              : () => openBook(
                  (ledger, save) => PurchasesScreen(ledger: ledger, save: save),
                ),
        ),
        SettingRow(
          '立て替え',
          Icons.handshake_outlined,
          onTap: busy
              ? null
              : () => openBook(
                  (ledger, save) => AdvancesScreen(ledger: ledger, save: save),
                ),
        ),
        SettingRow(
          '事業・確定申告の準備',
          Icons.request_quote_outlined,
          onTap: busy
              ? null
              : () => openBook((ledger, save) => TaxScreen(ledger: ledger)),
        ),
        SettingRow(
          'カテゴリ別予算',
          Icons.stacked_bar_chart_rounded,
          onTap: busy
              ? null
              : () => openBook(
                  (ledger, save) =>
                      CategoryBudgetsScreen(ledger: ledger, save: save),
                ),
        ),
        SettingRow(
          '毎月の予算',
          Icons.pie_chart_outline,
          subtitle: ledger.budget == 0 ? '未設定' : yen(ledger.budget),
          onTap: busy ? null : setBudget,
        ),
        SettingRow(
          'カテゴリ管理',
          Icons.category_outlined,
          onTap: busy
              ? null
              : () async {
                  await Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) =>
                          CategoriesScreen(ledger: ledger, save: apply),
                    ),
                  );
                },
        ),
        const SizedBox(height: 10),
        const Divider(),
        const SizedBox(height: 18),
        const SectionHeading('データ管理'),
        SettingRow(
          'バックアップを書き出す',
          Icons.ios_share,
          onTap: busy ? null : shareBackup,
        ),
        SettingRow(
          'バックアップファイルを読み込む',
          Icons.file_open_outlined,
          subtitle: '現行版のバックアップにも対応',
          onTap: busy ? null : () => restore(fromFile: true),
        ),
        SettingRow(
          'バックアップをコピー',
          Icons.copy_all_outlined,
          onTap: busy
              ? null
              : () async {
                  await Clipboard.setData(
                    ClipboardData(
                      text: jsonEncode(ledger.copyWith(appLock: false)),
                    ),
                  );
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('バックアップをコピーしました')),
                    );
                  }
                },
        ),
        SettingRow(
          'バックアップを復元',
          Icons.settings_backup_restore,
          onTap: busy ? null : restore,
        ),
        SettingRow(
          '明細CSVを取り込む',
          Icons.upload_file_outlined,
          subtitle: '三井住友銀行・PayPay銀行・楽天カード・Monemy',
          onTap: busy ? null : importStatement,
        ),
        SettingRow(
          'サンプルデータを読み込む',
          Icons.science_outlined,
          subtitle: '今月のサンプルを用意',
          onTap: busy ? null : seed,
        ),
      ],
    ),
  );
}

class SettingRow extends StatelessWidget {
  const SettingRow(
    this.title,
    this.icon, {
    super.key,
    this.subtitle,
    this.onTap,
  });
  final String title;
  final String? subtitle;
  final IconData icon;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => ListTile(
    contentPadding: EdgeInsets.zero,
    leading: Icon(icon),
    title: Text(title),
    subtitle: subtitle == null ? null : Text(subtitle!),
    onTap: onTap,
    trailing: const Icon(Icons.chevron_right_rounded),
  );
}

class PasteDialog extends StatefulWidget {
  const PasteDialog({super.key, required this.title, required this.label});
  final String title, label;
  @override
  State<PasteDialog> createState() => _PasteDialogState();
}

class _PasteDialogState extends State<PasteDialog> {
  final input = TextEditingController();
  @override
  void dispose() {
    input.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(widget.title),
    scrollable: true,
    content: TextField(
      controller: input,
      minLines: 3,
      maxLines: 7,
      decoration: InputDecoration(labelText: widget.label),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('キャンセル'),
      ),
      FilledButton(
        onPressed: () => Navigator.pop(context, input.text.trim()),
        child: const Text('確認する'),
      ),
    ],
  );
}

class BudgetDialog extends StatefulWidget {
  const BudgetDialog({super.key, required this.budget});
  final int budget;
  @override
  State<BudgetDialog> createState() => _BudgetDialogState();
}

class _BudgetDialogState extends State<BudgetDialog> {
  final _form = GlobalKey<FormState>();
  late final input = TextEditingController(text: widget.budget.toString());
  @override
  void dispose() {
    input.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('毎月の予算'),
    content: Form(
      key: _form,
      child: TextFormField(
        controller: input,
        keyboardType: TextInputType.number,
        decoration: const InputDecoration(
          labelText: '金額',
          prefixText: '¥ ',
          helperText: '0円で予算を解除',
        ),
        validator: validateNonNegative,
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('キャンセル'),
      ),
      FilledButton(
        onPressed: () {
          if (_form.currentState!.validate()) {
            Navigator.pop(context, parseAmount(input.text)!);
          }
        },
        child: const Text('保存'),
      ),
    ],
  );
}

String? validateNonNegative(String? value) {
  final amount = parseAmount(value ?? '');
  return amount == null || amount < 0 || amount > maxAmount
      ? '金額を整数で入力してください'
      : null;
}

class CategoriesScreen extends StatefulWidget {
  const CategoriesScreen({super.key, required this.ledger, required this.save});
  final Ledger ledger;
  final SaveLedger save;
  @override
  State<CategoriesScreen> createState() => _CategoriesScreenState();
}

class _CategoriesScreenState extends State<CategoriesScreen> {
  late Ledger ledger = widget.ledger;
  bool busy = false;
  Future<void> commit(Ledger next) async {
    if (busy) return;
    setState(() => busy = true);
    final ok = await widget.save(next);
    if (!mounted) return;
    setState(() {
      if (ok) ledger = next;
      busy = false;
    });
  }

  Future<void> edit([String? name]) async {
    final result = await showDialog<String>(
      context: context,
      builder: (_) => NameDialog(
        title: name == null ? 'カテゴリを追加' : 'カテゴリを編集',
        label: 'カテゴリ名',
        value: name,
        taken: ledger.categories.where((n) => n != name).toSet(),
      ),
    );
    if (!mounted || result == null) return;
    await commit(
      ledger.copyWith(
        categories: [
          for (final item in ledger.categories) item == name ? result : item,
          if (name == null) result,
        ],
        entries: [
          for (final e in ledger.entries)
            if (e.kind == EntryKind.expense && e.category == name)
              Entry(
                id: e.id,
                kind: e.kind,
                date: e.date,
                amount: e.amount,
                account: e.account,
                category: result,
                memo: e.memo,
                points: e.points,
              )
            else
              e,
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('支出カテゴリ'),
      actions: [
        IconButton(
          tooltip: 'カテゴリを追加',
          icon: const Icon(Icons.add),
          onPressed: busy ? null : () => edit(),
        ),
      ],
    ),
    body: ListView(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      children: [
        for (final name in ledger.categories) ...[
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(categoryIcon(name)),
            title: Text(name),
            onTap: busy ? null : () => edit(name),
            trailing:
                ledger.categories.length > 1 &&
                    !ledger.entries.any(
                      (e) => e.kind == EntryKind.expense && e.category == name,
                    )
                ? IconButton(
                    tooltip: '$nameを削除',
                    icon: const Icon(Icons.delete_outline),
                    onPressed: busy
                        ? null
                        : () async {
                            if (await confirm(
                                  context,
                                  'カテゴリを削除しますか？',
                                  name,
                                  '削除',
                                ) &&
                                mounted) {
                              await commit(
                                ledger.copyWith(
                                  categories: ledger.categories
                                      .where((c) => c != name)
                                      .toList(),
                                ),
                              );
                            }
                          },
                  )
                : null,
          ),
          const Divider(),
        ],
      ],
    ),
  );
}

class NameDialog extends StatefulWidget {
  const NameDialog({
    super.key,
    required this.title,
    required this.label,
    this.value,
    this.taken = const {},
  });
  final String title, label;
  final String? value;
  final Set<String> taken;
  @override
  State<NameDialog> createState() => _NameDialogState();
}

class _NameDialogState extends State<NameDialog> {
  final _form = GlobalKey<FormState>();
  late final input = TextEditingController(text: widget.value);
  @override
  void dispose() {
    input.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(widget.title),
    content: Form(
      key: _form,
      child: TextFormField(
        controller: input,
        maxLength: 32,
        decoration: InputDecoration(labelText: widget.label),
        validator: (v) {
          final name = v?.trim() ?? '';
          return name.isEmpty
              ? '名前を入力してください'
              : widget.taken.contains(name)
              ? '同じ名前がすでにあります'
              : null;
        },
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('キャンセル'),
      ),
      FilledButton(
        onPressed: () {
          if (_form.currentState!.validate()) {
            Navigator.pop(context, input.text.trim());
          }
        },
        child: const Text('保存'),
      ),
    ],
  );
}

class GoalsScreen extends StatefulWidget {
  const GoalsScreen({super.key, required this.ledger, required this.save});
  final Ledger ledger;
  final SaveLedger save;
  @override
  State<GoalsScreen> createState() => _GoalsScreenState();
}

class _GoalsScreenState extends State<GoalsScreen> {
  late Ledger ledger = widget.ledger;
  bool busy = false;

  Future<bool> commit(Ledger next) async {
    if (busy) return false;
    setState(() => busy = true);
    final ok = await widget.save(next);
    if (mounted) {
      setState(() {
        if (ok) ledger = next;
        busy = false;
      });
    }
    return ok;
  }

  Future<void> edit([Goal? goal]) async {
    if (busy) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => GoalEditor(
          goal: goal,
          save: (next) => commit(
            ledger.copyWith(
              goals: [
                for (final g in ledger.goals) g.id == next.id ? next : g,
                if (goal == null) next,
              ],
            ),
          ),
          remove: goal == null
              ? null
              : () => commit(
                  ledger.copyWith(
                    goals: ledger.goals.where((g) => g.id != goal.id).toList(),
                  ),
                ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('貯金目標'),
      actions: [
        IconButton(
          tooltip: '貯金目標を追加',
          icon: const Icon(Icons.add),
          onPressed: busy ? null : () => edit(),
        ),
      ],
    ),
    body: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        if (ledger.goals.isEmpty) ...[
          const Text('目標を作って、積み立てた金額を記録できます。'),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: busy ? null : () => edit(),
            child: const Text('貯金目標を追加'),
          ),
        ],
        for (final goal in ledger.goals) ...[
          GoalProgress(goal: goal, onTap: () => edit(goal)),
          const Divider(),
        ],
      ],
    ),
  );
}

class GoalProgress extends StatelessWidget {
  const GoalProgress({super.key, required this.goal, this.onTap});
  final Goal goal;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => Semantics(
    button: onTap != null,
    child: InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Icon(Icons.savings_outlined, color: context.colors.primary),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    goal.name,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
                if (onTap != null) const Icon(Icons.chevron_right_rounded),
              ],
            ),
            const SizedBox(height: 8),
            Text('${yen(goal.saved)} / ${yen(goal.target)}'),
            const SizedBox(height: 8),
            ExcludeSemantics(
              child: LinearProgressIndicator(
                value: (goal.saved / goal.target).clamp(0, 1),
                minHeight: 7,
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class GoalEditor extends StatefulWidget {
  const GoalEditor({
    super.key,
    required this.goal,
    required this.save,
    required this.remove,
  });
  final Goal? goal;
  final Future<bool> Function(Goal) save;
  final Future<bool> Function()? remove;
  @override
  State<GoalEditor> createState() => _GoalEditorState();
}

class _GoalEditorState extends State<GoalEditor> {
  final form = GlobalKey<FormState>();
  late final name = TextEditingController(text: widget.goal?.name);
  late final target = TextEditingController(
    text: widget.goal?.target.toString(),
  );
  late final saved = TextEditingController(
    text: widget.goal?.saved.toString() ?? '0',
  );
  late bool progress = widget.goal != null;
  late DateTime? targetDate = widget.goal?.targetDate;
  late final monthly = TextEditingController(
    text: (widget.goal?.monthly ?? 0).toString(),
  );
  late final note = TextEditingController(text: widget.goal?.note);
  bool busy = false;

  @override
  void dispose() {
    name.dispose();
    target.dispose();
    saved.dispose();
    monthly.dispose();
    note.dispose();
    super.dispose();
  }

  Future<void> commit() async {
    if (busy || !form.currentState!.validate()) return;
    final targetValue = parseAmount(target.text);
    final savedValue = parseAmount(saved.text);
    final monthlyValue = parseAmount(monthly.text);
    if (name.text.trim().isEmpty ||
        targetValue == null ||
        targetValue <= 0 ||
        savedValue == null ||
        savedValue < 0 ||
        monthlyValue == null ||
        monthlyValue < 0 ||
        monthlyValue > maxAmount) {
      return;
    }
    setState(() => busy = true);
    final result = await widget.save(
      Goal(
        widget.goal?.id ?? newId(),
        name.text.trim(),
        targetValue,
        savedValue,
        targetDate: targetDate,
        monthly: monthlyValue,
        note: note.text.trim(),
      ),
    );
    if (mounted && result) {
      Navigator.pop(context);
    } else if (mounted) {
      setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(widget.goal?.name ?? '貯金目標を追加'),
      actions: [
        if (!progress && widget.remove != null)
          IconButton(
            tooltip: '目標を削除',
            icon: const Icon(Icons.delete_outline),
            onPressed: busy
                ? null
                : () async {
                    if (await confirm(
                          context,
                          'この目標を削除しますか？',
                          widget.goal!.name,
                          '削除',
                        ) &&
                        mounted) {
                      setState(() => busy = true);
                      final result = await widget.remove!();
                      if (mounted && result) {
                        Navigator.pop(this.context);
                      } else if (mounted) {
                        setState(() => busy = false);
                      }
                    }
                  },
          ),
      ],
    ),
    body: Form(
      key: form,
      child: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          if (widget.goal != null) ...[
            SegmentedButton<bool>(
              showSelectedIcon: false,
              segments: const [
                ButtonSegment(value: true, label: Text('進捗')),
                ButtonSegment(value: false, label: Text('設定')),
              ],
              selected: {progress},
              onSelectionChanged: busy
                  ? null
                  : (value) => setState(() => progress = value.single),
            ),
            const SizedBox(height: 22),
          ],
          if (progress) ...[
            GoalProgress(goal: widget.goal!),
            const SizedBox(height: 12),
          ] else ...[
            TextFormField(
              controller: name,
              enabled: !busy,
              maxLength: 40,
              decoration: const InputDecoration(
                labelText: '目標名',
                prefixIcon: Icon(Icons.flag_outlined),
              ),
              validator: (v) =>
                  v == null || v.trim().isEmpty ? '目標名を入力してください' : null,
            ),
            const SizedBox(height: 8),
            TextFormField(
              controller: target,
              enabled: !busy,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: '目標額',
                prefixIcon: Icon(Icons.track_changes),
                suffixText: '円',
              ),
              validator: (v) => (parseAmount(v ?? '') ?? 0) < 1
                  ? '1円以上で入力してください'
                  : validateNonNegative(v),
            ),
            const SizedBox(height: 14),
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('目標日'),
              leading: const Icon(Icons.calendar_today_outlined),
              subtitle: Text(
                targetDate == null
                    ? '未設定'
                    : DateFormat.yMMMd('ja').format(targetDate!),
              ),
              trailing: targetDate == null
                  ? const Icon(Icons.chevron_right)
                  : IconButton(
                      tooltip: '目標日を解除',
                      icon: const Icon(Icons.close),
                      onPressed: () => setState(() => targetDate = null),
                    ),
              onTap: busy
                  ? null
                  : () async {
                      final date = await showDatePicker(
                        context: context,
                        initialDate: targetDate ?? dayOf(DateTime.now()),
                        firstDate: DateTime(1900),
                        lastDate: DateTime(2199, 12, 31),
                      );
                      if (date != null && mounted) {
                        setState(() => targetDate = date);
                      }
                    },
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: monthly,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: '月々の積立予定額',
                prefixIcon: Icon(Icons.savings_outlined),
              ),
              validator: validateNonNegative,
            ),
            const SizedBox(height: 14),
            TextField(
              controller: note,
              decoration: const InputDecoration(
                labelText: '目標のメモ',
                prefixIcon: Icon(Icons.notes_outlined),
              ),
            ),
            const SizedBox(height: 16),
          ],
          TextFormField(
            controller: saved,
            enabled: !busy,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: '積立済みの金額',
              prefixIcon: Icon(Icons.savings_outlined),
              suffixText: '円',
            ),
            validator: validateNonNegative,
          ),
          const SizedBox(height: 18),
          FilledButton(
            onPressed: busy ? null : commit,
            child: const Text('保存'),
          ),
        ],
      ),
    ),
  );
}
