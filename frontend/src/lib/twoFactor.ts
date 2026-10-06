/** The setup key in groups of four, so it can be typed into an authenticator app without losing the place. */
export const groupKey = (secret: string) => secret.replace(/(.{4})/g, "$1 ").trim();
