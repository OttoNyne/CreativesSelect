import type { Translation } from "../../index";
import type { follow as en } from "../en/follow";

export const follow: Translation<typeof en> = {
  "follow.follow": "متابعة",
  "follow.following": "تتابعه",
  "follow.followLabel": "متابعة {name}",
  "follow.unfollowLabel": "إلغاء متابعة {name}",
  "follow.unfollow": "إلغاء المتابعة",
  "follow.followers": { zero: "لا متابعين", one: "متابع واحد", two: "متابعان", few: "{n} متابعين", many: "{n} متابعًا", other: "{n} متابع" },
  "follow.followingCount": "يتابع {n}",
  "follow.countsLabel": "المتابعون والمتابَعون",
  "follow.followersTitle": "متابعوك",
  "follow.followingTitle": "من تتابعهم",
  "follow.noFollowers": "لا أحد يتابعك بعد.",
  "follow.noFollowing": "لا تتابع أحدًا بعد. تابع أصحاب الملفات العامة لترى منشوراتهم في صفحتك الرئيسية.",
  "follow.more": "عرض المزيد",
  "follow.close": "إغلاق",
  "follow.failed": "تعذّر ذلك، حاول مرة أخرى.",
  "follow.loading": "جارٍ التحميل…",
  "notif.follow": "بدأ بمتابعتك",
};
