import type { Translation } from "../../index";
import type { follow as en } from "../en/follow";

export const follow: Translation<typeof en> = {
  "follow.follow": "Seguir",
  "follow.following": "Siguiendo",
  "follow.followLabel": "Seguir a {name}",
  "follow.unfollowLabel": "Dejar de seguir a {name}",
  "follow.unfollow": "Dejar de seguir",
  "follow.followers": { one: "{n} seguidor", other: "{n} seguidores" },
  "follow.followingCount": "{n} siguiendo",
  "follow.countsLabel": "Seguidores y seguidos",
  "follow.followersTitle": "Tus seguidores",
  "follow.followingTitle": "Personas que sigues",
  "follow.noFollowers": "Todavía nadie te sigue.",
  "follow.noFollowing": "Todavía no sigues a nadie. Sigue a personas con perfil público para ver sus publicaciones en tu inicio.",
  "follow.more": "Mostrar más",
  "follow.close": "Cerrar",
  "follow.failed": "No se pudo hacer, inténtalo de nuevo.",
  "follow.loading": "Cargando…",
  "notif.follow": "empezó a seguirte",
};
