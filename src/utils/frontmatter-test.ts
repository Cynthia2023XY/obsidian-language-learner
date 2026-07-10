import { describe, expect, it } from "vitest";

import { FrontMatterManager } from "./frontmatter";

describe("FrontMatterManager", () => {
    it("只更新文件开头的 frontmatter，不吞掉正文中的 Markdown 分隔线", async () => {
        /** 带有正文分隔线的阅读材料内容 */
        let fileText = [
            "---",
            "langr: true",
            "langr-pos: 1",
            "---",
            "",
            "^^^article",
            "First paragraph.",
            "",
            "---",
            "",
            "Second paragraph.",
            "",
        ].join("\n");

        /** 模拟 Obsidian vault 的最小读写接口 */
        const app = {
            vault: {
                read: async () => fileText,
                modify: async (_file: unknown, nextText: string) => {
                    fileText = nextText;
                },
            },
        };

        /** 负责读写文章 frontmatter 的管理器 */
        const manager = new FrontMatterManager(app as never);

        await manager.setFrontMatter({} as never, "langr-pos", "2");

        expect(fileText).toContain("langr-pos: \"2\"");
        expect(fileText).toContain("^^^article\nFirst paragraph.\n\n---\n\nSecond paragraph.");
    });

    it("没有 frontmatter 时会在文件开头创建，不改变原正文", async () => {
        /** 还没有 YAML frontmatter 的普通阅读材料 */
        let fileText = ["^^^article", "First paragraph.", "---", "Second paragraph."].join("\n");

        /** 模拟 Obsidian vault 的最小读写接口 */
        const app = {
            vault: {
                read: async () => fileText,
                modify: async (_file: unknown, nextText: string) => {
                    fileText = nextText;
                },
            },
        };

        /** 负责创建 frontmatter 的管理器 */
        const manager = new FrontMatterManager(app as never);

        await manager.setFrontMatter({} as never, "langr-pos", "1");

        expect(fileText).toMatch(/^---\nlangr-pos: "1"\n---\n\n\^\^\^article/);
        expect(fileText).toContain("First paragraph.\n---\nSecond paragraph.");
    });
});
