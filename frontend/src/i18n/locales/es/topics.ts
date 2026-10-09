import type { Translation } from "../../index";
import type { topics as en } from "../en/topics";

export const topics: Translation<typeof en> = {
  "topics.follow": "Seguir tema",
  "topics.following": "Siguiendo el tema",
  "topics.followLabel": "Seguir el tema {tag}",
  "topics.unfollowLabel": "Dejar de seguir el tema {tag}",
  "topics.yours": "Tus temas",
  "topics.noneFollowed": "Aún no sigues ningún tema. Abre un tema y síguelo.",
  "topics.everything": "Todo",
  "topics.fromYours": "De tus temas",
  "topics.emptyMine": "Aún no hay novedades en tus temas.",
  "topics.failed": "No se pudo hacer, inténtalo de nuevo.",
  "digest.title": "Resumen semanal",
  "digest.label": "Envíame por correo un breve resumen una vez a la semana",
  "digest.help": "Unas pocas cifras y títulos: nuevos seguidores, comentarios y respuestas, mensajes de tus salas de proyecto, convocatorias abiertas que encajan con lo que ofreces y novedades de los temas que sigues. No se envía nada cuando no hay nada que contar, y cada correo trae un enlace para desactivarlo.",
  "digest.unconfirmed": "Confirma primero tu correo: los resúmenes solo se envían a direcciones confirmadas.",
  "digest.failed": "No se pudo cambiar, inténtalo de nuevo.",
  "digest.unsubWorking": "Desactivando tu resumen semanal…",
  "digest.unsubDone": "Listo. Ya no recibirás el resumen semanal.",
  "digest.unsubDoneHint": "Puedes volver a activarlo en los ajustes de tu perfil.",
  "digest.unsubFailed": "Ese enlace ya no es válido. Puedes desactivar el resumen en los ajustes de tu perfil.",
  "digest.home": "Ir a CreativesSelect",
};
