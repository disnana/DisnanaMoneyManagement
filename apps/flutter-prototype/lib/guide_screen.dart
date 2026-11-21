part of 'main.dart';

const _guide = [
  (
    '画面下の＋から記録',
    '中央の＋を押して、支出・収入・振替を選びます。金額などを入力して保存すると、取引タブから見返せます。',
    'assets/guide/record.jpg',
    118.0,
  ),
  (
    '何にいくら使ったか確認',
    'ホームで残高と月の収支を見て、分析で支出の割合や収入の内訳を見比べられます。',
    'assets/guide/analysis.jpg',
    265.0,
  ),
  (
    'カードの未払いとポイント',
    'カードごとに支払残額と利用可能額を確認。ポイントで払った分は、充当額を記録して実際の支払額に反映できます。',
    'assets/guide/card.jpg',
    254.0,
  ),
  (
    '目的に合わせて貯金',
    '旅行や買い替えなどの目標を作り、積み立てを記録。目標まであといくらか確認できます。',
    'assets/guide/savings.jpg',
    254.0,
  ),
];

class GettingStarted extends StatefulWidget {
  const GettingStarted({super.key, required this.onClose, this.review = false});
  final VoidCallback onClose;
  final bool review;
  @override
  State<GettingStarted> createState() => _GettingStartedState();
}

class _GettingStartedState extends State<GettingStarted> {
  final pages = PageController();
  int index = 0;
  @override
  void dispose() {
    pages.dispose();
    super.dispose();
  }

  void move(int next) {
    if (MediaQuery.disableAnimationsOf(context)) {
      pages.jumpToPage(next);
    } else {
      pages.animateToPage(
        next,
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
      );
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: widget.review,
    onPopInvokedWithResult: (didPop, _) {
      if (!didPop && !widget.review) widget.onClose();
    },
    child: Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Column(
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          '${index + 1} / ${_guide.length}',
                          style: context.type.labelLarge,
                        ),
                      ),
                      TextButton(
                        onPressed: widget.onClose,
                        child: Text(widget.review ? '閉じる' : 'スキップ'),
                      ),
                    ],
                  ),
                  Expanded(
                    child: PageView.builder(
                      controller: pages,
                      itemCount: _guide.length,
                      onPageChanged: (value) => setState(() => index = value),
                      itemBuilder: (context, page) => LayoutBuilder(
                        builder: (context, constraints) =>
                            SingleChildScrollView(
                              child: ConstrainedBox(
                                constraints: BoxConstraints(
                                  minHeight: constraints.maxHeight,
                                ),
                                child: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  crossAxisAlignment:
                                      CrossAxisAlignment.stretch,
                                  children: [
                                    Container(
                                      height: _guide[page].$4,
                                      width: double.infinity,
                                      padding: const EdgeInsets.all(10),
                                      decoration: BoxDecoration(
                                        color:
                                            context.colors.surfaceContainerLow,
                                        borderRadius: BorderRadius.circular(26),
                                      ),
                                      alignment: Alignment.center,
                                      child: ExcludeSemantics(
                                        child: Image.asset(
                                          _guide[page].$3,
                                          fit: BoxFit.contain,
                                        ),
                                      ),
                                    ),
                                    const SizedBox(height: 24),
                                    Semantics(
                                      header: true,
                                      child: Text(
                                        _guide[page].$1,
                                        style: context.type.headlineMedium
                                            ?.copyWith(
                                              fontWeight: FontWeight.w800,
                                            ),
                                      ),
                                    ),
                                    const SizedBox(height: 11),
                                    Text(
                                      _guide[page].$2,
                                      style: context.type.bodyLarge?.copyWith(
                                        color: context.colors.onSurfaceVariant,
                                        height: 1.5,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: index == _guide.length - 1
                          ? widget.onClose
                          : () => move(index + 1),
                      style: FilledButton.styleFrom(
                        minimumSize: const Size(52, 52),
                      ),
                      child: Text(
                        index == _guide.length - 1
                            ? widget.review
                                  ? '閉じる'
                                  : 'はじめる'
                            : '次へ',
                      ),
                    ),
                  ),
                  if (index > 0)
                    TextButton(
                      onPressed: () => move(index - 1),
                      child: const Text('前へ'),
                    )
                  else
                    const SizedBox(height: 48),
                ],
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
