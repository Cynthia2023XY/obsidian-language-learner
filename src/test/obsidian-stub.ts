/** 测试环境中解析简单 YAML frontmatter 的 Obsidian 替身 */
export function parseYaml(text: string): Record<string, string | boolean | number> {
    /** frontmatter 解析后的键值对象 */
    const result: Record<string, string | boolean | number> = {};

    text.split(/\r?\n/).forEach((line) => {
        /** 当前 YAML 行的键值分隔位置 */
        const delimiterIndex = line.indexOf(":");
        if (delimiterIndex === -1) {
            return;
        }

        /** 当前 YAML 行的字段名 */
        const key = line.slice(0, delimiterIndex).trim();
        /** 当前 YAML 行的字段值 */
        const rawValue = line.slice(delimiterIndex + 1).trim();
        if (!key) {
            return;
        }

        result[key] = parseYamlValue(rawValue);
    });

    return result;
}

/** 测试环境中序列化简单 YAML frontmatter 的 Obsidian 替身 */
export function stringifyYaml(data: Record<string, string | boolean | number>): string {
    return Object.entries(data)
        .map(([key, value]) => `${key}: ${formatYamlValue(value)}`)
        .join("\n") + "\n";
}

/** 将 YAML 字面量转换为测试所需的基础类型 */
function parseYamlValue(value: string): string | boolean | number {
    if (value === "true") {
        return true;
    }
    if (value === "false") {
        return false;
    }
    if (/^-?\d+(\.\d+)?$/.test(value)) {
        return Number(value);
    }

    return value.replace(/^["']|["']$/g, "");
}

/** 将基础类型格式化为测试可断言的 YAML 字面量 */
function formatYamlValue(value: string | boolean | number): string {
    return typeof value === "string" ? JSON.stringify(value) : String(value);
}
