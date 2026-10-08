import type { Translation } from "../../index";
import type { time as en } from "../en/time";

export const time: Translation<typeof en> = {
  "time.justNow": "ahora mismo",
  "time.started": "ya empezó",
  "time.startingNow": "empieza ahora",
  "time.ago.minute": { one: "hace {n} minuto", other: "hace {n} minutos" },
  "time.ago.hour": { one: "hace {n} hora", other: "hace {n} horas" },
  "time.ago.day": { one: "hace {n} día", other: "hace {n} días" },
  "time.in.minute": { one: "en {n} minuto", other: "en {n} minutos" },
  "time.in.hour": { one: "en {n} hora", other: "en {n} horas" },
  "time.in.day": { one: "en {n} día", other: "en {n} días" },
  "time.left.day": { one: "queda {n} día", other: "quedan {n} días" },
  "time.left.lessThanDay": "queda menos de un día",
  "time.short.minutes": "hace {n} min",
  "time.short.hours": "hace {n} h",
  "time.short.days": "hace {n} d",
};
