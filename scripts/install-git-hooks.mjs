/* global console, process */
/**
 * Installs the checked-in git hooks by writing thin wrappers into
 * `.git/hooks` — no external hook manager, no new dependencies. Runs
 * automatically on `npm install` / `npm ci` through the `prepare` script;
 * re-running is safe (wrappers are overwritten by content, not appended).
 */
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const HOOKS = ["pre-commit", "pre-push"];

const gitDir = path.resolve(".git");
if (!existsSync(path.join(gitDir, "hooks"))) {
    // Bare repos and .git-file worktrees have no hooks dir to fill —
    // nothing to install in this checkout.
    console.log("[install-git-hooks] no .git/hooks directory — skipped");
    process.exit(0);
}

await mkdir(path.join(gitDir, "hooks"), { recursive: true });

for (const hook of HOOKS) {
    // The wrapper resolves the repo root from its own location, so it
    // survives the repository being moved after installation.
    const wrapper = [
        "#!/bin/sh",
        'exec sh "$(/usr/bin/env dirname "$0")/../../scripts/git-hooks/'
            + hook
            + '" "$@"',
        "",
    ].join("\n");
    const target = path.join(gitDir, "hooks", hook);
    await writeFile(target, wrapper, { mode: 0o755 });
    await chmod(target, 0o755);
    console.log(`[install-git-hooks] ${hook} -> scripts/git-hooks/${hook}`);
}
