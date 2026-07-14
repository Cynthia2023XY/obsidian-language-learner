import { unified, Processor } from "unified";
import retextEnglish from "retext-english";
import { Root, Content, Literal, Parent, Sentence } from "nlcst";
import { modifyChildren } from "unist-util-modify-children";
import { visit } from "unist-util-visit";
import { toString } from "nlcst-to-string";

import type { Phrase, Word } from "@/db/interface";
import type Plugin from "@/plugin";

const STATUS_MAP = ["ignore", "learning", "familiar", "known", "learned"];
type AnyNode = Root | Parent | Content | Content[];

export class TextParser {
    // 记录短语位置
    phrases: Phrase[] = [];
    // 记录单词状态
    words: Map<string, Word> = new Map<string, Word>();
    pIdx: number = 0;
    plugin: Plugin;
    processor: Processor;

    constructor(plugin: Plugin) {
        this.plugin = plugin;
        this.processor = unified()
            .use(retextEnglish)
            .use(this.addPhrases())
            .use(this.stringfy2HTML());
    }

    async parse(data: string) {
        let newHTML = await this.text2HTML(data.trim());
        return newHTML;
    }

    async countWords(text: string): Promise<[number, number, number]> {
        text = this.normalizeMarkdownText(text);
        const ast = this.processor.parse(text) as Root;
        let wordSet: Set<string> = new Set();
        visit(ast, "WordNode", (word) => {
            let text = toString(word).toLowerCase();
            if (/[0-9\u4e00-\u9fa5]/.test(text)) return;
            wordSet.add(text);
        });
        let stored = await this.plugin.db.getStoredWords({
            article: "",
            words: [...wordSet],
        });
        let ignore = 0;
        stored.words.forEach((word) => {
            if (word.status === 0) ignore++;
        });
        let learn = stored.words.length - ignore;
        let unknown = wordSet.size - stored.words.length;
        return [unknown, learn, ignore];
    }

    async text2HTML(text: string) {
        text = this.normalizeMarkdownText(text);
        /** 当前待渲染文本对应的自然语言语法树 */
        const ast = await this.prepareHTMLContext(text);

        let HTML = this.processor.stringify(ast) as any as string;
        return HTML;
    }

    /** 把单个 Markdown 文本节点转换为可嵌入标题、链接等结构内部的单词高亮 HTML */
    async text2InlineHTML(text: string): Promise<string> {
        /** 当前文本节点对应的自然语言语法树 */
        const ast = await this.prepareHTMLContext(text);

        return this.toInlineHTMLString(ast);
    }

    /** 为一段文本准备短语和单词状态上下文，供块级和行内渲染复用 */
    async prepareHTMLContext(text: string): Promise<Root> {
        this.pIdx = 0;
        this.words.clear();

        // 查找文本中的已知词组，用于构造ast中的PhraseNode
        this.phrases = (
            await this.plugin.db.getStoredWords({
                article: text.toLowerCase(),
                words: [],
            })
        ).phrases;

        /** 当前待渲染文本对应的自然语言语法树 */
        const ast = this.processor.parse(text) as Root;

        /** 文章片段中去重后的单词集合 */
        let wordSet: Set<string> = new Set();
        visit(ast, "WordNode", (word) => {
            wordSet.add(toString(word).toLowerCase());
        });

        /** 已在词库中保存过状态的单词数据 */
        let stored = await this.plugin.db.getStoredWords({
            article: "",
            words: [...wordSet],
        });

        stored.words.forEach((w) => this.words.set(w.text, w));

        return ast;
    }

