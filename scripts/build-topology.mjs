#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const force = args.includes("--force");
const positional = args.filter(arg => arg !== "--force");

if (positional.length !== 2) {
  console.error("用法：node scripts/build-topology.mjs <data.json> <output.html> [--force]");
  process.exit(1);
}

const [inputPath, outputPath] = positional.map(item => path.resolve(item));
const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templatePath = path.join(skillRoot, "assets", "topology-template.html");
const marker = "  const TOPOLOGY_DATA = __TOPOLOGY_DATA__;";

function fail(message) {
  console.error(`拓扑数据无效：${message}`);
  process.exit(1);
}

let data;
try {
  data = JSON.parse(readFileSync(inputPath, "utf8"));
} catch (error) {
  fail(error.message);
}

if (!data || typeof data !== "object" || Array.isArray(data)) fail("根节点必须是对象");
for (const key of ["groups", "nodes", "edges"]) {
  if (!Array.isArray(data[key])) fail(`${key} 必须是数组`);
}
if (data.notes !== undefined && !Array.isArray(data.notes)) fail("notes 必须是数组");

const groupIds = new Set();
data.groups.forEach((group, index) => {
  if (!group || typeof group !== "object") fail(`groups[${index}] 必须是对象`);
  if (group.id === undefined || group.id === "") fail(`groups[${index}] 缺少 id`);
  if (group.name === undefined || group.name === "") fail(`groups[${index}] 缺少 name`);
  const id = String(group.id);
  if (groupIds.has(id)) fail(`分组 ID 重复：${id}`);
  groupIds.add(id);
});

const nodeIds = new Set();
data.nodes.forEach((node, index) => {
  if (!node || typeof node !== "object") fail(`nodes[${index}] 必须是对象`);
  if (node.id === undefined || node.id === "") fail(`nodes[${index}] 缺少 id`);
  if (node.name === undefined || node.name === "") fail(`nodes[${index}] 缺少 name`);
  const id = String(node.id);
  if (nodeIds.has(id)) fail(`节点 ID 重复：${id}`);
  nodeIds.add(id);
});

data.edges.forEach((edge, index) => {
  if (!edge || typeof edge !== "object") fail(`edges[${index}] 必须是对象`);
  const from = String(edge.from ?? edge.source ?? "");
  const to = String(edge.to ?? edge.target ?? "");
  if (!from || !to) fail(`edges[${index}] 缺少 from/to`);
  if (!nodeIds.has(from)) fail(`edges[${index}] 的起点不存在：${from}`);
  if (!nodeIds.has(to)) fail(`edges[${index}] 的终点不存在：${to}`);
});

(data.notes || []).forEach((note, index) => {
  if (!note || typeof note !== "object") fail(`notes[${index}] 必须是对象`);
  if (!String(note.text ?? note.content ?? note.description ?? "")) fail(`notes[${index}] 缺少 text`);
});

const template = readFileSync(templatePath, "utf8");
if (!template.includes(marker)) fail("模板缺少 TOPOLOGY_DATA 注入标记");
if (existsSync(outputPath) && !force) fail(`输出文件已存在：${outputPath}；如需覆盖请添加 --force`);

const serialized = JSON.stringify(data)
  .replace(/</g, "\\u003c")
  .replace(/\u2028/g, "\\u2028")
  .replace(/\u2029/g, "\\u2029");
const html = template.replace(marker, `  const TOPOLOGY_DATA = ${serialized};`);
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, html, "utf8");
console.log(JSON.stringify({
  output: outputPath,
  groups: data.groups.length,
  nodes: data.nodes.length,
  edges: data.edges.length,
  notes: (data.notes || []).length
}, null, 2));
