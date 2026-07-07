# `pdd init` — menu interativo e adapter por harness

## Contexto

`pdd init` roda um menu de checkboxes (`scripts/pdd/prompt.ts`) pra escolher em
quais harnesses instalar os comandos/skills do PDD. Hoje tem três problemas:

1. **Falta `claude`** na lista — só existe `codex | cursor | copilot | gemini`
   (`scripts/pdd/index.ts`, `adapt.ts`). O PDD roda nativamente como plugin do
   Claude Code, mas quem clona o repo sem instalar via plugin não tem como
   gerar skills locais pro Claude.
2. **Vem pré-selecionado** — harnesses detectados já entram marcados (◉) com
   hint "detected", forçando o usuário a desmarcar em vez de escolher.
3. **Visual pobre** — menu é texto cru sem nenhuma hierarquia visual.

Pesquisa (5 agentes, documentação oficial de cada harness, jul/2026) revelou
que a convenção de skills mudou desde que `adapt.ts` foi escrito:

| Harness | Convenção nativa de skill hoje | Confirmado via |
|---|---|---|
| Codex CLI | `.agents/skills/<nome>/SKILL.md` (projeto, sobe diretórios) / `~/.agents/skills/` (global). `~/.codex/prompts` está **deprecado**. | developers.openai.com/codex/skills |
| Cursor | Lê `.cursor/skills/`, `.agents/skills/`, `.claude/skills/`, `.codex/skills/` — mas sua convenção **própria** é `.cursor/skills/`. Mantém `.cursor/commands/*.md` (sem frontmatter) e `.cursor/rules/*.mdc` à parte. | cursor.com/docs/context/skills |
| GitHub Copilot | Lê `.github/skills/`, `.claude/skills/`, `.agents/skills/` (projeto) e `~/.copilot/skills/`, `~/.agents/skills/` (global) — convenção própria é `.github/skills/`. | docs.github.com/copilot/concepts/agents/about-agent-skills |
| Gemini CLI | `.gemini/skills/` e `.agents/skills/` (este último tem precedência se os dois existirem) — convenção própria é `.gemini/skills/`. | geminicli.com/docs/cli/skills |
| Claude Code | `.claude/skills/<nome>/SKILL.md` (projeto) / `~/.claude/skills/` (global). **`.claude/commands/` foi unificado com skills** — mesmo parser, frontmatter compatível; arquivos antigos continuam funcionando mas o caminho recomendado agora é `.claude/skills/`. | code.claude.com/docs/en/skills |

Decisão (aprovada): cada harness grava na **sua própria pasta nativa**, não
num `.agents/skills/` genérico compartilhado — mesmo que alguns harnesses
também leiam esse caminho por interoperabilidade, seguir o padrão específico
de cada um é mais correto e não depende de comportamento não-documentado.

> ⚠️ Um dos agentes de pesquisa reportou que o Gemini CLI estaria sendo
> descontinuado a favor de um "Antigravity CLI" a partir de 18/06/2026. Isso
> não foi verificado por fetch direto a uma fonte primária e é posterior ao
> meu corte de conhecimento — **não** foi usado para nenhuma decisão deste
> design. Se for real, é um design futuro separado (suporte a Antigravity),
> fora do escopo daqui.

## Arquitetura

### 1. `adapt.ts` — `Harness` ganha `"claude"` e paths por harness

```ts
export type Harness = "claude" | "codex" | "cursor" | "copilot" | "gemini";
```

Nova função (substitui a lógica hoje embutida em `renderSkillFor`/`baseDirFor`):

```ts
function skillDirFor(harness: Harness): string {
  switch (harness) {
    case "codex":   return ".agents/skills";
    case "cursor":  return ".cursor/skills";
    case "copilot": return ".github/skills";
    case "gemini":  return ".gemini/skills";
    case "claude":  return ".claude/skills";
  }
}
```

- `relPath` de cada skill vira sempre `${skillDirFor(harness)}/${skill.name}/SKILL.md`
  — todos os 5 harnesses passam a usar o formato de diretório com `SKILL.md`
  (Cursor deixa de gerar `.cursor/commands/<nome>.md` sem frontmatter; o
  conteúdo do arquivo continua o mesmo `withArgs(deClaude(skill.body))` de
  hoje, já compatível com o contrato mínimo `name` + `description`).
- `baseDirFor(harness, projectRoot, global)`: `global ? join(home, ...restoDoSkillDir)` vs `projectRoot` — mesma lógica de hoje, só que agora **todo** harness (incluindo cursor) tem base global própria dentro do seu diretório de config (`~/.cursor/skills`, `~/.github`? não — Copilot global é `~/.copilot/skills`, não `~/.github`). Detalhe importante: o prefixo de config global do Copilot é `~/.copilot`, não `~/.github` (não existe `~/.github` como convenção). Implementação:

