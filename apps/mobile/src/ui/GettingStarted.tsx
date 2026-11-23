import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { metrics, usePalette } from '@/lib/theme';

type GuideImage = { image: number; darkImage: number };
type GuideStep = { instruction: string; screenshot: GuideImage };
type GuidePage = {
  title: string;
  steps: readonly GuideStep[];
};

const topics = {
  record: {
    title: '支出や収入を記録する',
    steps: [{
      instruction: 'どのタブからでも、画面下の中央にある＋を押します。',
      screenshot: { image: require('../../assets/start-guide/record.jpg'), darkImage: require('../../assets/start-guide/record-dark.jpg') },
    }],
  },
  vibration: {
    title: '操作時の振動を止める',
    steps: [
      {
        instruction: 'ホームの右上にある歯車を押す',
        screenshot: { image: require('../../assets/start-guide/settings-open.jpg'), darkImage: require('../../assets/start-guide/settings-open-dark.jpg') },
      },
      {
        instruction: '設定の「操作」で「操作時の振動」をオフにする',
        screenshot: { image: require('../../assets/start-guide/settings-vibration-off.jpg'), darkImage: require('../../assets/start-guide/settings-vibration-off-dark.jpg') },
      },
    ],
  },
  analysis: {
    title: '支出の内訳を見る',
    steps: [{
      instruction: '画面下の「分析」を押すと、カテゴリ別の支出を確認できます。',
      screenshot: { image: require('../../assets/start-guide/analysis.jpg'), darkImage: require('../../assets/start-guide/analysis-dark.jpg') },
    }],
  },
  card: {
    title: 'カードの未払い・ポイントを確認',
    steps: [{
      instruction: '未払いは「口座」でカードを選んで確認できます。ポイント払いは支出入力の「うちポイント充当」に記録します。',
      screenshot: { image: require('../../assets/start-guide/card.jpg'), darkImage: require('../../assets/start-guide/card-dark.jpg') },
    }],
  },
  savings: {
    title: '貯金目標を立てる',
    steps: [{
      instruction: 'ホーム右上の「予算・計画」を開き、「貯金」を選びます。',
      screenshot: { image: require('../../assets/start-guide/savings.jpg'), darkImage: require('../../assets/start-guide/savings-dark.jpg') },
    }],
  },
  search: {
    title: '過去の取引を探す',
    steps: [{
      instruction: '画面下の「取引」を開き、右上の虫眼鏡を押します。',
      screenshot: { image: require('../../assets/start-guide/transaction-search.jpg'), darkImage: require('../../assets/start-guide/transaction-search-dark.jpg') },
    }],
  },
  planning: {
    title: '予算や買い物を計画する',
    steps: [{
      instruction: 'ホーム右上の「予算・計画」を開き、「予算」か「買い物試算」を選びます。',
      screenshot: { image: require('../../assets/start-guide/planning.jpg'), darkImage: require('../../assets/start-guide/planning-dark.jpg') },
    }],
  },
  categories: {
    title: 'カテゴリ・家計グループを変える',
    steps: [{
      instruction: 'ホーム右上の歯車を押し、設定の「事業・精算」を探します。',
      screenshot: { image: require('../../assets/start-guide/categories-ledgers.jpg'), darkImage: require('../../assets/start-guide/categories-ledgers-dark.jpg') },
    }],
  },
  backups: {
    title: 'バックアップ・CSVを取り込む',
    steps: [{
      instruction: 'ホーム右上の歯車を押し、設定から「データ管理」を開きます。',
      screenshot: { image: require('../../assets/start-guide/data-management.jpg'), darkImage: require('../../assets/start-guide/data-management-dark.jpg') },
    }],
  },
} satisfies Record<string, GuidePage>;

const introduction: readonly GuidePage[] = [topics.record, topics.vibration, topics.analysis, topics.card, topics.savings];
const topicGroups = [
  { title: '記録・確認', pages: [topics.record, topics.search, topics.analysis, topics.card] },
  { title: '設定・データ', pages: [topics.vibration, topics.categories, topics.backups] },
  { title: '予算・貯金', pages: [topics.planning, topics.savings] },
];
const reviewPages: readonly GuidePage[] = topicGroups.flatMap((group) => group.pages);
const screenshotRatio = 390 / 844;

