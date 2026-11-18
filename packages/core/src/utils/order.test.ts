import { describe, expect, it } from 'vitest';
import { moveWithin } from './order';

describe('moveWithin', () => {
  const all = ['a', 'b', 'c', 'd', 'e'];
  it('swaps with the neighbour in the visible subset and keeps hidden entries in place', () => {
    const visible = (id: string) => id !== 'b' && id !== 'd'; // a c e visible; b d fixed
    expect(moveWithin(all, 'c', -1, visible)).toEqual(['c', 'b', 'a', 'd', 'e']);
    expect(moveWithin(all, 'c', 1, visible)).toEqual(['a', 'b', 'e', 'd', 'c']);
  });
  it('does nothing at the edges or for unknown ids', () => {
    expect(moveWithin(all, 'a', -1, () => true)).toEqual(all);
    expect(moveWithin(all, 'e', 1, () => true)).toEqual(all);
    expect(moveWithin(all, 'x', 1, () => true)).toEqual(all);
  });
  it('moves within the whole list when everything is visible', () => {
    expect(moveWithin(all, 'b', 1, () => true)).toEqual(['a', 'c', 'b', 'd', 'e']);
  });
});
