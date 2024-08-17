import type {
  App,
  HeadingCache,
} from 'obsidian';
import {
  setIcon,
  Setting,
  Plugin,
  MarkdownView,
  PluginSettingTab,
} from 'obsidian';
import defaultSetting from './defaultSetting';
import L from './L';
import {
  calcIndentLevels,
  getHeadings,
  isMarkdownFile,
  parseMarkdown,
} from './utils';
import type { IFileResolve, ISetting } from './types';
import getShownHeadings from './getShownHeadings';
import { throttle } from 'lodash';
export default class StickyHeadingsPlugin extends Plugin {
  settings: ISetting;
  fileResolveMap: Record<
    string,
    IFileResolve
  > = {};

  markdownCache: Record<string, string> = {};

  detectPosition = throttle(
    (event: Event) => {
      const target = event.target as HTMLElement | null;
      const scroller
        = target?.classList.contains('cm-scroller')
        || target?.classList.contains('markdown-preview-view');
      if (scroller) {
        const container = target?.closest('.view-content');
        if (container) {
          const ids = Object.keys(this.fileResolveMap).filter(
            id => this.fileResolveMap[id].container === container,
          );
          this.updateHeadings(ids);
        }
      }
    },
    50,
    { leading: true, trailing: true },
  );

  async onload() {
    await this.loadSettings();
    this.registerEvent(
      this.app.workspace.on('file-open', file => {
        if (file && isMarkdownFile(file)) {
          const activeView = this.app.workspace.getActiveViewOfType(
            MarkdownView,
          );
          const id = activeView?.leaf.id;
          if (id) {
            if (!(id in this.fileResolveMap)) {
              activeView.onResize = this.makeResize(id);
            }
            this.fileResolveMap[id] = {
              resolve: true,
              file,
              container: activeView.contentEl,
              view: activeView,
            };
            this.checkFileResolveMap();
            this.updateHeadings([id]);
          }
        }
      }),
    );
    this.registerEvent(
      this.app.workspace.on('layout-change', () => {
        this.checkFileResolveMap();
        this.updateHeadings(Object.keys(this.fileResolveMap));
      }),
    );
    this.registerEvent(
      this.app.workspace.on('window-open', workspaceWindow => {
        this.registerDomEvent(
          workspaceWindow.doc,
          'scroll',
          this.detectPosition,
          true,
        );
      }),
    );
    this.registerEvent(
      this.app.workspace.on('editor-change', (editor, info) => {
        const { file } = info;
        if (file && isMarkdownFile(file)) {
          Object.values(this.fileResolveMap).forEach(item => {
            if (item.file.path === file.path) {
              item.resolve = false;
            }
          });
        }
      }),
    );
    this.registerEvent(
      this.app.metadataCache.on('resolve', file => {
        if (isMarkdownFile(file)) {
          const ids: string[] = [];
          Object.keys(this.fileResolveMap).forEach(id => {
            const item = this.fileResolveMap[id];
            if (item.file.path === file.path && !item.resolve) {
              item.resolve = true;
              ids.push(id);
            }
          });
          if (ids.length > 0) {
            this.checkFileResolveMap();
            this.updateHeadings(ids);
          }
        }
      }),
    );
    this.registerDomEvent(document, 'scroll', this.detectPosition, true);
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    this.addSettingTab(new StickyHeadingsSetting(this.app, this));
  }

  checkFileResolveMap() {
    const validIds: string[] = [];
    this.app.workspace.iterateAllLeaves(leaf => {
      if (leaf.id && leaf.view instanceof MarkdownView) {
        validIds.push(leaf.id);
        if (!(leaf.id in this.fileResolveMap)) {
          const file = leaf.view.getFile();
          if (file) {
            this.fileResolveMap[leaf.id] = {
              resolve: true,
              file,
              container: leaf.view.contentEl,
              view: leaf.view,
            };
          }
        }
      }
    });
    Object.keys(this.fileResolveMap).forEach(id => {
      if (!validIds.includes(id)) {
        delete this.fileResolveMap[id];
      }
    });
  }

  makeResize(id: string) {
    return () => {
      this.updateHeadings([id]);
    };
  }

  rerenderAll() {
    this.updateHeadings(Object.keys(this.fileResolveMap));
  }

  updateHeadings(ids: string[]) {
    ids.forEach(id => {
      const item = this.fileResolveMap[id];
      const { file, view, container } = item;
      const headings = getHeadings(file, this.app);
      const scrollTop = view.editor.getScrollInfo().top;
      this.renderHeadings(headings, container, scrollTop, view);
    });
  }

