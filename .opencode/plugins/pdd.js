/**
 * PDD — OpenCode plugin.
 *
 * Registers PDD's skills (each skills/audit-<name>/SKILL.md) with OpenCode's skill system,
 * so `/audit-*` commands are discoverable without symlinks or manual config edits.
 *
 * PDD is command-based — the user invokes the commands explicitly (OpenCode also
 * matches skills by description) — so, unlike an always-on methodology, this plugin
 * injects no bootstrap context. It only wires up the skills path.
 */

import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pddSkillsDir = path.resolve(__dirname, "../../skills");

export const PddPlugin = async () => {
  return {
    // Inject the skills path into live config so OpenCode discovers PDD's skills.
    config: async (config) => {
      config.skills = config.skills || {};
      config.skills.paths = config.skills.paths || [];
      if (!config.skills.paths.includes(pddSkillsDir)) {
        config.skills.paths.push(pddSkillsDir);
      }
    },
  };
};
