import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import type { SymbolViewProps } from 'expo-symbols';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View, useColorScheme, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tick } from '@/lib/haptics';
import { metrics, usePalette } from '@/lib/theme';
import { Group, Row, SectionTitle } from '@/ui/kit';

type GuideImage = { image: number; darkImage: number };
type GuideStep = { instruction: string; screenshot: GuideImage };
type GuidePage = {
  title: string;
  steps: readonly GuideStep[];
};

const topics = {
  record: {
    title: '支出や収入を記録する',
    listTitle: '取引を記録',
    icon: { ios: 'plus', android: 'add' },
    steps: [{
      instruction: 'どのタブからでも、画面下の中央にある＋を押します。',
      screenshot: { image: require('../../assets/start-guide/record.jpg'), darkImage: require('../../assets/start-guide/record-dark.jpg') },
    }],
  },
  vibration: {
    title: '操作時の振動を止める',
    listTitle: '振動をオフ',
    icon: { ios: 'waveform', android: 'vibration' },
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
    listTitle: '支出の内訳',
    icon: { ios: 'chart.pie', android: 'pie_chart' },
    steps: [{
      instruction: '画面下の「分析」を押すと、カテゴリ別の支出を確認できます。',
      screenshot: { image: require('../../assets/start-guide/analysis.jpg'), darkImage: require('../../assets/start-guide/analysis-dark.jpg') },
    }],
  },
  card: {
    title: 'カードの未払い・ポイントを確認',
    listTitle: 'カード未払い・ポイント',
    icon: { ios: 'creditcard', android: 'credit_card' },
    steps: [{
      instruction: '未払いは「口座」でカードを選んで確認できます。ポイント払いは支出入力の「うちポイント充当」に記録します。',
      screenshot: { image: require('../../assets/start-guide/card.jpg'), darkImage: require('../../assets/start-guide/card-dark.jpg') },
    }],
  },
  savings: {
    title: '貯金目標を立てる',
    listTitle: '貯金目標',
    icon: { ios: 'target', android: 'flag' },
    steps: [{
      instruction: 'ホーム右上の「予算・計画」を開き、「貯金」を選びます。',
      screenshot: { image: require('../../assets/start-guide/savings.jpg'), darkImage: require('../../assets/start-guide/savings-dark.jpg') },
    }],
  },
  search: {
    title: '過去の取引を探す',
    listTitle: '取引を検索',
    icon: { ios: 'magnifyingglass', android: 'search' },
    steps: [{
      instruction: '画面下の「取引」を開き、右上の虫眼鏡を押します。',
      screenshot: { image: require('../../assets/start-guide/transaction-search.jpg'), darkImage: require('../../assets/start-guide/transaction-search-dark.jpg') },
    }],
  },
  planning: {
    title: '予算や買い物を計画する',
    listTitle: '予算・買い物試算',
    icon: { ios: 'calendar', android: 'calendar_month' },
    steps: [{
      instruction: 'ホーム右上の「予算・計画」を開き、「予算」か「買い物試算」を選びます。',
      screenshot: { image: require('../../assets/start-guide/planning.jpg'), darkImage: require('../../assets/start-guide/planning-dark.jpg') },
    }],
  },
  categories: {
    title: 'カテゴリ・家計グループを変える',
    listTitle: 'カテゴリ・家計グループ',
    icon: { ios: 'tag', android: 'label' },
    steps: [{
      instruction: 'ホーム右上の歯車を押し、設定の「事業・精算」を探します。',
      screenshot: { image: require('../../assets/start-guide/categories-ledgers.jpg'), darkImage: require('../../assets/start-guide/categories-ledgers-dark.jpg') },
    }],
  },
  backups: {
    title: 'バックアップ・CSVを取り込む',
    listTitle: 'バックアップ・CSV取り込み',
    icon: { ios: 'tray.and.arrow.down', android: 'file_download' },
    steps: [{
      instruction: 'ホーム右上の歯車を押し、設定から「データ管理」を開きます。',
      screenshot: { image: require('../../assets/start-guide/data-management.jpg'), darkImage: require('../../assets/start-guide/data-management-dark.jpg') },
    }],
  },
} satisfies Record<string, GuidePage & { listTitle: string; icon: SymbolViewProps['name'] }>;

const introduction: readonly GuidePage[] = [topics.record, topics.vibration, topics.analysis, topics.card, topics.savings];
export type GuideTopic = keyof typeof topics;

export function isGuideTopic(topic: unknown): topic is GuideTopic {
  return typeof topic === 'string' && Object.hasOwn(topics, topic);
}

export function isGuideStep(topic: GuideTopic, step: string | undefined) {
  return step !== undefined && /^[0-9]+$/.test(step) && Number(step) < topics[topic].steps.length;
}

const topicGroups = [
  { title: '記録・確認', pages: ['record', 'search', 'analysis', 'card'] },
  { title: '設定・データ', pages: ['vibration', 'categories', 'backups'] },
  { title: '予算・貯金', pages: ['planning', 'savings'] },
] as const satisfies readonly { title: string; pages: readonly GuideTopic[] }[];
const reviewPageIds: readonly GuideTopic[] = topicGroups.flatMap((group) => [...group.pages]);
const reviewPages: readonly GuidePage[] = reviewPageIds.map((id) => topics[id]);
const screenshotRatio = 390 / 844;

