import type { Translation } from "../../index";
import type { credits as en } from "../en/credits";

export const credits: Translation<typeof en> = {
  "credits.couldntDoThat": "No se pudo hacer, inténtalo de nuevo.",
  "credits.couldntCredit": "No se pudo añadir el crédito, inténtalo de nuevo.",
  "credits.withLabel": "Quién trabajó en esto",
  "credits.waiting": "esperando respuesta",
  "credits.removeCredit": "Quitar el crédito de {name} de esta obra",
  "credits.leaveCredit": "Quitar tu nombre de esta obra",
  "credits.creditSomeone": "+ Dar crédito a alguien",
  "credits.whoWorkedOnIt": "Quién trabajó en ella",
  "credits.chooseAFriend": "Elige un amigo…",
  "credits.noFriendsToCredit": "Aún no hay amigos a quienes dar crédito",
  "credits.whatTheyDid": "Qué hizo (p. ej., ilustrador)",
  "credits.ask": "Pedir",
  "credits.asking": "Pidiendo…",
  "credits.requestsTitle": "Créditos pendientes para ti",
  "credits.askedYou": "{name} te dio un crédito como",
  "credits.collaborations": "Colaboraciones",
  "credits.byOwner": "de {name}",
  "notif.creditRequest": "te dio un crédito en una obra",
  "notif.creditAccepted": "aceptó un crédito en tu obra",
  "target.viewCredit": "Ver crédito",
};
