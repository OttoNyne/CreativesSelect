import type { Translation } from "../../index";
import type { mutes as en } from "../en/mutes";

export const mutes: Translation<typeof en> = {
  "mutes.title": "Silenciar",
  "mutes.intro": "Las personas y palabras silenciadas desaparecen de tu inicio y de Explorar, y las personas silenciadas también de tus notificaciones. Nadie recibe aviso.",
  "mutes.words": "Palabras y frases silenciadas",
  "mutes.wordLabel": "Una palabra o frase para silenciar",
  "mutes.addWord": "Silenciar palabra",
  "mutes.removeWord": "Dejar de silenciar {word}",
  "mutes.noWords": "No hay palabras silenciadas.",
  "mutes.people": "Personas silenciadas",
  "mutes.noPeople": "No has silenciado a nadie.",
  "mutes.unmute": "Dejar de silenciar",
  "mutes.unmuteLabel": "Dejar de silenciar a {name}",
  "mutes.mute": "Silenciar",
  "mutes.muteLabel": "Silenciar a {name}: sus publicaciones dejan de aparecer en tu inicio",
  "mutes.failed": "No se pudo hacer, inténtalo de nuevo.",
  "mutes.loadFailed": "No se pudo cargar tu lista de silenciados.",
};
