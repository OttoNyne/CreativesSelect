import type { Translation } from "../../index";
import type { report as en } from "../en/report";

export const report: Translation<typeof en> = {
  "report.button": "Denunciar",
  "report.post": "Denunciar esta publicación",
  "report.piece": "Denunciar esta obra",
  "report.step": "Denunciar este paso",
  "report.call": "Denunciar esta convocatoria",
  "report.answer": "Denunciar esta respuesta de {name}",
  "report.reasonLabel": "¿Cuál es el problema?",
  "report.reasonPlaceholder": "Cuéntale a un moderador qué ocurre.",
  "report.send": "Enviar denuncia",
  "report.sending": "Enviando…",
  "report.cancel": "Cancelar",
  "report.thanks": "Gracias. Un moderador la revisará.",
  "report.failed": "No se pudo enviar la denuncia, inténtalo de nuevo.",
  "misc.type.piece": "Obra del portafolio",
  "misc.type.processStep": "Paso de una obra",
  "misc.type.call": "Convocatoria abierta",
  "misc.type.callApplication": "Respuesta a una convocatoria",
  "notif.what.piece": "obra del portafolio",
  "notif.what.processStep": "paso de una obra del portafolio",
  "notif.what.call": "convocatoria abierta",
  "notif.what.callApplication": "respuesta a una convocatoria abierta",
};