    /** 在 Obsidian 已渲染出的 Markdown DOM 中只替换文本节点，保留标题、图片等 Markdown 结构 */
    async highlightElement(element: HTMLElement): Promise<void> {
        /** 需要进行单词高亮替换的纯文本节点 */
        const textNodes: Text[] = [];
        /** 用于遍历 Markdown 渲染结果中所有文本节点的游标 */
        const walker = element.ownerDocument.createTreeWalker(element, 4);
        /** 当前遍历到的 DOM 节点 */
        let currentNode = walker.nextNode();

        while (currentNode) {
            /** 当前文本节点的父元素，用于判断是否适合替换 */
            const parentElement = currentNode.parentElement;
            if (parentElement && this.shouldHighlightTextNode(currentNode as Text, parentElement)) {
                textNodes.push(currentNode as Text);
            }
            currentNode = walker.nextNode();
        }

        for (const textNode of textNodes) {
            /** 当前文本节点转成的行内高亮 HTML */
            const inlineHTML = await this.text2InlineHTML(textNode.textContent || "");
            /** 用于把高亮 HTML 安全转换成 DOM 片段的模板容器 */
            const template = element.ownerDocument.createElement("template");
            template.innerHTML = inlineHTML;
            textNode.replaceWith(template.content);
        }
    }

    /** 判断 Markdown 渲染后的文本节点是否应该参与阅读模式单词高亮 */
    shouldHighlightTextNode(textNode: Text, parentElement: HTMLElement): boolean {
        if (!textNode.textContent?.trim()) {
            return false;
        }

        return !parentElement.closest("script, style, pre, code, .word, .phrase, .select");
    }

    async getWordsPhrases(text: string) {
        text = this.normalizeMarkdownText(text);
        const ast = this.processor.parse(text);
        let words: Set<string> = new Set();
        visit(ast, "WordNode", (word) => {
            words.add(toString(word).toLowerCase());
        });
        let wordsPhrases = await this.plugin.db.getStoredWords({
            article: text.toLowerCase(),
            words: [...words],
        });

        let payload = [] as string[];
        wordsPhrases.phrases.forEach((word) => {
            if (word.status > 0) payload.push(word.text);
        });
        wordsPhrases.words.forEach((word) => {
            if (word.status > 0) payload.push(word.text);
        });

        let res = await this.plugin.db.getExpressionsSimple(payload);
        return res;
    }

    /** 获取阅读正文中尚未写入词库的新单词，用于结束阅读时批量置为无视 */
    async getNewWords(text: string): Promise<string[]> {
        text = this.normalizeMarkdownText(text);

        /** 当前文章纯文本对应的自然语言语法树 */
        const ast = this.processor.parse(text) as Root;
        /** 当前文章中去重后的有效英文单词集合 */
        const wordSet: Set<string> = new Set();
        visit(ast, "WordNode", (word) => {
            /** 当前语法节点提取出的单词小写文本 */
            const wordText = toString(word).toLowerCase();
            if (/[0-9\u4e00-\u9fa5]/.test(wordText)) return;
            wordSet.add(wordText);
        });

        /** 当前文章中已经存在于词库的单词集合 */
        const storedWords = await this.plugin.db.getStoredWords({
            article: "",
            words: [...wordSet],
        });
        /** 已入库单词文本的快速查询集合 */
        const storedWordSet = new Set(storedWords.words.map((word) => word.text));

        return [...wordSet].filter((word) => !storedWordSet.has(word));
    }

