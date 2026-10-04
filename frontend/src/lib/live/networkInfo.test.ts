import { describe, expect, it } from "vitest";
import { describeNetwork, onMobileData } from "./networkInfo";

const nav = (over: Record<string, unknown>) => over as unknown as Navigator;

describe("describeNetwork", () => {
  it("says what the browser reports about the phone's network", () => {
    expect(describeNetwork(nav({ onLine: true, connection: { type: "cellular", effectiveType: "4g", downlink: 12.5, rtt: 80 } }))).toBe(
      "Online · cellular · 4g · 12.5 Mbps down · 80 ms round trip"
    );
  });

  it("copes with a browser that says little or nothing", () => {
    expect(describeNetwork(nav({ onLine: true }))).toBe("Online");
    expect(describeNetwork(nav({ onLine: false, connection: {} }))).toBe("Offline");
  });

  it("notes data saver", () => {
    expect(describeNetwork(nav({ onLine: true, connection: { saveData: true } }))).toBe("Online · data saver on");
  });
});

describe("onMobileData", () => {
  it("is true only when the browser says the phone is on mobile data", () => {
    expect(onMobileData(nav({ connection: { type: "cellular" } }))).toBe(true);
    for (const connection of [{ type: "wifi" }, { type: "ethernet" }, {}, undefined]) expect(onMobileData(nav({ connection }))).toBe(false);
  });
});
