import type { Translation } from "../../index";
import type { libmsg as en } from "../en/libmsg";

export const libmsg: Translation<typeof en> = {
  "libmsg.addingAPasskeyWas": "Se canceló la adición de la clave de acceso.",
  "libmsg.signingInWithA": "Se canceló el inicio de sesión con clave de acceso.",
  "libmsg.thisDeviceAlreadyHas": "Este dispositivo ya tiene una clave de acceso para esta cuenta.",
  "libmsg.thisDeviceCantMake": "Este dispositivo no puede crear una clave de acceso que se desbloquee con huella, rostro o PIN. Prueba con otro dispositivo o un gestor de contraseñas.",
  "libmsg.passkeysOnlyWorkOn": "Las claves de acceso solo funcionan en la dirección principal del sitio. Ábrelo allí e inténtalo de nuevo.",
  "libmsg.couldntAddThePasskey": "No se pudo añadir la clave de acceso. Inténtalo de nuevo.",
  "libmsg.couldntSignInWith": "No se pudo iniciar sesión con la clave de acceso. Inténtalo de nuevo o usa tu contraseña.",
  "libmsg.notificationsAreBlockedFor": "Las notificaciones están bloqueadas para este sitio. Permítelas en los ajustes de tu navegador para este sitio e inténtalo de nuevo.",
  "libmsg.yourBrowserCouldntSet": "Tu navegador no pudo configurar las notificaciones. Inténtalo de nuevo o usa otro navegador.",
  "libmsg.microphoneAccessWasBlocked": "Se bloqueó el acceso al micrófono. Permite el micrófono para este sitio en los ajustes de tu navegador e inténtalo de nuevo.",
  "libmsg.noMicrophoneWasFound": "No se encontró ningún micrófono en este dispositivo.",
  "libmsg.yourMicrophoneIsIn": "Otra aplicación está usando tu micrófono. Ciérrala e inténtalo de nuevo.",
  "libmsg.youreNotConnectedTo": "Aún no estás conectado al audio en vivo.",
  "libmsg.theLiveAudioService": "El servicio de audio en vivo aún no ha dejado pasar tu micrófono. Inténtalo de nuevo.",
  "libmsg.theOwnerOfThis": "El propietario de este vídeo no permite reproducirlo aquí.",
  "libmsg.thisVideoIsntAvailable": "Este vídeo no está disponible.",
  "libmsg.uploadFailed": "Error al subir",
  "libmsg.guestsOnStage": "Invitados en el escenario",
};
