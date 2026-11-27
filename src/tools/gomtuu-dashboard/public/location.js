/**
 * Client-side location & timezone adapter.
 *
 * Translates GPS coordinates into a human-readable location description
 * and local timezone. Designed to be cleanly swappable to a server-side
 * API endpoint in the future without modifying UI components.
 */

const CACHE = new Map();

/** Extracts the state or province abbreviation from a code like "US-CA" or "CA-NS". */
export function extractStateAbbreviation(subdivisionCode, subdivisionName) {
  if (subdivisionCode && subdivisionCode.includes("-")) {
    return subdivisionCode.split("-")[1].toUpperCase();
  }
  return subdivisionCode || subdivisionName || "";
}

/** Formats a human-readable location label respecting obfuscation. */
export function formatLocationLabel(data, isCoarse = false) {
  if (!data) return "";

  const locality = data.locality?.trim() || "";
  const city = data.city?.trim() || "";
  const feature = locality || city;

  // Find county if present in administrative hierarchy
  const adminList = data.localityInfo?.administrative || [];
  const countyObj = adminList.find(
    (item) => item.description?.toLowerCase().includes("county") || item.name?.toLowerCase().includes("county"),
  );
  const county = countyObj ? countyObj.name.trim() : "";

  const state = extractStateAbbreviation(data.principalSubdivisionCode, data.principalSubdivision);
  const country = data.countryCode?.toUpperCase() || "";

  let base = "";
  if (feature) {
    if (county && !feature.toLowerCase().includes(county.toLowerCase()) && !county.toLowerCase().includes(feature.toLowerCase())) {
      base = state ? `${feature}, ${county}, ${state}` : `${feature}, ${county}`;
    } else {
      base = state ? `${feature}, ${state}` : feature;
    }
  } else if (county) {
    base = state ? `${county}, ${state}` : county;
  } else if (state) {
    base = country && country !== "US" ? `${state}, ${country}` : state;
  } else if (data.countryName) {
    base = data.countryName;
  }

  if (!base) return "";
  return isCoarse ? `Near ${base}` : base;
}

/** Parses the IANA timezone string from BigDataCloud localityInfo. */
export function parseTimezoneFromGeocode(data) {
  if (!data) return undefined;
  const informative = data.localityInfo?.informative || [];
  const tzItem = informative.find(
    (item) => item.description?.toLowerCase().includes("time zone") || /^[A-Za-z_]+\/[A-Za-z_]+$/.test(item.name || ""),
  );
  return tzItem?.name?.trim();
}

/** Resolves the short timezone abbreviation (e.g. "PST", "MST") using built-in Intl. */
export function getTimezoneAbbreviation(timezone, date = new Date()) {
  if (!timezone) return undefined;
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZoneName: "short", timeZone: timezone }).formatToParts(date);
    const part = parts.find((p) => p.type === "timeZoneName");
    return part ? part.value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolves location and timezone for given coordinates.
 * Caches by 1-decimal coordinate to prevent duplicate lookups within ~11 km.
 */
export async function resolveLocation(lat, lon, isCoarse = false, fetchFn = fetch) {
  if (lat === undefined || lon === undefined || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  const cacheKey = `${lat.toFixed(1)},${lon.toFixed(1)},${Boolean(isCoarse)}`;
  if (CACHE.has(cacheKey)) {
    return CACHE.get(cacheKey);
  }

  const promise = (async () => {
    try {
      const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`;
      const res = await fetchFn(url);
      if (!res.ok) return null;
      const data = await res.json();

      const label = formatLocationLabel(data, isCoarse);
      const timezone = parseTimezoneFromGeocode(data);
      const timezoneAbbreviation = getTimezoneAbbreviation(timezone);

      return {
        label,
        feature: data.locality || data.city,
        locality: data.locality,
        city: data.city,
        state: data.principalSubdivision,
        stateCode: extractStateAbbreviation(data.principalSubdivisionCode, data.principalSubdivision),
        countryCode: data.countryCode,
        timezone,
        timezoneAbbreviation,
        isCoarse,
      };
    } catch {
      return null;
    }
  })();

  CACHE.set(cacheKey, promise);
  return promise;
}
