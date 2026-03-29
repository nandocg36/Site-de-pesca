import { describe, expect, it } from 'vitest';
import { aggregateBaitVotes } from '../js/social/aggregate.js';
import { BAIT_OPTIONS } from '../js/social/constants.js';

describe('aggregateBaitVotes', () => {
  it('escolhe isca mais votada', () => {
    const rows = [{ baitId: 'camarão' }, { baitId: 'camarão' }, { baitId: 'milho' }];
    const r = aggregateBaitVotes(rows, BAIT_OPTIONS, 1);
    expect(r.top?.id).toBe('camarão');
    expect(r.top?.count).toBe(2);
    expect(r.total).toBe(3);
  });
  it('respeita minVotes', () => {
    const rows = [{ baitId: 'lula' }];
    const r = aggregateBaitVotes(rows, BAIT_OPTIONS, 2);
    expect(r.top).toBe(null);
  });
});
