import { t, type Key } from "../i18n";

// The spark dice: a subject, a twist and a rule, each picked from a short list of words that live in the language files (play.subject.N,
// play.twist.N, play.limit.N). A spark is just three numbers, so the same spark reads in each person's own language and can travel in a link.

export const SUBJECTS = 16;
export const TWISTS = 12;
export const LIMITS = 10;

export type SparkPart = "subject" | "twist" | "limit";
export type Spark = Record<SparkPart, number>;
export const PARTS: readonly SparkPart[] = ["subject", "twist", "limit"];
const COUNT: Record<SparkPart, number> = { subject: SUBJECTS, twist: TWISTS, limit: LIMITS };

/** Numbers 1..n are used in the language files. */
const pick = (rand: () => number, n: number) => 1 + Math.floor(rand() * n);

/** A small, fast generator whose sequence is fixed by its seed, so everyone who uses the same seed gets the same numbers. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Today's spark: the same for everyone, and new at midnight UTC (the same moment the weekly challenge turns over). */
export function sparkOfDay(now: Date = new Date()): Spark {
  const day = Math.floor(now.getTime() / 86_400_000);
  const rand = seeded(day * 7919 + 13);
  return { subject: pick(rand, SUBJECTS), twist: pick(rand, TWISTS), limit: pick(rand, LIMITS) };
}

export function randomSpark(rand: () => number = Math.random): Spark {
  return { subject: pick(rand, SUBJECTS), twist: pick(rand, TWISTS), limit: pick(rand, LIMITS) };
}

/** Roll one die again, always landing on something different from what it showed. */
export function rerollPart(spark: Spark, part: SparkPart, rand: () => number = Math.random): Spark {
  const n = COUNT[part];
  const next = ((spark[part] - 1 + 1 + Math.floor(rand() * (n - 1))) % n) + 1;
  return { ...spark, [part]: next };
}

export const encodeSpark = (spark: Spark) => `${spark.subject}-${spark.twist}-${spark.limit}`;

/** A spark from a link (`3-5-2`); anything that isn't three numbers in range is ignored. */
export function decodeSpark(text: string | null | undefined): Spark | null {
  const match = /^(\d{1,2})-(\d{1,2})-(\d{1,2})$/.exec(text ?? "");
  if (!match) return null;
  const [subject, twist, limit] = match.slice(1).map(Number);
  if (subject < 1 || subject > SUBJECTS || twist < 1 || twist > TWISTS || limit < 1 || limit > LIMITS) return null;
  return { subject, twist, limit };
}

export const partText = (part: SparkPart, n: number) => t(`play.${part}.${n}` as Key);

/** The whole spark as one sentence, in the reader's language. */
export const sparkText = (spark: Spark) =>
  t("play.sparkText", { subject: partText("subject", spark.subject), twist: partText("twist", spark.twist), limit: partText("limit", spark.limit) });
