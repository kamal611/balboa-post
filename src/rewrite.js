import Anthropic from "@anthropic-ai/sdk";
import { CATEGORIES } from "./db.js";
import { overlapRatio } from "./similarity.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-5";

// Max fraction of the rewritten article's 8-word phrases that are allowed
// to also appear in the source text. Lower = stricter (more different from
// the source). 0.15 means at most ~15% of phrasing can overlap.
const MAX_OVERLAP = Number(process.env.MAX_SOURCE_OVERLAP ?? 0.15);
const MAX_ATTEMPTS = 3;

/**
 * Claude sometimes wraps its JSON reply in a markdown code fence
 * (```json ... ```) even when told not to. Strip that off, and fall back
 * to grabbing the outermost {...} block, before parsing.
 */
function extractJson(raw) {
  let text = raw.trim();

  // Strip a leading ```json / ``` fence and a trailing ``` fence, if present.
  if (text.startsWith("```")) {
    text = text.replace(/^```[a-zA-Z]*\n?/, "").replace(/```\s*$/, "").trim();
  }

  try {
    return JSON.parse(text);
  } catch {
    // Fall back to the outermost { ... } block, in case there's stray text
    // before or after the JSON.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error("no JSON object found");
  }
}

async function requestRewrite(item, sourceText, attempt) {
  const emphasis =
    attempt === 1
      ? ""
      : `

IMPORTANT: Your previous attempt reused too much of the source's exact
phrasing. Restructure this completely: use different sentence structures,
a different paragraph order, and your own vocabulary throughout. Do not
reuse any phrase of more than a few words from the source material.`;

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `You are a staff writer at a professional local news
outlet. Using the source material below as factual input only, write a
fully original news-style article in your own words and structure. Do not
copy phrases from the source — reorganize the information, use different
sentence structures, and write it as if you learned these facts secondhand
rather than editing the source document. Add context where helpful. Keep
it factually accurate to the source; do not invent facts, quotes, or
statistics that are not implied by the source.${emphasis}

Return ONLY valid JSON with this exact shape, no markdown fences:
{"title": "...", "dek": "...", "category": "...", "bodyHtml": "<p>...</p><p>...</p>"}

- "title": a clear, professional headline (no clickbait, no ALL CAPS),
  phrased differently from the source's own headline.
- "dek": one sentence (max ~160 characters) summarizing the story, the way
  a newspaper subheadline reads under the main headline.
- "category": pick exactly one value from this list, whichever fits best:
  ${CATEGORIES.join(", ")}
- "bodyHtml": 3-6 short paragraphs of semantic HTML (<p> tags only).

SOURCE MATERIAL:
"""
${sourceText}
"""`,
      },
    ],
  });

  const raw = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  let parsed;
  try {
    parsed = extractJson(raw);
  } catch (err) {
    throw new Error(
      `Claude did not return valid JSON for item "${item.title}": ${raw.slice(0, 200)}`
    );
  }

  if (!parsed.title || !parsed.bodyHtml) {
    throw new Error(`Rewrite response missing title/bodyHtml for "${item.title}"`);
  }

  return parsed;
}

/**
 * Rewrites a single feed item into an original article using the Claude API.
 * Returns { title, dek, category, bodyHtml, overlapRatio }.
 *
 * After each attempt, checks how much of the rewritten text's phrasing
 * overlaps with the source (via overlapRatio) and automatically retries
 * with a stronger instruction if it's above MAX_SOURCE_OVERLAP. Throws if
 * it still can't get below that threshold after MAX_ATTEMPTS tries, so a
 * too-similar article never gets silently published.
 *
 * IMPORTANT: this is meant for content you have the rights to republish
 * (your own feed, a licensed partner feed, etc).
 */
export async function rewriteArticle(item) {
  const sourceText = [item.title, item.contentSnippet || item.content || ""]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 8000); // keep prompts bounded

  let lastParsed = null;
  let lastRatio = 1;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const parsed = await requestRewrite(item, sourceText, attempt);
    const ratio = overlapRatio(sourceText, parsed.bodyHtml);

    lastParsed = parsed;
    lastRatio = ratio;

    console.log(
      `[rewrite] "${item.title}" attempt ${attempt}: ${(ratio * 100).toFixed(1)}% phrase overlap with source`
    );

    if (ratio <= MAX_OVERLAP) break;
  }

  if (lastRatio > MAX_OVERLAP) {
    throw new Error(
      `Rewrite of "${item.title}" still had ${(lastRatio * 100).toFixed(1)}% overlap with source after ${MAX_ATTEMPTS} attempts (limit ${(MAX_OVERLAP * 100).toFixed(0)}%). Skipping to avoid publishing near-duplicate text.`
    );
  }

  const parsed = lastParsed;

  if (!CATEGORIES.includes(parsed.category)) {
    parsed.category = "Local";
  }

  if (process.env.INCLUDE_SOURCE_LINK !== "false" && item.link) {
    parsed.bodyHtml += `\n<p class="source-attribution">Source: <a href="${item.link}" rel="nofollow">${item.link}</a></p>`;
  }

  parsed.overlapRatio = lastRatio;

  return parsed;
}
