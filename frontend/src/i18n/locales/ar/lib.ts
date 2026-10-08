import type { Translation } from "../../index";
import type { lib as en } from "../en/lib";

export const lib: Translation<typeof en> = {
  "lib.videoTooBig": "حجم هذا الفيديو {mb} ميغابايت والحد الأقصى {limit} ميغابايت (جرّب مقطعًا أقصر أو جودة أقل في هاتفك).",
  "lib.videoTooLong": "يمكن أن تصل مدة الفيديو إلى {max} ثانية — ومدة هذا الفيديو {seconds} ثانية.",
  "lib.tagRange": "استخدم من {min} إلى {max} من الأحرف أو الأرقام أو المسافات أو الواصلات",
  "lib.tagExists": "لديك «{tag}» بالفعل",
  "lib.tagMax": "يمكنك وضع ما يصل إلى {max} وسوم",
  "lib.liveUnsupported": "لا يستطيع هذا المتصفح تشغيل الصوت المباشر. جرّب إصدارًا حديثًا من Chrome أو Edge أو Firefox أو Safari.",
  "pageTitle.forgot": "نسيت كلمة المرور",
  "pageTitle.reset": "إعادة تعيين كلمة المرور",
  "pageTitle.confirm": "تأكيد البريد",
  "pageTitle.group": "مجموعة",
  "pageTitle.post": "منشور",
  "lib.liveUnsupportedHost": "لا يستطيع هذا المتصفح بث الصوت المباشر. جرّب إصدارًا حديثًا من Chrome أو Edge أو Firefox أو Safari.",
};
