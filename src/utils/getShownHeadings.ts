import type { HeadingCache, MarkdownView } from "obsidian";
import type { Heading, ISetting } from "src/types";
import { isEditSourceMode } from "./obsidian";

const isHeading = /^<h[1-6]/i;

export function getHeadingsWithOffsetPreview(
  headings: HeadingCache[],
  view: MarkdownView,
): { heading: HeadingCache; offset: number; }[] {
  const headingsOffset: number[] = [];
  let heightSum = 0;
  // @ts-expect-error height not defined in obsidian typing
  view.previewMode.renderer.sections.forEach(({ html, height = 0 }) => {
    if (isHeading.test(html)) {
      headingsOffset.push(heightSum);
    }
    heightSum += height;
  });
  return headings.map((heading, index) => ({
    heading,
    offset: headingsOffset[index] || 0,
  }));
}

export function getHeadingsWithOffsetSource(
  headings: HeadingCache[],
  view: MarkdownView,
): { heading: HeadingCache; offset: number; }[] {
  const result: { heading: HeadingCache; offset: number; }[] = [];
  for (const heading of headings) {
    const { position } = heading;
    // const { top = 0 } = view.editMode.editor?.coordsAtPos({ line: position.start.line, ch: 0 }, true) || {};
    const offset = view.editMode.containerEl.querySelector<HTMLElement>('.cm-contentContainer')?.offsetTop || 0;
    const { top = 0 } = view.editor.cm.lineBlockAt(position.start.offset);
    result.push({
      heading,
      offset: top + offset,
    });
  }
  return result;
}

export function trivial(
  subHeadings: Heading[],
  result: Heading[],
  mode: 'default' | 'concise'
) {
  if (!subHeadings.length) {
    return result;
  }
  const topLevel = subHeadings.reduce(
    (res, cur) => Math.min(res, cur.level),
    6
  );
  const indexesOfTopLevel = subHeadings.reduce<number[]>(
    (indexes, cur, index) => {
      if (cur.level === topLevel) {
        indexes.push(index);
      }
      return indexes;
    },
    []
  );
  if (mode === 'concise') {
    if (indexesOfTopLevel.length >= 1) {
      result.push(subHeadings[indexesOfTopLevel[indexesOfTopLevel.length - 1]]);
    }
  } else {
    for (const index of indexesOfTopLevel) {
      result.push(subHeadings[index]);
    }
  }
  trivial(
    subHeadings.slice(indexesOfTopLevel[indexesOfTopLevel.length - 1] + 1),
    result,
    mode
  );
}
export function getHeadingsWithOffset(
  headings: HeadingCache[],
  view: MarkdownView,
): { heading: HeadingCache; offset: number; }[] {
  const getValidHeadings = isEditSourceMode(view) ? getHeadingsWithOffsetSource : getHeadingsWithOffsetPreview;
  const validHeadings = getValidHeadings(headings, view);
  return validHeadings;
}

export default getHeadingsWithOffset;