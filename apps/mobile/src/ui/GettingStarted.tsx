import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { metrics, usePalette } from '@/lib/theme';

const pages = [
  {
    title: '画面下の＋から記録',
    detail: '中央の＋を押して、支出・収入・振替を選びます。金額などを入力して保存すると、取引タブから見返せます。',
    image: require('../../assets/start-guide/record.jpg'),
    darkImage: require('../../assets/start-guide/record-dark.jpg'),
    imageHeight: 118,
  },
  {
    title: '何にいくら使ったか確認',
    detail: 'ホームで残高と月の収支を見て、分析で支出の割合や収入の内訳を見比べられます。',
    image: require('../../assets/start-guide/analysis.jpg'),
    darkImage: require('../../assets/start-guide/analysis-dark.jpg'),
    imageHeight: 265,
  },
  {
    title: 'カードの未払いとポイント',
    detail: 'カードごとに支払残額と利用可能額を確認。ポイントで払った分は、充当額を記録して実際の支払額に反映できます。',
    image: require('../../assets/start-guide/card.jpg'),
    darkImage: require('../../assets/start-guide/card-dark.jpg'),
    imageHeight: 254,
  },
  {
    title: '目的に合わせて貯金',
    detail: '旅行や買い替えなどの目標を作り、積み立てを記録。目標まであといくらか確認できます。',
    image: require('../../assets/start-guide/savings.jpg'),
    darkImage: require('../../assets/start-guide/savings-dark.jpg'),
    imageHeight: 254,
  },
] as const;

export function GettingStarted({ onClose, review = false }: { onClose: () => void; review?: boolean }) {
  const p = usePalette();
  const isDark = useColorScheme() === 'dark';
  const [index, setIndex] = useState(0);
  const page = pages[index];
  const last = index === pages.length - 1;

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: p.bg }} accessibilityViewIsModal>
      <View style={{ flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center', paddingHorizontal: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
          <Text accessibilityLiveRegion="polite" style={{ color: p.textSecondary, fontSize: 14 }}>
            {index + 1} / {pages.length}
          </Text>
          <Pressable accessibilityRole="button" onPress={onClose} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 }}>
            <Text style={{ color: p.tint, fontSize: 15, fontWeight: '600' }}>{review ? '閉じる' : 'スキップ'}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: 18, paddingVertical: 12 }}>
          <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{
            backgroundColor: p.fill, borderRadius: 24, padding: 10, overflow: 'hidden',
          }}>
            <Image source={isDark ? page.darkImage : page.image} contentFit="contain" style={{ height: page.imageHeight, width: '100%' }} />
          </View>
          <Text key={page.title} accessibilityRole="header" style={{ color: p.text, fontSize: 28, fontWeight: '800' }}>
            {page.title}
          </Text>
          <Text style={{ color: p.textSecondary, fontSize: 16, lineHeight: 24 }}>{page.detail}</Text>
        </ScrollView>
        <View style={{ gap: 6, paddingBottom: 14, paddingTop: 10 }}>
          <Pressable accessibilityRole="button" onPress={last ? onClose : () => setIndex(index + 1)}
            style={({ pressed }) => ({
              minHeight: 52, borderRadius: metrics.controlRadius, backgroundColor: p.tint,
              alignItems: 'center', justifyContent: 'center', padding: 10, opacity: pressed ? 0.83 : 1,
            })}>
            <Text style={{ color: p.onTint, fontSize: 16, fontWeight: '700' }}>{last ? review ? '閉じる' : 'はじめる' : '次へ'}</Text>
          </Pressable>
          {index > 0 ? (
            <Pressable accessibilityRole="button" onPress={() => setIndex(index - 1)}
              style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: p.tint, fontSize: 14, fontWeight: '600' }}>前へ</Text>
            </Pressable>
          ) : <View style={{ minHeight: 44 }} />}
        </View>
      </View>
    </SafeAreaView>
  );
}