export function GettingStarted({ onClose, review = false, reviewRoute }: {
  onClose: () => void;
  review?: boolean;
  reviewRoute?: { topic?: GuideTopic; step?: number };
}) {
  const p = usePalette();
  const isDark = useColorScheme() === 'dark';
  const { width, fontScale } = useWindowDimensions();
  const [index, setIndex] = useState<number | null>(review ? null : 0);
  const [previewImage, setPreviewImage] = useState<GuideStep>();
  const pages = review ? reviewPages : introduction;
  const page = reviewRoute?.topic ? topics[reviewRoute.topic] : index === null ? undefined : pages[index];
  const openImage = reviewRoute?.step === undefined ? previewImage : page?.steps[reviewRoute.step];
  const sideBySide = width >= 360 && fontScale < 1.3 && page?.steps.length === 2;
  const last = index === pages.length - 1;
  const backLabel = openImage ? '手順へ戻る' : page ? '一覧へ戻る' : '設定へ戻る';
  const nativeReviewHeader = review && Platform.OS === 'ios';
  const showReviewFooter = review && !!page;

  function goBack() {
    if (reviewRoute) onClose();
    else if (openImage) setPreviewImage(undefined);
    else if (review && page) setIndex(null);
    else onClose();
  }

  function openTopic(topic: GuideTopic) {
    if (reviewRoute) router.push({ pathname: '/settings/guide-topic', params: { topic } });
    else setIndex(reviewPageIds.indexOf(topic));
  }

  function showImage(step: GuideStep, position: number) {
    if (reviewRoute?.topic) router.push({ pathname: '/settings/guide-image', params: { topic: reviewRoute.topic, step: String(position) } });
    else setPreviewImage(step);
  }

  return (
    <SafeAreaView edges={nativeReviewHeader ? ['bottom', 'left', 'right'] : ['top', 'bottom', 'left', 'right']}
      style={{ flex: 1, backgroundColor: p.bg }} accessibilityViewIsModal={!nativeReviewHeader}>
      {nativeReviewHeader ? <Stack.Screen options={{
        title: openImage ? '画面の拡大' : '使い方',
        headerShown: true,
        headerBackVisible: false,
        gestureEnabled: true,
        unstable_headerLeftItems: () => [{
          type: 'button', icon: { type: 'sfSymbol', name: 'chevron.left' }, label: backLabel,
          onPress: () => { tick(); goBack(); },
        }],
      }} /> : reviewRoute ? <Stack.Screen options={{ headerShown: false }} /> : null}
      <View style={{ flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center', paddingHorizontal: review && !page ? 16 : 24 }}>
        {nativeReviewHeader || (showReviewFooter && !openImage) ? null : review || openImage ? (
          <Pressable accessibilityRole="button" accessibilityLabel={backLabel} onPress={goBack}
            style={{ minHeight: 44, marginTop: 6, alignSelf: 'flex-start', justifyContent: 'center' }}>
            <Text style={{ color: p.tint, fontSize: 15, fontWeight: '600' }}>← {backLabel}</Text>
          </Pressable>
        ) : <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
          <Text accessibilityLiveRegion="polite" style={{ color: p.textSecondary, fontSize: 14 }}>
            {(index ?? 0) + 1} / {pages.length}
          </Text>
          <Pressable accessibilityRole="button" onPress={onClose} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 }}>
            <Text style={{ color: p.tint, fontSize: 15, fontWeight: '600' }}>スキップ</Text>
          </Pressable>
        </View>}
        {openImage ? (
          <ScrollView contentContainerStyle={{ paddingBottom: 16, gap: 10 }}>
            <Text accessibilityRole="header" style={{ color: p.text, fontSize: 18, fontWeight: '700' }}>{openImage.instruction}</Text>
            <Image source={isDark ? openImage.screenshot.darkImage : openImage.screenshot.image}
              accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
              contentFit="contain" style={{ width: '100%', aspectRatio: screenshotRatio, borderRadius: 14 }} />
          </ScrollView>
        ) : page ? (
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
                        onPress={() => showImage(step, stepIndex)} style={{ width: '100%', maxWidth: 190, alignSelf: 'center' }}>
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
            {!review || showReviewFooter ? <View style={{ gap: 6, paddingBottom: 14, paddingTop: 10 }}>
              <Pressable accessibilityRole="button" onPress={review ? goBack : last ? onClose : () => setIndex((index ?? 0) + 1)}
                style={({ pressed }) => ({
                  minHeight: 52, borderRadius: metrics.controlRadius, backgroundColor: p.tint,
                  alignItems: 'center', justifyContent: 'center', padding: 10, opacity: pressed ? 0.83 : 1,
                })}>
                <Text style={{ color: p.onTint, fontSize: 16, fontWeight: '700' }}>{review ? backLabel : last ? 'はじめる' : '次へ'}</Text>
              </Pressable>
              {review ? null : index !== null && index > 0 ? (
                <Pressable accessibilityRole="button" onPress={() => setIndex(index - 1)}
                  style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ color: p.tint, fontSize: 14, fontWeight: '600' }}>前へ</Text>
                </Pressable>
              ) : <View style={{ minHeight: 44 }} />}
            </View> : null}
          </>
        ) : (
          <ScrollView contentContainerStyle={{ gap: 16, paddingVertical: 10 }}>
            {!nativeReviewHeader ? <Text accessibilityRole="header" style={{ color: p.text, fontSize: 28, fontWeight: '800' }}>使い方</Text> : null}
            {topicGroups.map((group) => (
              <View key={group.title} style={{ gap: 16 }}>
                <SectionTitle>{group.title}</SectionTitle>
                <Group>
                  {group.pages.map((topicId) => {
                    const topic = topics[topicId];
                    return (
                      <Row key={topicId} title={topic.listTitle}
                        icon={topic.icon}
                        compact chevron onPress={() => openTopic(topicId)} />
                    );
                  })}
                </Group>
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}
