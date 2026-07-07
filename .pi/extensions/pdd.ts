// PDD — Pi extension.
// Registers PDD's skills (skills/audit-*/SKILL.md) with Pi's native skill system.
// PDD is command-based: the user invokes /audit-bootstrap, /audit-new, … explicitly (Pi also
// matches skills by their description), so — unlike an always-on methodology — there is no
// bootstrap to inject. Pi resolves `@earendil-works/pi-coding-agent` in its own runtime.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const extensionDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(extensionDir, "../..");
const skillsDir = resolve(packageRoot, "skills");

export default function pddPiExtension(pi: ExtensionAPI) {
  pi.on("resources_discover", async () => ({
    skillPaths: [skillsDir],
  }));
}
