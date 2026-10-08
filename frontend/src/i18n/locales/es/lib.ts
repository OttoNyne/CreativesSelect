import type { Translation } from "../../index";
import type { lib as en } from "../en/lib";

export const lib: Translation<typeof en> = {
  "lib.videoTooBig": "Ese vídeo pesa {mb} MB y el límite es {limit} MB (prueba con un clip más corto o con una calidad menor en tu teléfono).",
  "lib.videoTooLong": "Los vídeos pueden durar hasta {max} segundos; este dura {seconds} segundos.",
  "lib.tagRange": "Usa de {min} a {max} letras, números, espacios o guiones",
  "lib.tagExists": "Ya tienes «{tag}»",
  "lib.tagMax": "Puedes tener hasta {max} etiquetas",
  "lib.liveUnsupported": "Este navegador no puede reproducir audio en vivo. Prueba con una versión reciente de Chrome, Edge, Firefox o Safari.",
  "pageTitle.forgot": "Contraseña olvidada",
  "pageTitle.reset": "Restablecer contraseña",
  "pageTitle.confirm": "Confirmar correo",
  "pageTitle.group": "Grupo",
  "pageTitle.post": "Publicación",
  "lib.liveUnsupportedHost": "Este navegador no puede transmitir audio en vivo. Prueba con una versión reciente de Chrome, Edge, Firefox o Safari.",
};