```ts
function globalConfigDirFor(harness: Harness): string {
  switch (harness) {
    case "codex":   return ".agents";     // ~/.agents/skills
    case "cursor":  return ".cursor";     // ~/.cursor/skills
    case "copilot": return ".copilot";    // ~/.copilot/skills
    case "gemini":  return ".gemini";     // ~/.gemini/skills
    case "claude":  return ".claude";     // ~/.claude/skills
  }
}
```

### 2. Regra sempre-ativa (`rulesTargetFor` / `writeRules`)

Sem mudança para codex/cursor/copilot/gemini. Para `"claude"`: **não escreve
nenhuma regra** — o hook de sessão do plugin Claude Code já cobre a
proatividade de update-awareness (comentário existente em `rulesBody()`
já deixa isso implícito). `adaptAll` passa `rules: false` internamente quando
`harness === "claude"`.

### 3. Dica de instalação via plugin (não é parte do checkbox)

`runInit` já tem, hoje em `runUpdate()`, a detecção `isGitClone = existsSync(join(PLUGIN_ROOT, ".git"))`.
Reaproveitar: se `isGitClone` for `true` (ou seja, PDD **não** está rodando
como plugin gerenciado), `runInit` imprime uma linha de dica **uma vez**, no
início da execução, independente de quais harnesses foram selecionados:

```
💡 Rodando via clone git. Pra ter skills nativas + auto-update no Claude Code:
   claude plugin marketplace add blpsoares/parity-driven-development
   claude plugin install pdd@parity-driven-development
```

Isso não bloqueia nem interfere no restante do fluxo — é só uma linha
informativa antes do menu (ou antes do resultado, no modo não-interativo).

### 4. Menu interativo (`prompt.ts`)

Mudanças em `renderMenu`:

- **Moldura completa estilo agentop**: título dentro de uma caixa com bordas
  duplas/pesadas (`┏━┓`/`┗━┛`), largura = `max(40, título + 4)`.
- **Sem pré-seleção**: `runInit` para de calcular `preChecked` a partir de
  `detected` — todo item começa desmarcado (◯), cursor sempre no índice 0.
- **Sem hint "detected"**: o campo `hint` do `MenuItem` deixa de ser usado
  pra marcar detecção (continua existindo como campo genérico pra outros
  usos futuros, ex. hint da tela de escopo "project"/"global", que
  continua mostrando o path). `detectHarnesses` continua existindo — ainda é
  usado pelo modo não-interativo (`pdd init` sem TTY / com args explícitos)
  pra decidir o default sem perguntar nada.
- Cores mantidas (`cyan` pro ponteiro, `green` pro check, `bold` pro item
  selecionado, `dim` pros separadores/rodapé) — já existem em `prompt.ts`,
  só aplicadas também na moldura do título.
- Lista de itens: `["claude", "codex", "cursor", "copilot", "gemini"]` (era
  `["codex", "cursor", "copilot", "gemini"]`).

Mockup aprovado:

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃   Install PDD commands for...   ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

  ❯ ◯ claude
    ◯ codex
    ◯ cursor
    ◯ copilot
    ◯ gemini

  ↑/↓ move · space toggle · a all · enter confirm · esc cancel
```

(sem hint "detected" ao lado de nenhum item — decisão explícita, não é
esquecimento)

A tela de escopo ("project"/"global") ganha a mesma moldura, mantendo o hint
de path (esse hint não é sobre detecção, é informação útil sempre).

## Testes

- `adapt.test.ts`: cobrir `skillDirFor`/`globalConfigDirFor` pra cada um dos
  5 harnesses, `renderSkillFor("claude", ...)` gerando `.claude/skills/<nome>/SKILL.md`,
  `adaptAll("claude", ...)` não chamando `writeRules`.
  Atualizar teste existente de `renderSkillFor("cursor", ...)` — antes
  esperava `commands/<nome>.md`, agora `.cursor/skills/<nome>/SKILL.md`.
- `prompt.test.ts`: `renderMenu` com moldura (snapshot do título emoldurado),
  sem token "detected" em nenhum cenário de item.
- `index.test.ts` (se existir cobertura de `runInit`/`detectHarnesses`): confirmar
  que `preChecked` não é mais passado a `runMenu` no caminho interativo.

## Fora de escopo (explícito)

- Suporte a "Antigravity CLI" (não verificado).
- A skill genérica `cli-skills-gen` pra gerar CLIs com esse padrão de
  detecção multi-harness — fica pra depois, mas este documento (tabela de
  convenções + fontes) serve de material de referência quando for feita.
