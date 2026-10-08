import type { Translation } from "../../index";
import type { time as en } from "../en/time";

export const time: Translation<typeof en> = {
  "time.justNow": "الآن",
  "time.started": "بدأ",
  "time.startingNow": "يبدأ الآن",
  "time.ago.minute": { zero: "قبل {n} دقيقة", one: "قبل دقيقة", two: "قبل دقيقتين", few: "قبل {n} دقائق", many: "قبل {n} دقيقة", other: "قبل {n} دقيقة" },
  "time.ago.hour": { zero: "قبل {n} ساعة", one: "قبل ساعة", two: "قبل ساعتين", few: "قبل {n} ساعات", many: "قبل {n} ساعة", other: "قبل {n} ساعة" },
  "time.ago.day": { zero: "قبل {n} يوم", one: "قبل يوم", two: "قبل يومين", few: "قبل {n} أيام", many: "قبل {n} يومًا", other: "قبل {n} يوم" },
  "time.in.minute": { zero: "خلال {n} دقيقة", one: "خلال دقيقة", two: "خلال دقيقتين", few: "خلال {n} دقائق", many: "خلال {n} دقيقة", other: "خلال {n} دقيقة" },
  "time.in.hour": { zero: "خلال {n} ساعة", one: "خلال ساعة", two: "خلال ساعتين", few: "خلال {n} ساعات", many: "خلال {n} ساعة", other: "خلال {n} ساعة" },
  "time.in.day": { zero: "خلال {n} يوم", one: "خلال يوم", two: "خلال يومين", few: "خلال {n} أيام", many: "خلال {n} يومًا", other: "خلال {n} يوم" },
  "time.left.day": { zero: "تبقّى {n} يوم", one: "تبقّى يوم", two: "تبقّى يومان", few: "تبقّت {n} أيام", many: "تبقّى {n} يومًا", other: "تبقّى {n} يوم" },
  "time.left.lessThanDay": "تبقّى أقل من يوم",
  "time.short.minutes": "قبل {n} د",
  "time.short.hours": "قبل {n} س",
  "time.short.days": "قبل {n} ي",
};
