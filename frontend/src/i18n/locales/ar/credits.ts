import type { Translation } from "../../index";
import type { credits as en } from "../en/credits";

export const credits: Translation<typeof en> = {
  "credits.couldntDoThat": "تعذّر تنفيذ ذلك، حاول مرة أخرى.",
  "credits.couldntCredit": "تعذّر إضافة الاعتماد، حاول مرة أخرى.",
  "credits.withLabel": "من عمل على هذا",
  "credits.waiting": "بانتظار ردّه",
  "credits.removeCredit": "إزالة اعتماد {name} من هذا العمل",
  "credits.leaveCredit": "إزالة اسمك من هذا العمل",
  "credits.creditSomeone": "+ اعتماد مشارك",
  "credits.whoWorkedOnIt": "من عمل عليه",
  "credits.chooseAFriend": "اختر صديقًا…",
  "credits.noFriendsToCredit": "لا أصدقاء لاعتمادهم بعد",
  "credits.whatTheyDid": "ما الذي فعله (مثل: رسّام)",
  "credits.ask": "طلب",
  "credits.asking": "جارٍ الطلب…",
  "credits.requestsTitle": "اعتمادات بانتظارك",
  "credits.askedYou": "ذكرك {name} بصفة",
  "credits.collaborations": "التعاونات",
  "credits.byOwner": "من {name}",
  "notif.creditRequest": "ذكرك ضمن المشاركين في عمل",
  "notif.creditAccepted": "قبل الاعتماد في عملك",
  "target.viewCredit": "عرض الاعتماد",
};
