import type { Translation } from "../../index";
import type { privatelive as en } from "../en/privatelive";

export const privatelive: Translation<typeof en> = {
  "privatelive.toggle": "Solo por invitación",
  "privatelive.hint": "Solo los amigos que elijas podrán ver este directo o unirse a él. Podrás invitar a más personas cuando ya estés en directo.",
  "privatelive.pick": "Amigos a invitar",
  "privatelive.noFriends": "Todavía no tienes amigos a quienes invitar. Aun así puedes empezar el directo y añadir personas más tarde.",
  "privatelive.picked": { one: "{n} amigo invitado", other: "{n} amigos invitados" },
  "privatelive.loadFailed": "No se pudieron cargar tus amigos, inténtalo de nuevo.",
  "privatelive.badge": "Privado",
  "privatelive.headerNote": "Un directo privado: solo lo ven las personas invitadas.",
  "privatelive.panelTitle": "Personas invitadas",
  "privatelive.empty": "Todavía no hay nadie invitado.",
  "privatelive.inRoom": "En la sala",
  "privatelive.remove": "Retirar",
  "privatelive.removeAria": "Retirar la invitación a {name}",
  "privatelive.addTitle": "Invitar a más amigos",
  "privatelive.invite": "Invitar",
  "privatelive.inviteAria": "Invitar a {name}",
  "privatelive.allInvited": "Todos tus amigos están invitados.",
  "privatelive.max": "Puedes invitar hasta a {max} personas.",
  "privatelive.startBusy": "Empezando…",
  "notif.liveInvite": "te invitó a un directo privado: «{title}»",
  "notif.liveInviteNoTitle": "te invitó a un directo privado",
};
