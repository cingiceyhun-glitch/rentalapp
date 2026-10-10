import { describe, expect, it } from 'vitest';
import { toCsv } from '../src/lib/csv.ts';
import { emptyListing } from '../src/types.ts';

describe('toCsv', () => {
  it('escapes commas, quotes and newlines and starts with a BOM for Excel', () => {
    const l = { ...emptyListing(), title: 'T2, "lovely"', notes: 'line 1\nline 2', price: 1500 };
    const csv = toCsv([l]);
    expect(csv.startsWith('﻿Title,Link,')).toBe(true);
    expect(csv).toContain('"T2, ""lovely"""');
    expect(csv).toContain('"line 1\nline 2"');
    expect(csv).toContain(',1500,EUR,');
  });
});
