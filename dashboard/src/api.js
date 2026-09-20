const BASE_URL = (import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");

export async function api(path) {
  if (!BASE_URL) {
    throw new Error("VITE_API_URL is not configured.");
  }

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`);
  } catch (error) {
    console.error(`API request failed: ${path}`, error);
    throw new Error("Unable to reach the inspection API. Check that it is running.");
  }
  if (!response.ok) {
    console.error(`API request failed: ${path} (HTTP ${response.status})`);
    throw new Error(`The inspection API returned HTTP ${response.status}.`);
  }
  return response.json();
}
