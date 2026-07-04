# `pdd init` — harness "claude" + paths nativos + menu com moldura — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `pdd init` ganha um harness `claude` (grava `.claude/skills/`), cada
harness passa a escrever na sua própria pasta nativa de skill (em vez do
`.agents/skills/` compartilhado que só valia pra codex/gemini/copilot), o
menu interativo não vem mais pré-marcado nem mostra hint de "detected", e o
visual ganha uma moldura de box-drawing (estilo `agentop start`).

**Architecture:** Mudança cirúrgica em três arquivos puros/testáveis
(`adapt.ts`, `prompt.ts`) + fiação no entrypoint (`index.ts`). Sem
dependências novas — mantém o zero-npm-runtime-deps do projeto.

**Tech Stack:** TypeScript rodando via Bun (dev/test) ou Node (`dist/pdd.js`
buildado com esbuild). Testes com `bun:test` (`bun test scripts/pdd`).

## Global Constraints

- Zero dependências de runtime — nada de pacotes novos, só `node:*` builtins.
- Comentários e identificadores em inglês (convenção já usada no repo);
  strings de saída do CLI também em inglês (é o padrão de todo o `index.ts`
  hoje — "Cancelled — nothing installed.", "Updating PDD…", etc.).
- Toda alteração em `adapt.ts`/`prompt.ts` precisa de teste em
  `adapt.test.ts`/`prompt.test.ts` cobrindo o comportamento novo antes de
  mexer no `index.ts` (TDD: teste falha → implementa → teste passa).
- Rodar `bun test scripts/pdd` depois de cada task e ele tem que passar
  100% (nenhum teste existente pode quebrar).
- Commits pequenos e frequentes, um por task.

---

### Task 1: `Harness` ganha `"claude"` e cada harness escreve na sua pasta nativa de skill

**Files:**
- Modify: `scripts/pdd/adapt.ts:28-67` (tipo `Harness`, `AGENTS_SKILLS_HARNESSES`, `renderSkillFor`, `baseDirFor`)
- Test: `scripts/pdd/adapt.test.ts:40-73`

**Interfaces:**
- Consumes: nada de tasks anteriores (primeira task).
- Produces: `export type Harness = "claude" | "codex" | "cursor" | "copilot" | "gemini"`;
  `renderSkillFor(harness: Harness, skill: Skill, global: boolean): { relPath: string; content: string }`
  (assinatura muda: ganha o parâmetro `global`, porque o Copilot usa pasta
  diferente em escopo global — `.copilot/skills` — vs. projeto —
  `.github/skills`);
  `baseDirFor(projectRoot: string, global: boolean): string` (perde o
  parâmetro `harness` — deixou de ser necessário, porque agora `relPath` já
  inclui o prefixo de pasta específico de cada harness em ambos os escopos).

- [ ] **Step 1: Escrever os testes que falham (novo comportamento por harness + assinatura nova)**

Substitua os testes de `renderSkillFor`/`baseDirFor` em
`scripts/pdd/adapt.test.ts` (linhas 40-73) por:

