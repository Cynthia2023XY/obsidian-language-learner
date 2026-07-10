import { describe, expect, it } from "vitest";

import { TextParser } from "./parser";

describe("TextParser.normalizeMarkdownText", () => {
    it("把 Markdown 链接和加粗标记转成阅读模式需要的纯文本", () => {
        /** 只调用纯文本归一化逻辑的解析器实例 */
        const parser = Object.create(TextParser.prototype) as TextParser;

        /** 带有 Markdown 链接和强调标记的文章片段 */
        const markdownText = [
            "[[El Niño is forecast](https://www.scientificamerican.com/article/el-nino-is-here-and-could-tip-earth-to-a-new-record-hot-year/)](https://www.scientificamerican.com/article/el-nino-is-here-and-could-tip-earth-to-a-new-record-hot-year/)",
            "**Still** important.",
        ].join("\n");

        expect(parser.normalizeMarkdownText(markdownText)).toBe("El Niño is forecast\nStill important.");
    });

    it("保留正文中的 Markdown 分隔线文本，避免影响 frontmatter 逻辑", () => {
        /** 只调用纯文本归一化逻辑的解析器实例 */
        const parser = Object.create(TextParser.prototype) as TextParser;

        /** 包含 Markdown 分隔线的文章片段 */
        const markdownText = ["First paragraph.", "---", "Second paragraph."].join("\n");

        expect(parser.normalizeMarkdownText(markdownText)).toBe("First paragraph.\n---\nSecond paragraph.");
    });
});

describe("TextParser.highlightElement", () => {
    it("保留 Markdown 标题和图片结构，只高亮其中的文本内容", async () => {
        /** 提供测试所需词库查询能力的解析器实例 */
        const parser = new TextParser({
            db: {
                /** 测试中不预置任何已学习词和短语，所有英文词都应按新词渲染 */
                getStoredWords: async () => ({
                    phrases: [],
                    words: [],
                }),
            },
        } as any);
        /** 模拟 Obsidian MarkdownRenderer 已经渲染好的预览 DOM */
        const container = document.createElement("div");
        container.innerHTML = '<h2>Article Title</h2><p><img src="cover.png" alt="Cover image"></p>';

        await parser.highlightElement(container);

        expect(container.querySelector("h2")).not.toBeNull();
        expect(container.querySelector("img")?.getAttribute("src")).toBe("cover.png");
        expect(container.querySelector("h2 .word")?.textContent).toBe("Article");
        expect(container.querySelector("h2 p")).toBeNull();
    });
});
