import crypto from "crypto";
import fs from "fs";
import path from "path";
import { AIService, ImageGenerationRequest, TextGenerationRequest } from "./AIService";
import { UPLOADS_ROOT } from "../../middleware/upload";

const TEXT_TEMPLATES: Record<TextGenerationRequest["kind"], string[]> = {
  bio: [
    "Creative soul exploring {topic}. Always down to collab — let's make something.",
    "{topic} is my thing. Building a portfolio one piece at a time and always open to new collabs.",
    "Here for the {topic} community. DM me if you want to create something together.",
  ],
  caption: [
    "New drop: {topic}. Been sitting on this one for a while — glad it's finally out.",
    "Working through some ideas around {topic}. Feedback welcome!",
    "{topic}, take two. Getting closer to what I had in my head.",
  ],
  blurb: [
    "A short piece exploring {topic}, made for anyone who needs a reminder to keep creating.",
    "{topic} — an experiment in seeing what happens when you just start.",
    "This one's about {topic}. Hope it resonates with somebody out there.",
  ],
};

const FLOURISHES = ["✨", "🎨", "🎧", "📸", "🖋️", ""];

function pickTopic(prompt: string): string {
  const trimmed = prompt.trim();
  return trimmed.length > 0 ? trimmed : "the craft";
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hashToHue(input: string): number {
  const hash = crypto.createHash("md5").update(input).digest();
  return hash[0] * 1.4117647; // 0-255 -> 0-360ish
}

function buildGradientSvg(prompt: string): string {
  const hue1 = Math.round(hashToHue(prompt));
  const hue2 = Math.round((hue1 + 60) % 360);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="hsl(${hue1},70%,55%)" />
      <stop offset="100%" stop-color="hsl(${hue2},70%,45%)" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#g)" />
</svg>`;
}

export class MockAIProvider implements AIService {
  async generateText({ prompt, kind }: TextGenerationRequest): Promise<{ text: string }> {
    await delay(300 + Math.random() * 300);
    const templates = TEXT_TEMPLATES[kind];
    const template = templates[Math.floor(Math.random() * templates.length)];
    const flourish = FLOURISHES[Math.floor(Math.random() * FLOURISHES.length)];
    const text = `${template.replace("{topic}", pickTopic(prompt))} ${flourish}`.trim();
    return { text };
  }

  async generateImage({ prompt }: ImageGenerationRequest): Promise<{ url: string }> {
    await delay(400 + Math.random() * 400);
    const dir = path.join(UPLOADS_ROOT, "ai-generated");
    fs.mkdirSync(dir, { recursive: true });
    const filename = `${crypto.randomUUID()}.svg`;
    fs.writeFileSync(path.join(dir, filename), buildGradientSvg(prompt || crypto.randomUUID()));
    return { url: `/uploads/ai-generated/${filename}` };
  }
}
