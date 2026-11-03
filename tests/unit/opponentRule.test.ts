import { describe, expect, it } from 'vitest';
import { Board } from '../../src/engine/board';
import { ruleMove, ruleReason } from '../../src/engine/opponentRule';

describe('rule-based opponent (win → block → centre)', () => {
  it('wins when it can, even when it could also block', () => {
    const b = Board.fromMoves('172737');
    expect(b.turn).toBe(1);
    expect(ruleMove(b)).toBe(3);
    expect(ruleReason(b, 3)).toBe('win');
  });

  it('blocks the opponent immediate win', () => {
    const b = Board.fromMoves('12131');
    expect(b.turn).toBe(2);
    expect(ruleMove(b)).toBe(0);
    expect(ruleReason(b, 0)).toBe('block');
  });

  it('otherwise plays the most central free column in order 3, 2, 4, 1, 5, 0, 6', () => {
    expect(ruleMove(new Board())).toBe(3);
    expect(ruleReason(new Board(), 3)).toBe('centre');
    const b = Board.fromMoves('444444');
    expect(ruleMove(b)).toBe(2);
    const c = Board.fromMoves('444444333333');
    expect(ruleMove(c)).toBe(4);
  });

  it('scans block targets in centre order', () => {
    const c = Board.fromMoves('27374');
    expect(c.turn).toBe(2);
    expect(ruleMove(c)).toBe(4);
  });
});
