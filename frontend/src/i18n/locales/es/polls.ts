import type { Translation } from "../../index";
import type { polls as en } from "../en/polls";

export const polls: Translation<typeof en> = {
  "polls.add": "Añadir una encuesta",
  "polls.remove": "Quitar la encuesta",
  "polls.heading": "Encuesta",
  "polls.option": "Opción {n}",
  "polls.addOption": "Añadir una opción",
  "polls.removeOption": "Quitar la opción {n}",
  "polls.length": "Duración de la encuesta",
  "polls.oneDay": "1 día",
  "polls.threeDays": "3 días",
  "polls.sevenDays": "7 días",
  "polls.votes": { one: "{n} voto", other: "{n} votos" },
  "polls.final": "Resultados finales",
  "polls.voteFor": "Votar por {option}",
  "polls.yourVote": "Tu voto",
  "polls.failed": "No se pudo votar, inténtalo de nuevo.",
  "polls.needTwo": "Una encuesta necesita al menos dos opciones con texto.",
};
