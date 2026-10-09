import type { Translation } from "../../index";
import type { explore as en } from "../en/explore";

export const explore: Translation<typeof en> = {
  "nav.explore": "استكشاف",
  "explore.title": "استكشاف",
  "explore.intro": "منشورات وأعمال عامة من جميع أنحاء CreativesSelect. أضف وسمًا #هاشتاغ إلى منشوراتك ليجدك الناس حسب الموضوع.",
  "explore.tagLabel": "ابحث عن موضوع",
  "explore.tagPlaceholder": "خزف، مزج، ملصق…",
  "explore.show": "عرض",
  "explore.badTag": "الموضوع كلمة واحدة من حروف أو أرقام أو شرطات سفلية.",
  "explore.trending": "الأكثر تداولًا هذا الأسبوع",
  "explore.people": { zero: "لا أحد", one: "شخص واحد", two: "شخصان", few: "{n} أشخاص", many: "{n} شخصًا", other: "{n} شخص" },
  "explore.noTrending": "لا مواضيع هذا الأسبوع بعد. ضع وسمًا #هاشتاغ في منشور أو وصف لتبدأ موضوعًا.",
  "explore.kind": "ما الذي يُعرض",
  "explore.posts": "المنشورات",
  "explore.pieces": "الأعمال",
  "explore.about": "حول #{tag}",
  "explore.clear": "عرض الكل",
  "explore.empty": "لا شيء هنا بعد.",
  "explore.emptyTag": "لا شيء حول #{tag} بعد. كن أول من ينشر!",
  "explore.more": "عرض المزيد",
  "explore.loading": "جارٍ التحميل…",
  "explore.loadFailed": "تعذّر تحميل صفحة الاستكشاف، حاول مرة أخرى.",
  "explore.challenge": "شاهد التحدي الإبداعي لهذا الأسبوع",
};
