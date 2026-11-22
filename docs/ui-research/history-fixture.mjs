// Reproducible, fictitious data for isolated preview installations.
import { pathToFileURL } from 'node:url';

const examples = [
  { day: 22, type: 'expense', title: '青葉ベーカリー', categoryId: 'food', amount: 1280, pointUsed: 200 },
  { day: 22, type: 'expense', title: '街の本屋と文具店 駅前店で手帳と来年のカレンダーを購入', categoryId: 'hobby', amount: 3860, memo: '家計を記録するための手帳。翌年の予定もここにまとめる。' },
  { day: 21, type: 'income', title: '11月のお給料', categoryId: 'salary', amount: 268000 },
  { day: 21, type: 'transfer', title: '財布へ現金を移動', categoryId: 'transfer', amount: 20000, toAccountId: 'wallet', transferFee: 110 },
  { day: 20, type: 'expense', title: '電車で買い出し', categoryId: 'transport', amount: 430 },
];
const everyday = [
  ['朝のコーヒー', 'food', 360], ['帰りのバス', 'transport', 220],
  ['商店街で買い物', 'food', 1780], ['週末の読書', 'hobby', 990],
];

export function historyFixture(count, month = '2026-11') {
  if (!Number.isSafeInteger(count) || count < 0 || count > 10000 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new RangeError('件数は 0〜10000、年月は YYYY-MM を指定してください。');
  }
  const transactions = Array.from({ length: count }, (_, index) => {
    const [title, categoryId, amount] = everyday[index % everyday.length];
    const { day, ...details } = examples[index] ?? { day: 19 - index % 19, type: 'expense', title, categoryId, amount };
    return { id: 'preview-' + index, accountId: 'bank', date: month + '-' + String(day).padStart(2, '0'), ...details };
  });
  return {
    accounts: [
      { id: 'bank', type: 'bank', name: '生活口座', initialBalance: 50000 },
      { id: 'wallet', type: 'cash', name: 'お財布', initialBalance: 8000 },
    ],
    transactions, budgets: [], recurringItems: [], savingsGoals: [],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(historyFixture(Number(process.argv[2] ?? 5), process.argv[3])));
}
