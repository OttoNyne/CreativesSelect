import type { Translation } from "../../index";
import type { libmsg as en } from "../en/libmsg";

export const libmsg: Translation<typeof en> = {
  "libmsg.addingAPasskeyWas": "تم إلغاء إضافة مفتاح المرور.",
  "libmsg.signingInWithA": "تم إلغاء تسجيل الدخول بمفتاح المرور.",
  "libmsg.thisDeviceAlreadyHas": "لدى هذا الجهاز مفتاح مرور لهذا الحساب بالفعل.",
  "libmsg.thisDeviceCantMake": "لا يستطيع هذا الجهاز إنشاء مفتاح مرور يُفتح ببصمة أو وجه أو رمز PIN. جرّب جهازًا آخر أو مدير كلمات مرور.",
  "libmsg.passkeysOnlyWorkOn": "لا تعمل مفاتيح المرور إلا على العنوان الرئيسي للموقع. افتحه هناك وحاول مرة أخرى.",
  "libmsg.couldntAddThePasskey": "تعذّرت إضافة مفتاح المرور. حاول مرة أخرى.",
  "libmsg.couldntSignInWith": "تعذّر تسجيل الدخول بمفتاح المرور. حاول مرة أخرى أو استخدم كلمة المرور.",
  "libmsg.notificationsAreBlockedFor": "الإشعارات محظورة لهذا الموقع. اسمح بها من إعدادات متصفحك لهذا الموقع ثم حاول مرة أخرى.",
  "libmsg.yourBrowserCouldntSet": "لم يتمكن متصفحك من إعداد الإشعارات. حاول مرة أخرى أو استخدم متصفحًا آخر.",
  "libmsg.microphoneAccessWasBlocked": "تم حظر الوصول إلى الميكروفون. اسمح بالميكروفون لهذا الموقع من إعدادات متصفحك ثم حاول مرة أخرى.",
  "libmsg.noMicrophoneWasFound": "لم يتم العثور على ميكروفون في هذا الجهاز.",
  "libmsg.yourMicrophoneIsIn": "ميكروفونك قيد الاستخدام من تطبيق آخر. أغلقه وحاول مرة أخرى.",
  "libmsg.youreNotConnectedTo": "لم تتصل بالصوت المباشر بعد.",
  "libmsg.theLiveAudioService": "لم تسمح خدمة الصوت المباشر بميكروفونك بعد. حاول مرة أخرى.",
  "libmsg.theOwnerOfThis": "صاحب هذا الفيديو لا يسمح بتشغيله هنا.",
  "libmsg.thisVideoIsntAvailable": "هذا الفيديو غير متاح.",
  "libmsg.uploadFailed": "فشل الرفع",
  "libmsg.guestsOnStage": "الضيوف على المنصة",
};
