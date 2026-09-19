const BASE_URL = (import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");

export async function api(path) {
  if (!BASE_URL) {
    throw new Error("VITE_API_URL is not configured.");
  }

  const response = await fetch(`${BASE_URL}${path}`);
  if (!response.ok) throw new Error(`API error ${response.status}`);
  return response.json();
}
