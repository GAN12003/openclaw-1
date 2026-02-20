"use strict";

const fs = require("fs");
const path = require("path");

/** Default skills directory: runtime/skills (e.g. /opt/piclaw/skills). Override with PICLAW_SKILLS_DIR. */
const DEFAULT_SKILLS_DIR = path.join(__dirname, "skills");

/** Max chars per SKILL.md content (truncate if larger). */
const MAX_SKILL_FILE_CHARS = 4000;

/** Max total chars for all skills in the prompt (Pi token budget). */
const MAX_TOTAL_SKILLS_CHARS = 12000;

/** Max number of skills to load. */
const MAX_SKILLS_COUNT = 30;

/**
 * Resolve the skills directory (runtime/skills or PICLAW_SKILLS_DIR).
 * @returns {string}
 */
function resolveSkillsDir() {
  const envDir = (process.env.PICLAW_SKILLS_DIR || "").trim();
  if (envDir) return path.resolve(envDir);
  return DEFAULT_SKILLS_DIR;
}

/**
 * Load skills from the configured directory and format for the system prompt.
 * Each skill is a subdirectory containing SKILL.md. Content is truncated per-skill and total.
 * Compatible with ClawHub installs: `npx clawhub install <slug> --workdir /opt/piclaw` puts skills in /opt/piclaw/skills.
 * @returns {{ prompt: string, count: number }}
 */
function loadSkillsPrompt() {
  const skillsDir = resolveSkillsDir();
  let totalChars = 0;
  const parts = [];
  let count = 0;

  try {
    if (!fs.existsSync(skillsDir) || !fs.statSync(skillsDir).isDirectory()) {
      return { prompt: "", count: 0 };
    }
    const names = fs.readdirSync(skillsDir).sort();
    for (const name of names) {
      if (count >= MAX_SKILLS_COUNT || totalChars >= MAX_TOTAL_SKILLS_CHARS) break;
      const skillDir = path.join(skillsDir, name);
      let stat;
      try {
        stat = fs.statSync(skillDir);
      } catch (_) {
        continue;
      }
      if (!stat.isDirectory()) continue;
      const skillMd = path.join(skillDir, "SKILL.md");
      if (!fs.existsSync(skillMd)) continue;
      let content;
      try {
        content = fs.readFileSync(skillMd, "utf8");
      } catch (_) {
        continue;
      }
      const truncated =
        content.length > MAX_SKILL_FILE_CHARS
          ? content.slice(0, MAX_SKILL_FILE_CHARS) + "\n...(truncated)"
          : content;
      const block = `## Skill: ${name}\n${truncated}`;
      const blockLen = block.length;
      if (totalChars + blockLen > MAX_TOTAL_SKILLS_CHARS) {
        const remaining = Math.max(0, MAX_TOTAL_SKILLS_CHARS - totalChars - 80);
        if (remaining > 100) {
          parts.push(
            `## Skill: ${name}\n${truncated.slice(0, remaining)}\n...(truncated)`
          );
          totalChars += remaining + 80;
        }
        count++;
        break;
      }
      parts.push(block);
      totalChars += blockLen;
      count++;
    }
  } catch (_) {
    return { prompt: "", count: 0 };
  }

  const prompt = parts.length ? parts.join("\n\n") : "";
  return { prompt, count };
}

module.exports = {
  resolveSkillsDir,
  loadSkillsPrompt,
  MAX_SKILL_FILE_CHARS,
  MAX_TOTAL_SKILLS_CHARS,
  MAX_SKILLS_COUNT,
};