export function GettingStarted({ onClose, review = false }: { onClose: () => void; review?: boolean }) {
  const p = usePalette();
  const isDark = useColorScheme() === 'dark';
  const { width, fontScale } = useWindowDimensions();
  const [index, setIndex] = useState<number | null>(review ? null : 0);
  const [openImage, setOpenImage] = useState<GuideStep>();
  const pages = review ? reviewPages : introduction;
  const page = index === null ? undefined : pages[index];
  const sideBySide = width >= 360 && fontScale < 1.3 && page?.steps.length === 2;
  const last = index === pages.length - 1;

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: p.bg }} accessibilityViewIsModal>
      <View style={{ flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center', paddingHorizontal: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
          <Text accessibilityLiveRegion="polite" style={{ color: p.textSecondary, fontSize: 14 }}>
            {openImage ? '画面の拡大' : review ? (page ? '使い方' : '') : (index ?? 0) + 1 + ' / ' + pages.length}
          </Text>
          <Pressable accessibilityRole="button" onPress={openImage ? () => setOpenImage(undefined) : onClose}
            style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 }}>
            <Text style={{ color: p.tint, fontSize: 15, fontWeight: '600' }}>{openImage ? '手順に戻る' : review ? '閉じる' : 'スキップ'}</Text>
          </Pressable>
        </View>
        {openImage ? (
          <ScrollView contentContainerStyle={{ paddingBottom: 16, gap: 10 }}>
            <Text accessibilityRole="header" style={{ color: p.text, fontSize: 18, fontWeight: '700' }}>{openImage.instruction}</Text>
            <Image source={isDark ? openImage.screenshot.darkImage : openImage.screenshot.image}
              accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
              contentFit="contain" style={{ width: '100%', aspectRatio: screenshotRatio, borderRadius: 14 }} />
          </ScrollView>
        ) : page && index !== null ? (
          <>
            <ScrollView key={page.title} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: 14, paddingVertical: 12 }}>
              <Text accessibilityRole="header" style={{ color: p.text, fontSize: 28, fontWeight: '800' }}>
                {page.title}
              </Text>
              <View style={{ flexDirection: sideBySide ? 'row' : 'column', gap: 12 }}>
                {page.steps.map((step, stepIndex) => {
                  const source = isDark ? step.screenshot.darkImage : step.screenshot.image;
                  return (
                    <View key={step.instruction} style={{ flex: sideBySide ? 1 : undefined, minWidth: 0, gap: 8 }}>
                      <Text style={{ color: p.text, fontSize: 15, lineHeight: 22, fontWeight: '600', minHeight: sideBySide ? 48 : undefined }}>
                        {page.steps.length > 1 ? `${stepIndex + 1}. ` : ''}{step.instruction}
                      </Text>
                      <Pressable accessibilityRole="button" accessibilityLabel={`画面を拡大：${step.instruction}`}
                        onPress={() => setOpenImage(step)} style={{ width: '100%', maxWidth: 190, alignSelf: 'center' }}>
                        <Image source={source} recyclingKey={Platform.OS === 'android' ? String(source) : undefined}
                          accessibilityElementsHidden importantForAccessibility="no-hide-descendants" contentFit="contain"
                          style={{ width: '100%', aspectRatio: screenshotRatio, borderWidth: 1, borderColor: p.outline, borderRadius: 12 }} />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
              <Text style={{ color: p.textSecondary, fontSize: 13, textAlign: 'center' }}>画像をタップすると拡大できます</Text>
            </ScrollView>
            <View style={{ gap: 6, paddingBottom: 14, paddingTop: 10 }}>
              <Pressable accessibilityRole="button" onPress={review ? () => setIndex(null) : last ? onClose : () => setIndex(index + 1)}
                style={({ pressed }) => ({
                  minHeight: 52, borderRadius: metrics.controlRadius, backgroundColor: p.tint,
                  alignItems: 'center', justifyContent: 'center', padding: 10, opacity: pressed ? 0.83 : 1,
                })}>
                <Text style={{ color: p.onTint, fontSize: 16, fontWeight: '700' }}>{review ? '使い方の一覧へ' : last ? 'はじめる' : '次へ'}</Text>
              </Pressable>
              {!review && index > 0 ? (
                <Pressable accessibilityRole="button" onPress={() => setIndex(index - 1)}
                  style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ color: p.tint, fontSize: 14, fontWeight: '600' }}>前へ</Text>
                </Pressable>
              ) : !review ? <View style={{ minHeight: 44 }} /> : null}
            </View>
          </>
        ) : (
          <ScrollView contentContainerStyle={{ gap: 8, paddingVertical: 12 }}>
            <Text accessibilityRole="header" style={{ color: p.text, fontSize: 28, fontWeight: '800', marginBottom: 8 }}>使い方</Text>
            {topicGroups.map((group) => (
              <View key={group.title} style={{ gap: 6, marginBottom: 8 }}>
                <Text accessibilityRole="header" style={{ color: p.textSecondary, fontSize: 14, fontWeight: '700' }}>{group.title}</Text>
                <View style={{ backgroundColor: p.card, borderRadius: metrics.cardRadius, overflow: 'hidden' }}>
                  {group.pages.map((topic, position) => (
                    <Pressable key={topic.title} accessibilityRole="button" accessibilityLabel={topic.title}
                      onPress={() => setIndex(reviewPages.indexOf(topic))} style={({ pressed }) => ({
                        minHeight: 48, flexDirection: 'row', gap: 10, alignItems: 'center', padding: 12,
                        borderTopWidth: position === 0 ? 0 : StyleSheet.hairlineWidth, borderTopColor: p.fill,
                        backgroundColor: pressed ? p.fill : p.card,
                      })}>
                      <Text style={{ flex: 1, color: p.text, fontSize: 16, fontWeight: '600' }}>{topic.title}</Text>
                      <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right' }} size={15} tintColor={p.tint} accessible={false} />
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}
