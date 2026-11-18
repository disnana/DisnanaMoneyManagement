/**
 * Move `id` one step among the entries that pass `visible`; entries that don't pass keep their slots.
 * Returns the new full order (unchanged when `id` is already at the edge or not visible).
 */
export function moveWithin(order: readonly string[], id: string, delta: -1 | 1, visible: (id: string) => boolean): string[] {
  const shown = order.filter(visible);
  const from = shown.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= shown.length) return [...order];
  [shown[from], shown[to]] = [shown[to], shown[from]];
  let next = 0;
  return order.map((entry) => (visible(entry) ? shown[next++] : entry));
}
