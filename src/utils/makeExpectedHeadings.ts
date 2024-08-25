import type { Heading } from 'src/types';
import { trivial } from './getShownHeadings';

export function makeExpectedHeadings(
  headings: Heading[],
  max: number,
  mode: 'default' | 'concise'
): (index: number) => Heading[] {
  return (index: number) => {
    const subHeadings = headings.slice(0, index);
    const result: Heading[] = [];
    trivial(subHeadings, result, mode);
    if (max) {
      result.slice(-max);
    }
    return result;
  };
}