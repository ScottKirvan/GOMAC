import { describe, expect, it, vi } from "vitest";
import {
  extractStateAbbreviation,
  formatLocationLabel,
  getTimezoneAbbreviation,
  parseTimezoneFromGeocode,
  resolveLocation,
} from "../public/location.js";

describe("extractStateAbbreviation", () => {
  it("extracts state or province code from ISO compound codes", () => {
    expect(extractStateAbbreviation("US-CA", "California")).toBe("CA");
    expect(extractStateAbbreviation("US-UT", "Utah")).toBe("UT");
    expect(extractStateAbbreviation("CA-NS", "Nova Scotia")).toBe("NS");
  });

  it("falls back to subdivision name if no hyphen is present", () => {
    expect(extractStateAbbreviation(undefined, "Baja California")).toBe("Baja California");
  });
});

describe("formatLocationLabel", () => {
  const sampleData = {
    city: "Thompson Springs",
    locality: "Thompson Springs",
    principalSubdivision: "Utah",
    principalSubdivisionCode: "US-UT",
    countryCode: "US",
    localityInfo: {
      administrative: [
        { name: "United States of America", adminLevel: 2, description: "country in North America" },
        { name: "Utah", adminLevel: 4, description: "state of the United States of America" },
        { name: "Grand County", adminLevel: 6, description: "county in eastern Utah, United States" },
      ],
    },
  };

  it("formats feature with county and state when available", () => {
    expect(formatLocationLabel(sampleData, false)).toBe("Thompson Springs, Grand County, UT");
  });

  it("prepends 'Near ' when coordinates are coarsened/obfuscated", () => {
    expect(formatLocationLabel(sampleData, true)).toBe("Near Thompson Springs, Grand County, UT");
  });

  it("formats highway or landmark routes", () => {
    const routeData = {
      locality: "Potash Road",
      principalSubdivision: "Utah",
      principalSubdivisionCode: "US-UT",
      countryCode: "US",
      localityInfo: {
        administrative: [
          { name: "Grand County", description: "county" },
        ],
      },
    };
    expect(formatLocationLabel(routeData, false)).toBe("Potash Road, Grand County, UT");
    expect(formatLocationLabel(routeData, true)).toBe("Near Potash Road, Grand County, UT");
  });

  it("handles county-only fallback when no city or road feature exists", () => {
    const countyOnly = {
      principalSubdivision: "Nevada",
      principalSubdivisionCode: "US-NV",
      countryCode: "US",
      localityInfo: {
        administrative: [
          { name: "Elko County", description: "county in Nevada" },
        ],
      },
    };
    expect(formatLocationLabel(countyOnly, false)).toBe("Elko County, NV");
    expect(formatLocationLabel(countyOnly, true)).toBe("Near Elko County, NV");
  });

  it("handles missing or empty input gracefully", () => {
    expect(formatLocationLabel(null)).toBe("");
    expect(formatLocationLabel({})).toBe("");
  });
});

describe("parseTimezoneFromGeocode", () => {
  it("extracts the IANA timezone from informative list", () => {
    const data = {
      localityInfo: {
        informative: [
          { name: "North America", description: "continent" },
          { name: "America/Denver", description: "time zone" },
        ],
      },
    };
    expect(parseTimezoneFromGeocode(data)).toBe("America/Denver");
  });

  it("returns undefined when no timezone item is found", () => {
    expect(parseTimezoneFromGeocode({})).toBeUndefined();
    expect(parseTimezoneFromGeocode(null)).toBeUndefined();
  });
});

describe("getTimezoneAbbreviation", () => {
  it("resolves short timezone codes like PST and MST", () => {
    const winterDate = new Date("2026-01-15T12:00:00Z");
    const summerDate = new Date("2026-07-15T12:00:00Z");

    expect(getTimezoneAbbreviation("America/Los_Angeles", winterDate)).toBe("PST");
    expect(getTimezoneAbbreviation("America/Los_Angeles", summerDate)).toBe("PDT");
    expect(getTimezoneAbbreviation("America/Denver", winterDate)).toBe("MST");
    expect(getTimezoneAbbreviation("America/Denver", summerDate)).toBe("MDT");
  });

  it("returns undefined for missing or invalid timezone", () => {
    expect(getTimezoneAbbreviation(undefined)).toBeUndefined();
    expect(getTimezoneAbbreviation("Invalid/Timezone")).toBeUndefined();
  });
});

describe("resolveLocation", () => {
  it("fetches, parses, and caches geocode results", async () => {
    const mockData = {
      city: "Moab",
      locality: "Potash Road",
      principalSubdivision: "Utah",
      principalSubdivisionCode: "US-UT",
      countryCode: "US",
      localityInfo: {
        administrative: [{ name: "Grand County", description: "county" }],
        informative: [{ name: "America/Denver", description: "time zone" }],
      },
    };
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    });

    const res = await resolveLocation(38.612, -109.621, false, mockFetch);
    expect(res).not.toBeNull();
    expect(res?.label).toBe("Potash Road, Grand County, UT");
    expect(res?.timezone).toBe("America/Denver");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Second call within same 0.1 degree area hits in-memory cache
    const cached = await resolveLocation(38.635, -109.642, false, mockFetch);
    expect(cached?.label).toBe("Potash Road, Grand County, UT");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("returns null for invalid coordinates or network errors and does not cache failures", async () => {
    expect(await resolveLocation(undefined, undefined)).toBeNull();
    expect(await resolveLocation(Number.NaN, 0)).toBeNull();

    const failingFetch = vi.fn().mockRejectedValue(new Error("Network error"));
    expect(await resolveLocation(10.0, 20.0, false, failingFetch)).toBeNull();

    // Subsequent retry at same coordinates should not be poisoned by cached null
    const recoveringFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ city: "Testville", principalSubdivisionCode: "US-PA", countryCode: "US" }),
    });
    const recovered = await resolveLocation(10.0, 20.0, false, recoveringFetch);
    expect(recovered?.label).toBe("Testville, PA");
    expect(recoveringFetch).toHaveBeenCalledTimes(1);
  });

  it("handles malformed county entries without a name", () => {
    const malformed = {
      city: "Philadelphia",
      principalSubdivisionCode: "US-PA",
      localityInfo: { administrative: [{ description: "county" }] },
    };
    expect(formatLocationLabel(malformed, false)).toBe("Philadelphia, PA");
  });
});