```ts
test("codex writes its own .agents/skills/<name>/SKILL.md convention", () => {
  const out = renderSkillFor("codex", parseSkill(SAMPLE), false);
  expect(out.relPath).toBe(".agents/skills/audit-new/SKILL.md");
  expect(out.content).toMatch(/^---\nname: audit-new\ndescription:/);
  expect(out.content).not.toContain("$ARGUMENTS");
});

test("cursor writes .cursor/skills/<name>/SKILL.md (own convention, not .agents)", () => {
  const out = renderSkillFor("cursor", parseSkill(SAMPLE), false);
  expect(out.relPath).toBe(".cursor/skills/audit-new/SKILL.md");
  expect(out.content).not.toContain("$ARGUMENTS");
});

test("gemini writes .gemini/skills/<name>/SKILL.md", () => {
  const out = renderSkillFor("gemini", parseSkill(SAMPLE), false);
  expect(out.relPath).toBe(".gemini/skills/audit-new/SKILL.md");
});

test("copilot writes .github/skills/<name>/SKILL.md in a project, .copilot/skills/ globally", () => {
  const project = renderSkillFor("copilot", parseSkill(SAMPLE), false);
  expect(project.relPath).toBe(".github/skills/audit-new/SKILL.md");
  const global = renderSkillFor("copilot", parseSkill(SAMPLE), true);
  expect(global.relPath).toBe(".copilot/skills/audit-new/SKILL.md");
});

test("claude writes .claude/skills/<name>/SKILL.md and keeps $ARGUMENTS + 'Claude' mentions", () => {
  const skill = parseSkill(SAMPLE.replace("$ARGUMENTS", "$ARGUMENTS between the dev and Claude"));
  const out = renderSkillFor("claude", skill, false);
  expect(out.relPath).toBe(".claude/skills/audit-new/SKILL.md");
  expect(out.content).toContain("$ARGUMENTS");
  expect(out.content).toContain("Claude");
});

test("baseDirFor is projectRoot for project scope, homedir() for global — no harness-specific logic needed", () => {
  expect(baseDirFor("/proj", false)).toBe("/proj");
  expect(baseDirFor("/proj", true)).toBe(homedir());
});
```

Isso substitui inteiramente as 5 tests hoje nas linhas 40-73 (as três "shared
.agents/skills" viram as três primeiras acima com `global` explícito; a de
cursor e a de `baseDirFor` viram as duas últimas).

Mais abaixo no mesmo arquivo já existe (fora do range 40-73, não mexemos na
posição dela) o teste `"adapted commands are agent-neutral (no 'Claude'
leakage)"` — ele **não muda de comportamento**, só precisa do novo terceiro
argumento em `renderSkillFor`. Troque a única linha que chama `renderSkillFor`
dentro dele:

```ts
    expect(renderSkillFor(h, skill).content).not.toContain("Claude");
```

por:

```ts
    expect(renderSkillFor(h, skill, false).content).not.toContain("Claude");
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `bun test scripts/pdd/adapt.test.ts`
Expected: FAIL — `renderSkillFor` só aceita 2 argumentos hoje, `baseDirFor`
exige `harness` como primeiro argumento, e os `relPath` esperados
(`.cursor/skills/...`, `.gemini/skills/...`, `.github/skills/...`,
`.claude/skills/...`) não batem com a implementação atual.

- [ ] **Step 3: Reescrever `renderSkillFor` e `baseDirFor` em `adapt.ts`**

Em `scripts/pdd/adapt.ts`, substitua a linha 28 e o bloco das linhas 30-39
(`export type Harness = ...` até o fechamento do comentário de
`AGENTS_SKILLS_HARNESSES`) por:

```ts
export type Harness = "claude" | "codex" | "cursor" | "copilot" | "gemini";

/**
 * Each harness discovers skills in its own convention today (verified
 * against each vendor's docs, jul/2026): Codex CLI popularized
 * `.agents/skills/`, but Cursor/Copilot/Gemini/Claude each also ship (and
 * document as primary) their own harness-named directory. Copilot is the
 * only one whose global (home-scoped) directory name differs from its
 * project directory name — `.github/skills` in a repo, `.copilot/skills` in
 * `$HOME` — because `~/.github` isn't a thing Copilot reads.
 */
const PROJECT_SKILL_DIR: Record<Harness, string> = {
  claude: ".claude/skills",
  codex: ".agents/skills",
  cursor: ".cursor/skills",
  copilot: ".github/skills",
  gemini: ".gemini/skills",
};

