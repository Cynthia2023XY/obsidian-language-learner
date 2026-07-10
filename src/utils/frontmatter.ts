import { App, TFile, parseYaml, stringifyYaml } from "obsidian";

type FrontMatter = { [K in string]: string };

/** 匹配文件开头第一段 YAML frontmatter，避免误吞正文中的 Markdown 分隔线 */
const FRONTMATTER_BLOCK_REGEXP = /^\n*---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export class FrontMatterManager {
    app: App;

    constructor(app: App) {
        this.app = app;
    }

    // 解析
    async loadFrontMatter(file: TFile): Promise<FrontMatter> {
        let res = {} as FrontMatter;
        let text = await this.app.vault.read(file);

        let match = text.match(FRONTMATTER_BLOCK_REGEXP);
        if (match) {
            res = parseYaml(match[1]);
        }

        return res;
    }

    async storeFrontMatter(file: TFile, fm: FrontMatter) {
        if (Object.keys(fm).length === 0) {
            return;
        }

        let text = await this.app.vault.read(file);
        let match = text.match(FRONTMATTER_BLOCK_REGEXP);

        let newText = "";
        let newFront = stringifyYaml(fm);
        if (match) {
            newText = text.replace(FRONTMATTER_BLOCK_REGEXP, `---\n${newFront}---\n`);
        } else {
            newText = `---\n${newFront}---\n\n` + text;
        }

        this.app.vault.modify(file, newText);
    }

    // 读取值
    async getFrontMatter(file: TFile, key: string): Promise<string> {
        let frontmatter = await this.loadFrontMatter(file);

        return frontmatter[key];
    }

    // 修改
    async setFrontMatter(file: TFile, key: string, value: string) {
        let fm = await this.loadFrontMatter(file);

        fm[key] = value;

        await this.storeFrontMatter(file, fm);
    }
}
