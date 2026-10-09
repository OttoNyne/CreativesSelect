import type { Translation } from "../../index";
import type { mutes as en } from "../en/mutes";

export const mutes: Translation<typeof en> = {
  "mutes.title": "الكتم",
  "mutes.intro": "يختفي الأشخاص والكلمات المكتومة من صفحتك الرئيسية ومن استكشاف، ويختفي الأشخاص المكتومون أيضًا من إشعاراتك. لا يتم إخبار أحد.",
  "mutes.words": "الكلمات والعبارات المكتومة",
  "mutes.wordLabel": "كلمة أو عبارة لكتمها",
  "mutes.addWord": "كتم الكلمة",
  "mutes.removeWord": "إلغاء كتم {word}",
  "mutes.noWords": "لا توجد كلمات مكتومة.",
  "mutes.people": "الأشخاص المكتومون",
  "mutes.noPeople": "لم تكتم أحدًا.",
  "mutes.unmute": "إلغاء الكتم",
  "mutes.unmuteLabel": "إلغاء كتم {name}",
  "mutes.mute": "كتم",
  "mutes.muteLabel": "كتم {name}: تتوقف منشوراته عن الظهور في صفحتك الرئيسية",
  "mutes.failed": "تعذّر تنفيذ ذلك، حاول مرة أخرى.",
  "mutes.loadFailed": "تعذّر تحميل قائمة المكتومين.",
};