const GLOBAL_SKILL_DIR: Record<Harness, string> = {
  ...PROJECT_SKILL_DIR,
  copilot: ".copilot/skills",
};
```

Depois, substitua a função `renderSkillFor` inteira (a partir do comentário
`/** Render one skill for a harness ... */` até o `}` de fechamento — hoje
linhas 52-67) por:

```ts
/** Render one skill for a harness → the relative output path and file content. */
export function renderSkillFor(
  harness: Harness,
  skill: Skill,
  global: boolean,
): { relPath: string; content: string } {
  // Claude Code is the skill's native home — it already understands
  // $ARGUMENTS and "Claude"/"Claude Code" mentions, so leave the body as-is.
  const body = harness === "claude" ? skill.body : deClaude(withArgs(skill.body));
  const description = harness === "claude" ? skill.description : deClaude(skill.description);
  const dir = global ? GLOBAL_SKILL_DIR[harness] : PROJECT_SKILL_DIR[harness];
  return {
    relPath: `${dir}/${skill.name}/SKILL.md`,
    content: `---\nname: ${skill.name}\ndescription: ${description}\n---\n\n${body}\n`,
  };
}
```

E substitua `baseDirFor` inteira (hoje linhas 69-78) por:

```ts
/** Base directory a harness writes into (global = user home, else the project root). */
export function baseDirFor(projectRoot: string, global: boolean): string {
  return global ? homedir() : projectRoot;
}
```

- [ ] **Step 4: Atualizar a chamada em `adaptAll` pra nova assinatura**

Em `scripts/pdd/adapt.ts`, na função `adaptAll` (hoje linhas 174-190), troque:

```ts
  const base = baseDirFor(harness, opts.projectRoot, opts.global);
  const written: string[] = [];
  for (const skill of readSkills(opts.skillsDir)) {
    const { relPath, content } = renderSkillFor(harness, skill);
```

por:

```ts
  const base = baseDirFor(opts.projectRoot, opts.global);
  const written: string[] = [];
  for (const skill of readSkills(opts.skillsDir)) {
    const { relPath, content } = renderSkillFor(harness, skill, opts.global);
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `bun test scripts/pdd/adapt.test.ts`
Expected: PASS (todos os testes do arquivo, incluindo os inalterados de
`parseSkill`, `assertSafeProjectRoot`, `rulesTargetFor`, `rulesFileContent`,
`upsertBlock`).

- [ ] **Step 6: Commit**

```bash
git add scripts/pdd/adapt.ts scripts/pdd/adapt.test.ts
git commit -m "feat(adapt): cada harness grava na sua própria pasta nativa de skill, adiciona claude"
```

---

### Task 2: `claude` não recebe arquivo de regra sempre-ativa

**Files:**
- Modify: `scripts/pdd/adapt.ts` (`rulesTargetFor`, `writeRules`, `adaptAll`)
- Test: `scripts/pdd/adapt.test.ts:89-94`

**Interfaces:**
- Consumes: `Harness` de Task 1.
- Produces: `rulesTargetFor(harness: Harness): { relPath: string; mode: "overwrite" | "block" } | null`;
  `writeRules(harness: Harness, projectRoot: string): string | null`.

- [ ] **Step 1: Escrever o teste que falha**

Adicione em `scripts/pdd/adapt.test.ts`, logo depois do teste
`"rulesTargetFor picks the right file + mode per harness"` (linha 94):

```ts
test("rulesTargetFor returns null for claude — the plugin's session hook already covers update-awareness", () => {
  expect(rulesTargetFor("claude")).toBeNull();
});
```

E adicione, depois do teste `"upsertBlock inserts once and is idempotent on re-run"` (fim do arquivo),
um teste de integração leve pra `writeRules`/`adaptAll` usando um diretório
temporário real (o arquivo já não tinha testes de IO antes — este é o
primeiro):

```ts
test("adaptAll writes no rules file for claude, only the skill files", () => {
  const dir = mkdtempSync(join(tmpdir(), "pdd-adapt-test-"));
  try {
    const skillsDir = join(dir, "skills", "sample-skill");
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(join(skillsDir, "SKILL.md"), SAMPLE);
    const projectRoot = join(dir, "project");
    mkdirSync(projectRoot, { recursive: true });

    const written = adaptAll("claude", {
      skillsDir: join(dir, "skills"),
      projectRoot,
      global: false,
    });

    expect(written).toEqual([join(projectRoot, ".claude/skills/audit-new/SKILL.md")]);
    expect(existsSync(join(projectRoot, "CLAUDE.md"))).toBe(false);
    expect(existsSync(join(projectRoot, "AGENTS.md"))).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

Atualize os imports no topo do arquivo de teste — hoje ele só importa
`homedir` de `node:os` e não importa nada de `node:path`/`node:fs`. Vira:

```ts
import { test, expect } from "bun:test";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import {
  parseSkill,
  renderSkillFor,
  baseDirFor,
  rulesTargetFor,
  rulesFileContent,
  upsertBlock,
  assertSafeProjectRoot,
  adaptAll,
} from "./adapt";
```

(mantém tudo que já era importado de `./adapt` — só acrescenta `adaptAll` —
e acrescenta os três novos imports de `node:os`/`node:path`/`node:fs`.)

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `bun test scripts/pdd/adapt.test.ts`
Expected: FAIL — `rulesTargetFor("claude")` hoje cai no `default` implícito
do switch (TypeScript sem `case "claude"` retorna `undefined` em runtime, o
que já quebraria de forma diferente/inconsistente — o teste de tipo vai
falhar na compilação do Bun antes mesmo de rodar, já que o switch não é
exaustivo para o novo `Harness`); o teste de `adaptAll` falha porque `written`
hoje incluiria também o path de `writeRules`.

- [ ] **Step 3: Atualizar `rulesTargetFor` e `writeRules` em `adapt.ts`**

Troque a assinatura e o `switch` de `rulesTargetFor` (hoje linhas 107-120):

```ts
/** Where the always-on rule goes for a harness, and how to write it. Claude
 * gets none — the plugin's session hook already provides update-awareness. */
export function rulesTargetFor(
  harness: Harness,
): { relPath: string; mode: "overwrite" | "block" } | null {
  switch (harness) {
    case "cursor":
      return { relPath: ".cursor/rules/pdd.mdc", mode: "overwrite" };
    case "copilot":
      return { relPath: ".github/instructions/pdd.instructions.md", mode: "overwrite" };
    case "codex":
      return { relPath: "AGENTS.md", mode: "block" };
    case "gemini":
      return { relPath: "GEMINI.md", mode: "block" };
    case "claude":
      return null;
  }
}
```

Troque `writeRules` (hoje linhas 143-155):

```ts
/** Write the always-on rule for a harness into the project. Returns its
 * path, or null if this harness doesn't need one (see rulesTargetFor). */
export function writeRules(harness: Harness, projectRoot: string): string | null {
  const target = rulesTargetFor(harness);
  if (!target) return null;
  const { relPath, mode } = target;
  const targetPath = join(projectRoot, relPath);
  mkdirSync(join(targetPath, ".."), { recursive: true });
  if (mode === "overwrite") {
    writeFileSync(targetPath, rulesFileContent(harness));
  } else {
    const existing = existsSync(targetPath) ? readFileSync(targetPath, "utf8") : "";
    writeFileSync(targetPath, upsertBlock(existing, rulesBody()));
  }
  return targetPath;
}
```

- [ ] **Step 4: Atualizar `adaptAll` pra tratar `writeRules` retornando `null`**

Em `adaptAll` (hoje linha 188):

```ts
  if (opts.rules !== false) written.push(writeRules(harness, opts.projectRoot));
```

vira:

```ts
  if (opts.rules !== false) {
    const rulePath = writeRules(harness, opts.projectRoot);
    if (rulePath) written.push(rulePath);
  }
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `bun test scripts/pdd/adapt.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/pdd/adapt.ts scripts/pdd/adapt.test.ts
git commit -m "feat(adapt): claude não recebe arquivo de regra — o hook do plugin já cobre isso"
```

---

### Task 3: Menu com moldura de box-drawing, sem hint de detecção embutido

**Files:**
- Modify: `scripts/pdd/prompt.ts:82-108` (`renderMenu`)
- Test: `scripts/pdd/prompt.test.ts:40-47`

**Interfaces:**
- Consumes: nada das tasks anteriores.
- Produces: `renderMenu(title: string, items: MenuItem[], s: MenuState, multi: boolean): string`
  — assinatura **não muda**; só o texto renderizado ganha moldura e recuo.

- [ ] **Step 1: Escrever os testes que falham**

Adicione em `scripts/pdd/prompt.test.ts`, depois do teste existente
`"renderMenu shows checkboxes, the cursor and a hint line"`:

```ts
test("renderMenu wraps the title in a heavy box-drawing frame", () => {
  const s: MenuState = { cursor: 0, checked: new Set() };
  const out = renderMenu("Install PDD commands for which agents?", [{ label: "claude" }], s, true);
  expect(out).toContain("┏");
  expect(out).toContain("┃");
  expect(out).toContain("┗");
  expect(out).toContain("Install PDD commands for which agents?");
});

test("renderMenu indents items and the footer under the frame", () => {
  const s: MenuState = { cursor: 0, checked: new Set() };
  const out = renderMenu("Pick", [{ label: "claude" }, { label: "codex" }], s, true);
  const lines = out.split("\n");
  const claudeLine = lines.find((l) => l.includes("claude"));
  expect(claudeLine?.startsWith("  ")).toBe(true);
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `bun test scripts/pdd/prompt.test.ts`
Expected: FAIL — `renderMenu` hoje não emite nenhum caractere `┏`/`┃`/`┗`, e
as linhas de item não têm recuo de dois espaços.

- [ ] **Step 3: Reescrever `renderMenu` em `prompt.ts`**

Adicione, logo antes de `export function renderMenu` (hoje linha 82), uma
função auxiliar privada:

```ts
/** Wrap a title in a heavy box-drawing frame, centered, min 40 cols wide. */
function frameTitle(title: string): string {
  const width = Math.max(40, title.length + 4);
  const pad = width - title.length;
  const left = Math.floor(pad / 2);
  const right = pad - left;
  return [
    "┏" + "━".repeat(width) + "┓",
    "┃" + " ".repeat(left) + title + " ".repeat(right) + "┃",
    "┗" + "━".repeat(width) + "┛",
  ].join("\n");
}
```

Substitua o corpo de `renderMenu` (hoje linhas 87-108) por:

```ts
export function renderMenu(
  title: string,
  items: MenuItem[],
  s: MenuState,
  multi: boolean,
): string {
  const lines = [c.bold(frameTitle(title)), ""];
  items.forEach((it, i) => {
    const pointer = i === s.cursor ? c.cyan("❯") : " ";
    const box = multi
      ? s.checked.has(i)
        ? c.green("◉")
        : "◯"
      : i === s.cursor
        ? c.green("◉")
        : "◯";
    const label = i === s.cursor ? c.bold(it.label) : it.label;
    lines.push(`  ${pointer} ${box} ${label}${it.hint ? c.dim("  " + it.hint) : ""}`);
  });
  lines.push("");
  lines.push(
    c.dim(
      multi
        ? "  ↑/↓ move · space toggle · a all · enter confirm · esc cancel"
        : "  ↑/↓ move · enter select · esc cancel",
    ),
  );
  return lines.join("\n");
}
```

(o `MenuItem.hint` continua existindo e sendo renderizado — ele não some do
tipo nem da função; só deixa de ser *preenchido* com "detected" no
`index.ts`, tarefa da próxima task. A tela de escopo project/global, que usa
`hint` pra mostrar o path, continua funcionando sem nenhuma mudança aqui.)

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `bun test scripts/pdd/prompt.test.ts`
Expected: PASS (incluindo o teste pré-existente que checa `"detected"` — ele
passa um item com `hint: "detected"` explicitamente, então continua válido:
o mecanismo de hint não foi removido, só o uso dele pra marcar detecção no
`index.ts`).

- [ ] **Step 5: Commit**

```bash
git add scripts/pdd/prompt.ts scripts/pdd/prompt.test.ts
git commit -m "feat(prompt): moldura de box-drawing no título do menu interativo"
```

---

### Task 4: Fiar tudo em `index.ts` — claude na lista, sem pré-seleção, dica de plugin

**Files:**
- Modify: `scripts/pdd/index.ts:127-227, 142-172, 254-276, 278-297`

**Interfaces:**
- Consumes: `Harness` (Task 1, agora inclui `"claude"`), `renderMenu`/`runMenu`
  (Task 3, já não precisa de `preChecked` pra funcionar bem sem pré-seleção).
- Produces: nenhuma interface nova exportada — este é o entrypoint.

- [ ] **Step 1: Adicionar `claude` a `detectHarnesses`**

Em `scripts/pdd/index.ts`, na função `detectHarnesses` (hoje linhas 128-140):

```ts
/** Detect which agents are present, by a binary on PATH or a config directory. */
function detectHarnesses(all: Harness[], projectRoot: string): Harness[] {
  const home = process.env.HOME ?? "";
  const has = (bin: string, dir: string) =>
    Boolean(whichBin(bin)) || (dir !== "" && existsSync(dir));
  const map: Record<Harness, boolean> = {
    claude: has("claude", join(home, ".claude")),
    codex: has("codex", join(home, ".codex")),
    cursor: has("cursor", join(home, ".cursor")),
    gemini: has("gemini", join(home, ".gemini")),
    // Copilot is a VS Code/JetBrains feature — infer from a project .github dir.
    copilot: existsSync(join(projectRoot, ".github")),
  };
  return all.filter((h) => map[h]);
}
```

(só a linha `claude: has(...)` é nova; o resto do corpo é idêntico ao atual.)

- [ ] **Step 2: Constante `IS_GIT_CLONE` e mensagem de dica de plugin**

Logo depois da definição de `SKILLS_DIR` (hoje linha 46), adicione:

```ts
// True when running from a plain git clone (not the Claude Code plugin
// cache) — used to nudge users toward the plugin install path, which gets
// native skills + auto-update for free instead of manually adapted files.
const IS_GIT_CLONE = existsSync(join(PLUGIN_ROOT, ".git"));

const PLUGIN_INSTALL_TIP =
  "💡 Running from a git clone. For native skills + auto-update in Claude Code:\n" +
  "   claude plugin marketplace add blpsoares/parity-driven-development\n" +
  "   claude plugin install pdd@parity-driven-development\n";
```

- [ ] **Step 3: Reusar `IS_GIT_CLONE` em `runUpdate`**

Em `runUpdate` (hoje linhas 143-153), troque:

```ts
async function runUpdate(): Promise<void> {
  const isGitClone = existsSync(join(PLUGIN_ROOT, ".git"));
  if (!isGitClone) {
```

por:

```ts
async function runUpdate(): Promise<void> {
  if (!IS_GIT_CLONE) {
```

E, no mesmo `if`, atualize a lista de harnesses citada na mensagem (hoje
linha 150) — troque `"Then run 'pdd init' to refresh any Codex/Cursor/Copilot/Gemini command files.\n"`
por `"Then run 'pdd init' to refresh any Codex/Cursor/Copilot/Gemini/Claude command files.\n"`.

Mais abaixo na mesma função (hoje linha 164), troque:

```ts
  const all: Harness[] = ["codex", "cursor", "copilot", "gemini"];
```

por:

```ts
  const all: Harness[] = ["claude", "codex", "cursor", "copilot", "gemini"];
```

- [ ] **Step 4: Reescrever `runInit` — claude na lista, sem pré-seleção, dica de plugin**

Substitua a função `runInit` inteira (hoje linhas 174-227) por:

```ts
/** Install PDD commands — interactive (specify-init style) when run in a TTY. */
async function runInit(args: string[]): Promise<void> {
  const all: Harness[] = ["claude", "codex", "cursor", "copilot", "gemini"];
  const projectRoot = process.cwd();
  const skillsDir = SKILLS_DIR;
  const explicit = args.slice(1).filter((a): a is Harness => all.includes(a as Harness));
  const detected = detectHarnesses(all, projectRoot);

  if (IS_GIT_CLONE) process.stdout.write(PLUGIN_INSTALL_TIP + "\n");

  let targets: Harness[];
  let global = args.includes("--global");

  // Non-interactive: explicit harness args, a piped stdin, or an explicit scope flag.
  if (explicit.length > 0 || !process.stdin.isTTY || args.includes("--global")) {
    targets = explicit.length > 0 ? explicit : detected;
    if (targets.length === 0) {
      process.stdout.write(
        "No agent detected. Try: pdd init claude | codex | cursor | copilot | gemini\n",
      );
      return;
    }
  } else {
    // Interactive — nothing pre-checked; the user picks explicitly every time.
    const items = all.map((h) => ({ label: h }));
    const picked = await runMenu("Install PDD commands for which agents?", items, {
      multi: true,
    });
    if (!picked || picked.length === 0) {
      process.stdout.write("Cancelled — nothing installed.\n");
      return;
    }
    targets = picked.map((i) => all[i]);

    const scope = await runMenu(
      "Install scope?",
      [{ label: "project", hint: projectRoot }, { label: "global", hint: "your home config" }],
      { multi: false },
    );
    if (scope === null) {
      process.stdout.write("Cancelled — nothing installed.\n");
      return;
    }
    global = scope[0] === 1;
  }

  process.stdout.write("\n");
  for (const harness of targets) {
    const written = adaptAll(harness, { skillsDir, projectRoot, global, rules: !args.includes("--no-rules") });
    const where = global ? "home config" : "project";
    process.stdout.write(`✅ ${harness} → ${written.length} command(s) in ${where}\n`);
  }
  process.stdout.write("\nInvoke /audit-bootstrap in your agent to begin.\n");
}
```

(diferenças do original: `all` ganha `"claude"`; bloco `if (IS_GIT_CLONE)`
novo logo após calcular `detected`; a mensagem de "No agent detected" cita
`claude`; o bloco interativo não calcula mais `preChecked` nem passa `hint`
com "detected" pros itens — só `{ label: h }` — e não passa `preChecked` pro
`runMenu`.)

- [ ] **Step 5: Atualizar o comando `adapt` e o texto de ajuda em `main`**

Em `main` (hoje linha 255):

```ts
    const harnesses: Harness[] = ["codex", "cursor", "copilot", "gemini"];
```

vira:

```ts
    const harnesses: Harness[] = ["claude", "codex", "cursor", "copilot", "gemini"];
```

E no bloco de usage (hoje linhas 278-297), troque a linha:

```ts
        "  pdd adapt <harness>       Generate command files for one of Codex/Cursor/Copilot/Gemini\n" +
```

por:

```ts
        "  pdd adapt <harness>       Generate command files for one of Claude/Codex/Cursor/Copilot/Gemini\n" +
```

- [ ] **Step 6: Rodar a suíte inteira e confirmar que passa**

Run: `bun test scripts/pdd`
Expected: PASS — todos os arquivos de teste (`adapt.test.ts`, `i18n.test.ts`,
`prompt.test.ts`, `render.test.ts`, `state.test.ts`, `tui.test.ts`,
`update.test.ts`) verdes, incluindo os que não foram tocados nesta task.

- [ ] **Step 7: Commit**

```bash
git add scripts/pdd/index.ts
git commit -m "feat(init): adiciona harness claude, remove pré-seleção, dica de instalação via plugin"
```

---

### Task 5: Verificação manual end-to-end

**Files:** nenhum arquivo novo — só validação funcional do que as Tasks 1-4
produziram.

**Interfaces:**
- Consumes: todas as anteriores.
- Produces: nada — é o gate final antes de considerar a feature pronta.

- [ ] **Step 1: Rodar a suíte completa de novo, do zero**

Run: `bun test scripts/pdd`
Expected: PASS (todos os arquivos).

- [ ] **Step 2: Smoke test não-interativo — `pdd adapt claude` gera o arquivo certo**

Run (a partir da raiz do repo, num diretório temporário pra não sujar o
projeto real):

```bash
mkdir -p /tmp/pdd-smoke-test && cd /tmp/pdd-smoke-test && \
  bun run /home/mithrandir/parity-driven-development/scripts/pdd/index.ts adapt claude
```

Expected: saída `Wrote N claude command file(s):` listando caminhos
terminando em `.claude/skills/<nome-da-skill>/SKILL.md` dentro de
`/tmp/pdd-smoke-test`. Confira um dos arquivos gerados
(`cat /tmp/pdd-smoke-test/.claude/skills/*/SKILL.md | head -20`) e confirme
que o frontmatter tem `name:`/`description:` e o corpo preserva `$ARGUMENTS`
sem reescrever pra linguagem natural.

- [ ] **Step 3: Smoke test não-interativo — `pdd adapt copilot --global` usa a pasta global correta**

Run:

```bash
HOME=/tmp/pdd-smoke-home bash -c \
  'mkdir -p "$HOME" && bun run /home/mithrandir/parity-driven-development/scripts/pdd/index.ts adapt copilot --global /tmp/pdd-smoke-test'
```

Expected: arquivos escritos em `/tmp/pdd-smoke-home/.copilot/skills/<nome>/SKILL.md`
(não `.github/skills/`) — confirma a exceção de pasta global do Copilot.

- [ ] **Step 4: Smoke test interativo do menu**

Run (dentro de um terminal de verdade, TTY — não em pipe):

```bash
cd /tmp/pdd-smoke-test && bun run /home/mithrandir/parity-driven-development/scripts/pdd/index.ts init
```

Confirme visualmente:
- A caixa `┏━...━┓` / `┃ ... ┃` / `┗━...━┛` aparece em volta do título
  "Install PDD commands for which agents?".
- A lista mostra `claude`, `codex`, `cursor`, `copilot`, `gemini` — nessa
  ordem, **nenhum item vem marcado (◯)**, **nenhum mostra "detected"**.
- Se você não tiver clonado via `claude plugin install` (ou seja, está
  rodando do clone git), a dica `💡 Running from a git clone...` aparece
  antes do menu.
- `Ctrl+C`/`Esc` cancela sem escrever nada; selecionar `claude` + enter +
  "project" grava em `/tmp/pdd-smoke-test/.claude/skills/`.

- [ ] **Step 5: Limpar os diretórios de teste**

```bash
rm -rf /tmp/pdd-smoke-test /tmp/pdd-smoke-home
```

- [ ] **Step 6: Build final e checagem do bundle**

Run: `bun run build`
Expected: `dist/pdd.js` gerado sem erro (confirma que o TypeScript novo
compila limpo pro bundle Node também, não só pro Bun direto da fonte).

No commit final desta task, nada deveria mudar em código (é só verificação)
— **não crie um commit vazio**. Se algo precisar de ajuste durante a
verificação, corrija no arquivo correspondente e volte pra Task 1-4 pra
adicionar/corrigir o teste automatizado que deveria ter pego o problema, daí
sim commit.
