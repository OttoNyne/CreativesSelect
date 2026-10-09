import type { Translation } from "../../index";
import type { topics as en } from "../en/topics";

export const topics: Translation<typeof en> = {
  "topics.follow": "متابعة الموضوع",
  "topics.following": "تتابع الموضوع",
  "topics.followLabel": "متابعة الموضوع {tag}",
  "topics.unfollowLabel": "إلغاء متابعة الموضوع {tag}",
  "topics.yours": "مواضيعك",
  "topics.noneFollowed": "لا تتابع أي موضوع بعد. افتح موضوعًا وتابعه.",
  "topics.everything": "الكل",
  "topics.fromYours": "من مواضيعك",
  "topics.emptyMine": "لا جديد في مواضيعك بعد.",
  "topics.failed": "تعذّر تنفيذ ذلك، حاول مرة أخرى.",
  "digest.title": "الملخص الأسبوعي",
  "digest.label": "أرسل لي ملخصًا قصيرًا بالبريد مرة في الأسبوع",
  "digest.help": "بضعة أرقام وعناوين: متابعون جدد، تعليقات وردود، رسائل في غرف مشاريعك، دعوات مفتوحة تناسب ما تقدمه، وجديد المواضيع التي تتابعها. لا يُرسل شيء عندما لا يوجد ما يُقال، وفي كل رسالة رابط لإيقافها.",
  "digest.unconfirmed": "أكّد بريدك الإلكتروني أولًا: لا تُرسل الملخصات إلا إلى العناوين المؤكَّدة.",
  "digest.failed": "تعذّر تغيير ذلك، حاول مرة أخرى.",
  "digest.unsubWorking": "جارٍ إيقاف ملخصك الأسبوعي…",
  "digest.unsubDone": "تم. لن تصلك الملخصات الأسبوعية بعد الآن.",
  "digest.unsubDoneHint": "يمكنك إعادة تفعيلها من إعدادات ملفك الشخصي.",
  "digest.unsubFailed": "هذا الرابط لم يعد صالحًا. يمكنك إيقاف الملخص من إعدادات ملفك الشخصي.",
  "digest.home": "الانتقال إلى CreativesSelect",
};