    /** 将阅读正文中的常见 Markdown 语法转成用户实际看到的纯文本 */
    normalizeMarkdownText(text: string): string {
        return text
            .replace(/!\[([^\]]*)\]\(([^)]*)\)/g, "$1")
            .replace(/\[\[([^\]]+?)\]\(([^)]*)\)\]\(([^)]*)\)/g, "$1")
            .replace(/\[([^\]]+)\]\(([^)]*)\)/g, "$1")
            .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
            .replace(/\[\[([^\]]+)\]\]/g, "$1")
            .replace(/`([^`]+)`/g, "$1")
            .replace(/\*\*\*([^*]+)\*\*\*/g, "$1")
            .replace(/___([^_]+)___/g, "$1")
            .replace(/\*\*([^*]+)\*\*/g, "$1")
            .replace(/__([^_]+)__/g, "$1")
            .replace(/\*([^*]+)\*/g, "$1")
            .replace(/_([^_]+)_/g, "$1")
            .replace(/~~([^~]+)~~/g, "$1")
            .replace(/==([^=]+)==/g, "$1");
    }

    // Plugin：在retextEnglish基础上，把AST上一些单词包裹成短语
    addPhrases() {
        let selfThis = this;
        return function (option = {}) {
            const proto = this.Parser.prototype;
            proto.useFirst("tokenizeParagraph", selfThis.phraseModifier);
        };
    }

    phraseModifier = modifyChildren(this.wrapWord2Phrase.bind(this));

    wrapWord2Phrase(node: Content, index: number, parent: Parent) {
        if (!node.hasOwnProperty("children")) return;

        if (
            this.pIdx >= this.phrases.length ||
            node.position.end.offset <= this.phrases[this.pIdx].offset
        )
            return;

        let children = (node as Sentence).children;

        let p: number;
        while (
            (p = children.findIndex(
                (child) =>
                    child.position.start.offset ===
                    this.phrases[this.pIdx].offset
            )) !== -1
        ) {
            let q = children.findIndex(
                (child) =>
                    child.position.end.offset ===
                    this.phrases[this.pIdx].offset +
                    this.phrases[this.pIdx].text.length
            );

            if (q === -1) {
                this.pIdx++;
                return;
            }
            let phrase = children.slice(p, q + 1);
            children.splice(p, q - p + 1, {
                type: "PhraseNode",
                children: phrase,
                position: {
                    start: { ...phrase.first().position.start },
                    end: { ...phrase.last().position.end },
                },
            } as any);

            this.pIdx++;

            if (
                this.pIdx >= this.phrases.length ||
                node.position.end.offset <= this.phrases[this.pIdx].offset
            )
                return;
        }
    }

    // Compiler部分: 在AST转换为string时包裹上相应标签
    stringfy2HTML() {
        let selfThis = this;
        return function () {
            Object.assign(this, {
                Compiler: selfThis.compileHTML.bind(selfThis),
            });
        };
    }

    compileHTML(tree: Root): string {
        return this.toHTMLString(tree);
    }

    toHTMLString(node: AnyNode): string {
        if (node.hasOwnProperty("value")) {
            return (node as Literal).value;
        }
        if (node.hasOwnProperty("children")) {
            let n = node as Parent;
            switch (n.type) {
                case "WordNode": {
                    let text = toString(n.children);
                    let textLower = text.toLowerCase();
                    let status = this.words.has(textLower)
                        ? STATUS_MAP[this.words.get(textLower).status]
                        : "new";

                    return /[0-9\u4e00-\u9fa5]/.test(text) // 不把数字当做单词
                        ? `<span class="other">${text}</span>`
                        : `<span class="word ${status}">${text}</span>`;
                }
                case "PhraseNode": {
                    let childText = toString(n.children);
                    let text = this.toHTMLString(n.children);
                    // 获取词组的status
                    let phrase = this.phrases.find(
                        (p) => p.text === childText.toLowerCase()
                    );
                    let status = STATUS_MAP[phrase.status];

                    return `<span class="phrase ${status}">${text}</span>`;
                }
                case "SentenceNode": {
                    return `<span class="stns">${this.toHTMLString(
                        n.children
                    )}</span>`;
                }
                case "ParagraphNode": {
                    return `<p>${this.toHTMLString(n.children)}</p>`;
                }
                default: {
                    return `<div class="article">${this.toHTMLString(
                        n.children
                    )}</div>`;
                }
            }
        }
        if (Array.isArray(node)) {
            let nodes = node as Content[];
            return nodes.map((n) => this.toHTMLString(n)).join("");
        }
    }

    /** 输出适合嵌入 Markdown 既有标签内部的行内高亮 HTML，避免在标题内再生成段落标签 */
    toInlineHTMLString(node: AnyNode): string {
        if (node.hasOwnProperty("value")) {
            return (node as Literal).value;
        }
        if (node.hasOwnProperty("children")) {
            /** 当前需要转换为行内 HTML 的父级语法节点 */
            let n = node as Parent;
            switch (n.type) {
                case "WordNode":
                case "PhraseNode":
                case "SentenceNode": {
                    return this.toHTMLString(n);
                }
                default: {
                    return this.toInlineHTMLString(n.children);
                }
            }
        }
        if (Array.isArray(node)) {
            /** 当前父节点下待拼接的子节点列表 */
            let nodes = node as Content[];
            return nodes.map((n) => this.toInlineHTMLString(n)).join("");
        }
    }
}
