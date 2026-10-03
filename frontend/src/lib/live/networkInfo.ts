interface NetworkInformation {
  type?: string;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

/** One line about the phone's own network, as the browser reports it (not every browser says much). */
export function describeNetwork(nav: Navigator = navigator): string {
  const info = (nav as Navigator & { connection?: NetworkInformation }).connection;
  const parts = [nav.onLine ? "Online" : "Offline"];
  if (info?.type) parts.push(info.type);
  if (info?.effectiveType) parts.push(info.effectiveType);
  if (typeof info?.downlink === "number") parts.push(`${info.downlink} Mbps down`);
  if (typeof info?.rtt === "number") parts.push(`${info.rtt} ms round trip`);
  if (info?.saveData) parts.push("data saver on");
  return parts.join(" · ");
}