  async renderHeadings(
    headings: HeadingCache[] = [],
    container: HTMLElement,
    scrollTop: number,
    view: MarkdownView,
  ) {
    let headingContainer = container.querySelector(
      '.sticky-headings-container',
    );
    let stickyContainerHeight = headingContainer?.getBoundingClientRect()
      .height || 0;
    const finalHeadings = getShownHeadings(headings, view, stickyContainerHeight, this.settings);
    if (!headingContainer) {
      const headingRoot = createDiv({ cls: 'sticky-headings-root' });
      headingContainer = headingRoot.createDiv({
        cls: 'sticky-headings-container',
      });
      headingContainer = headingRoot.createDiv({
        cls: 'sticky-headings-container',
      });
      container.prepend(headingRoot);
    }
    else {
      lastHeight = headingContainer.scrollHeight;
    }
    headingContainer.empty();
    const indentLevels: number[] = calcIndentLevels(finalHeadings);
    for (const [i, { heading, offset }] of finalHeadings.entries()) {
      const cls = `sticky-headings-item sticky-headings-level-${heading.level}`;
      const cacheKey = heading.heading;
      let parsedText: string;
      if (cacheKey in this.markdownCache) {
        parsedText = this.markdownCache[cacheKey];
      }
      else {
        parsedText = await parseMarkdown(heading.heading, this.app);
        this.markdownCache[cacheKey] = parsedText;
      }
      const headingItem = createDiv({
        cls,
        text: parsedText,
      });
      const icon = createDiv({ cls: 'sticky-headings-icon' });
      setIcon(icon, `heading-${heading.level}`);
      headingItem.prepend(icon);
      headingItem.setAttribute('data-indent-level', `${indentLevels[i]}`);
      headingContainer.append(headingItem);
      // need to update to get live preview scroller manually
      // eslint-disable-next-line @typescript-eslint/no-loop-func
      headingItem.addEventListener('click', () => {
        // check if live preview and use different scroller element
        (view.currentMode.type === 'preview'
          ? view.previewMode.renderer.previewEl
          : view.editor.cm.scrollDOM)
          .scrollTo({
            top: offset - stickyContainerHeight,
            behavior: this.settings.scrollBehaviour,
          });

        // todo
        // fix issues with sticky container height interfering with scrollTo
      });
    }
    stickyContainerHeight = headingContainer.getBoundingClientRect()
      .height || 0;
  }

  // add section for current headings array so when we click on it we can immediately remove it
  // and get the expected array at that position

  onunload() {}

  async loadSettings() {
    this.settings = {
      ...defaultSetting,
      ...(await this.loadData() as ISetting),
    };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class StickyHeadingsSetting extends PluginSettingTab {
  plugin: StickyHeadingsPlugin;
  render: (settings: ISetting) => void;

  constructor(app: App, plugin: StickyHeadingsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  update(data: ISetting) {
    this.plugin.settings = data;
    this.plugin.saveSettings();
    this.plugin.rerenderAll();
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl)
      .setName(L.setting.mode.title())
      .setDesc(L.setting.mode.description())
      .addDropdown(dropdown => {
        dropdown.addOption('default', L.setting.mode.default());
        dropdown.addOption('concise', L.setting.mode.concise());
        dropdown.setValue(this.plugin.settings.mode);
        dropdown.onChange(value => {
          this.update({
            ...this.plugin.settings,
            mode: value as 'default' | 'concise',
          });
        });
      });
    new Setting(containerEl)
      .setName(L.setting.max.title())
      .setDesc(L.setting.max.description())
      .addText(text => {
        text.setValue(this.plugin.settings.max.toString());
        text.onChange(value => {
          this.update({
            ...this.plugin.settings,
            max: parseInt(value, 10) || 0,
          });
        });
      });
    new Setting(containerEl)
      .setName(L.setting.scrollBehaviour.title())
      .setDesc(L.setting.scrollBehaviour.description())
      .addDropdown(dropdown => {
        dropdown.addOption('auto', L.setting.scrollBehaviour.auto());
        dropdown.addOption('smooth', L.setting.scrollBehaviour.smooth());
        dropdown.addOption('instant', L.setting.scrollBehaviour.instant());
        dropdown.setValue(this.plugin.settings.scrollBehaviour);
        dropdown.onChange(value => {
          this.update({
            ...this.plugin.settings,
            scrollBehaviour: value as ScrollBehavior,
          });
        });
      });
  }
}
