part of 'main.dart';

const _launcherChannel = MethodChannel('mane/launcher');
const _launcherNames = {'smile': 'にっこり', 'smirk': '得意げ', 'ledger': '家計簿'};

bool get _android => !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

String launcherAsset(String id, Brightness brightness) {
  final artwork = id.endsWith('_auto')
      ? id.replaceFirst(
          '_auto',
          brightness == Brightness.dark ? '_teal' : '_mint',
        )
      : id;
  if (!{
    for (final name in _launcherNames.keys) ...['${name}_mint', '${name}_teal'],
    'classic',
  }.contains(artwork)) {
    return 'assets/mane-start.png';
  }
  return 'assets/launcher/$artwork.png';
}

Future<String?> launcherSelection() async {
  if (!_android) return null;
  try {
    return await _launcherChannel.invokeMethod<String>('selected');
  } on PlatformException {
    return null;
  } on MissingPluginException {
    return null;
  }
}

class LauncherScreen extends StatefulWidget {
  const LauncherScreen({super.key});
  @override
  State<LauncherScreen> createState() => _LauncherScreenState();
}

class _LauncherScreenState extends State<LauncherScreen> {
  String? selection;
  bool busy = false;

  @override
  void initState() {
    super.initState();
    launcherSelection().then((id) {
      if (mounted) setState(() => selection = id);
    });
  }

  Future<void> choose(String value) async {
    if (busy || value == selection) return;
    setState(() => busy = true);
    try {
      await _launcherChannel.invokeMethod<void>('select', {'id': value});
      if (mounted) setState(() => selection = value);
    } on Object {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('アイコンを変更できませんでした。')));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('アプリアイコン')),
    body: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const Text('自動は端末のライト・ダークに合わせて切り替わります。固定は選んだ配色を使います。'),
        const SizedBox(height: 15),
        for (final item in _launcherNames.entries) ...[
          SectionHeading(item.value),
          const SizedBox(height: 5),
          for (final (tone, label) in [
            ('auto', '自動'),
            ('mint', 'ミント固定'),
            ('teal', '深い青緑固定'),
          ])
            option('${item.key}_$tone', label),
          const Divider(),
          const SizedBox(height: 16),
        ],
        option('classic', 'クラシック'),
      ],
    ),
  );

  Widget option(String id, String label) {
    final active = id == selection;
    final auto = id.endsWith('_auto');
    return ListTile(
      selected: active,
      contentPadding: EdgeInsets.zero,
      leading: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Image.asset(
            launcherAsset(id, Brightness.light),
            width: 36,
            height: 36,
          ),
          if (auto) ...[
            const SizedBox(width: 4),
            Image.asset(
              launcherAsset(id, Brightness.dark),
              width: 36,
              height: 36,
            ),
          ],
        ],
      ),
      title: Text(label),
      trailing: active ? const Icon(Icons.check_circle) : null,
      onTap: busy ? null : () => choose(id),
    );
  }
}
