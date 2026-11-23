import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { metrics, usePalette } from '@/lib/theme';

type GuidePage = {
  title: string;
  detail: string;
  paths: readonly string[];
  illustration?: { image: number; darkImage: number; height: number };
  settingsLocation?: boolean;
};

const introduction: readonly GuidePage[] = [
  {
    title: '画面下の＋から記録',
    detail: '中央の＋を押して、支出・収入・振替を選びます。金額などを入力して保存すると、取引タブから見返せます。',
    paths: ['画面下の＋ → 支出・収入・振替', '画面下の取引 → 記録を見返す'],
    illustration: { image: require('../../assets/start-guide/record.jpg'), darkImage: require('../../assets/start-guide/record-dark.jpg'), height: 118 },
  },
  {
    title: '設定を開く・振動を止める',
    detail: '記録したときやボタンを押したときの振動は、「操作時の振動」をオフにすると止められます。',
    paths: ['ホーム右上の歯車 → 設定 → 操作 → 操作時の振動', '口座右上の歯車 → 設定'],
    settingsLocation: true,
  },
  {
    title: '何にいくら使ったか確認',
    detail: 'ホームで残高と月の収支を見て、分析で支出の割合や収入の内訳を見比べられます。',
    paths: ['ホーム → 月の収支', '画面下の分析 → 支出・収入の内訳'],
    illustration: { image: require('../../assets/start-guide/analysis.jpg'), darkImage: require('../../assets/start-guide/analysis-dark.jpg'), height: 265 },
  },
  {
    title: 'カードの未払いとポイント',
    detail: 'カードごとに支払残額と利用可能額を確認。ポイントで払った分は、充当額を記録して実際の支払額に反映できます。',
    paths: ['口座 → 確認したいカード', '画面下の＋ → 支出 → うちポイント充当'],
    illustration: { image: require('../../assets/start-guide/card.jpg'), darkImage: require('../../assets/start-guide/card-dark.jpg'), height: 254 },
  },
  {
    title: '目的に合わせて貯金',
    detail: '旅行や買い替えなどの目標を作り、積み立てを記録。目標まであといくらか確認できます。',
    paths: ['ホーム右上の「予算・計画」 → 貯金'],
    illustration: { image: require('../../assets/start-guide/savings.jpg'), darkImage: require('../../assets/start-guide/savings-dark.jpg'), height: 254 },
  },
];

const topics: readonly GuidePage[] = [
  ...introduction,
  {
    title: '過去の取引を探す',
    detail: '取引の検索を開いて、キーワードや条件を指定できます。',
    paths: ['画面下の取引 → 右上の虫眼鏡'],
  },
  {
    title: '予算や買い物を計画する',
    detail: 'カテゴリごとの予算や、買い物にかかる費用を確認できます。',
    paths: ['ホーム右上の「予算・計画」 → 予算・買い物試算'],
  },
  {
    title: 'カテゴリ・家計グループを変える',
    detail: 'カテゴリの名前や色を変えたり、家庭や事業の記録を分けたりできます。',
    paths: ['ホーム右上の歯車 → 設定 → 事業・精算 → カテゴリ・家計グループ'],
  },
  {
    title: 'バックアップ・CSV取り込み',
    detail: '家計データの書き出し・復元や、対応するCSVの取り込みができます。',
    paths: ['ホーム右上の歯車 → 設定 → データ管理'],
  },
];

export function GettingStarted({ onClose, review = false }: { onClose: () => void; review?: boolean }) {
  const p = usePalette();
  const isDark = useColorScheme() === 'dark';
  const [index, setIndex] = useState<number | null>(review ? null : 0);
  const pages = review ? topics : introduction;
  const page = index === null ? undefined : pages[index];
  const illustration = page?.illustration;
  const imageSource = isDark ? illustration?.darkImage : illustration?.image;
  const last = index === pages.length - 1;

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: p.bg }} accessibilityViewIsModal>
      <View style={{ flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center', paddingHorizontal: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
          <Text accessibilityLiveRegion="polite" style={{ color: p.textSecondary, fontSize: 14 }}>
            {review ? (page ? '使い方' : '') : (index ?? 0) + 1 + ' / ' + pages.length}
          </Text>
          <Pressable accessibilityRole="button" onPress={onClose} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 }}>
            <Text style={{ color: p.tint, fontSize: 15, fontWeight: '600' }}>{review ? '閉じる' : 'スキップ'}</Text>
          </Pressable>
        </View>
        {page && index !== null ? (
          <>
            <ScrollView key={page.title} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: 14, paddingVertical: 12 }}>
              <Text accessibilityRole="header" style={{ color: p.text, fontSize: 28, fontWeight: '800' }}>
                {page.title}
              </Text>
              {illustration ? <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{
                backgroundColor: p.fill, borderRadius: 24, padding: 10, overflow: 'hidden',
              }}>
                <Image source={imageSource} recyclingKey={Platform.OS === 'android' ? String(imageSource) : undefined}
                  contentFit="contain" style={{ height: illustration.height, width: '100%' }} />
              </View> : null}
              <Text style={{ color: p.textSecondary, fontSize: 16, lineHeight: 24 }}>{page.detail}</Text>
              <View style={{ backgroundColor: p.fill, borderRadius: metrics.cardRadius, padding: 14, gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {page.settingsLocation ? <SymbolView name={{ ios: 'gearshape.fill', android: 'settings' }}
                    size={19} tintColor={p.tint} accessible={false} /> : null}
                  <Text style={{ color: p.tint, fontSize: 14, fontWeight: '700' }}>場所</Text>
                </View>
                {page.paths.map((path) => <Text key={path} style={{ color: p.text, fontSize: 15, lineHeight: 23 }}>{path}</Text>)}
              </View>
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
            {pages.map((topic, topicIndex) => (
              <Pressable key={topic.title} accessibilityRole="button" accessibilityLabel={topic.title} onPress={() => setIndex(topicIndex)}
                style={({ pressed }) => ({
                  minHeight: 48, flexDirection: 'row', gap: 10, alignItems: 'center', padding: 14,
                  borderRadius: metrics.cardRadius, backgroundColor: pressed ? p.fill : p.card,
                })}>
                <Text style={{ flex: 1, color: p.text, fontSize: 16, fontWeight: '600' }}>{topic.title}</Text>
                <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right' }} size={15} tintColor={p.tint} accessible={false} />
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}
