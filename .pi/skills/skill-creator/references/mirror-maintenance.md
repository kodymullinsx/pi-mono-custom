# Mirror maintenance across CLIs

When a skill is intentionally mirrored across multiple CLIs, update it in a fixed order so the canonical copy stays trustworthy and the validator checks the real final state.

## Update order

1. Update the canonical source first.
   - Current canonical root for mirrored user-managed skills: `~/.claude/skills/`
2. Update bundled references or assets in the same canonical skill directory before touching mirrors.
3. Mirror the canonical skill outward to the active sibling copies.
   - Current common siblings on this machine:
     - `~/.pi/agent/skills/`
     - `~/.codex/skills/`
   - For skills with additional live mirrors, copy those too.
4. Fact-check the mirrors by comparing hashes or diffs, not by assuming the copies succeeded.
5. Run the bundled validator against:
   - the canonical skill directory
   - each mirrored skill directory
   - the containing skill libraries when practical

Do not edit one mirror in isolation and call the work done. If a skill is meant to stay identical across CLIs, the task is incomplete until the canonical copy, all intended mirrors, and their bundled references match.
