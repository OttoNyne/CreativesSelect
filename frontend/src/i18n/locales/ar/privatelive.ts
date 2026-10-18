import type { Translation } from "../../index";
import type { privatelive as en } from "../en/privatelive";

export const privatelive: Translation<typeof en> = {
  "privatelive.toggle": "بالدعوة فقط",
  "privatelive.hint": "الأصدقاء الذين تختارهم فقط يمكنهم رؤية هذا البث أو الانضمام إليه. يمكنك دعوة المزيد من الناس بعد أن تبدأ البث.",
  "privatelive.pick": "الأصدقاء المدعوون",
  "privatelive.noFriends": "ليس لديك أصدقاء لدعوتهم بعد. ما زال بإمكانك بدء البث وإضافة أشخاص لاحقًا.",
  "privatelive.picked": { zero: "لا أصدقاء مدعوون", one: "صديق واحد مدعو", two: "صديقان مدعوان", few: "{n} أصدقاء مدعوون", many: "{n} صديقًا مدعوًا", other: "{n} صديق مدعو" },
  "privatelive.loadFailed": "تعذّر تحميل أصدقائك، حاول مرة أخرى.",
  "privatelive.badge": "خاص",
  "privatelive.headerNote": "بث خاص: لا يراه إلا المدعوون.",
  "privatelive.panelTitle": "المدعوون",
  "privatelive.empty": "لم تتم دعوة أحد بعد.",
  "privatelive.inRoom": "في الغرفة",
  "privatelive.remove": "سحب الدعوة",
  "privatelive.removeAria": "سحب الدعوة من {name}",
  "privatelive.addTitle": "ادعُ المزيد من الأصدقاء",
  "privatelive.invite": "دعوة",
  "privatelive.inviteAria": "دعوة {name}",
  "privatelive.allInvited": "جميع أصدقائك مدعوون.",
  "privatelive.max": "يمكنك دعوة ما يصل إلى {max} شخص.",
  "privatelive.startBusy": "جارٍ البدء…",
  "notif.liveInvite": "دعاك إلى بث مباشر خاص: «{title}»",
  "notif.liveInviteNoTitle": "دعاك إلى بث مباشر خاص",
};
