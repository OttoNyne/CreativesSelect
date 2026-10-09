import type { Translation } from "../../index";
import type { explore as en } from "../en/explore";

export const explore: Translation<typeof en> = {
  "nav.explore": "Explorar",
  "explore.title": "Explorar",
  "explore.intro": "Publicaciones y piezas públicas de todo CreativesSelect. Añade un #hashtag a las tuyas para que te encuentren por tema.",
  "explore.tagLabel": "Buscar un tema",
  "explore.tagPlaceholder": "cerámica, mezcla, cartel…",
  "explore.show": "Mostrar",
  "explore.badTag": "Un tema es una palabra de letras, números o guiones bajos.",
  "explore.trending": "Tendencias de esta semana",
  "explore.people": { one: "{n} persona", other: "{n} personas" },
  "explore.noTrending": "Todavía no hay temas esta semana. Pon un #hashtag en una publicación o descripción para empezar uno.",
  "explore.kind": "Qué mostrar",
  "explore.posts": "Publicaciones",
  "explore.pieces": "Piezas",
  "explore.about": "Sobre #{tag}",
  "explore.clear": "Mostrar todo",
  "explore.empty": "Todavía no hay nada.",
  "explore.emptyTag": "Todavía no hay nada sobre #{tag}. ¡Sé la primera persona!",
  "explore.more": "Mostrar más",
  "explore.loading": "Cargando…",
  "explore.loadFailed": "No se pudo cargar Explorar, inténtalo de nuevo.",
  "explore.challenge": "Ver el reto creativo de esta semana",
};
