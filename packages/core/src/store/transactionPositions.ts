/** Preserve stored order without rewriting existing positions when recording or deleting a transaction. */
export function transactionPositions(
  transactions: readonly { id: string }[],
  entries: ReadonlyMap<string, { position: number }>,
): number[] {
  const positions: number[] = [];
  let left = -Infinity;
  let start = 0;
  for (let i = 0; i <= transactions.length; i++) {
    const right = i === transactions.length ? Infinity : entries.get(transactions[i].id)?.position;
    if (right === undefined) continue;
    if (right <= left) return transactions.map((_, index) => index);
    const count = i - start;
    for (let offset = 0; offset < count; offset++) {
      const position = left === -Infinity ? (right === Infinity ? offset : right - count + offset)
        : right === Infinity ? left + offset + 1 : left + ((right - left) * (offset + 1)) / (count + 1);
      if (position >= right || position <= (positions.at(-1) ?? -Infinity)) {
        return transactions.map((_, index) => index);
      }
      positions.push(position);
    }
    if (right !== Infinity) positions.push(right);
    left = right;
    start = i + 1;
  }
  return positions;
}
