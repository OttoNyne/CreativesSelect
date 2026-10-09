import type { Translation } from "../../index";
import type { polls as en } from "../en/polls";

export const polls: Translation<typeof en> = {
  "polls.add": "إضافة استطلاع",
  "polls.remove": "إزالة الاستطلاع",
  "polls.heading": "استطلاع",
  "polls.option": "الخيار {n}",
  "polls.addOption": "إضافة خيار",
  "polls.removeOption": "إزالة الخيار {n}",
  "polls.length": "مدة الاستطلاع",
  "polls.oneDay": "يوم واحد",
  "polls.threeDays": "3 أيام",
  "polls.sevenDays": "7 أيام",
  "polls.votes": { zero: "لا أصوات", one: "صوت واحد", two: "صوتان", few: "{n} أصوات", many: "{n} صوتًا", other: "{n} صوت" },
  "polls.final": "النتائج النهائية",
  "polls.voteFor": "التصويت لـ {option}",
  "polls.yourVote": "صوتك",
  "polls.failed": "تعذّر التصويت، حاول مرة أخرى.",
  "polls.needTwo": "يحتاج الاستطلاع إلى خيارين على الأقل يحتويان على نص.",
};
