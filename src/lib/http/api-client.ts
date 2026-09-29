export async function apiRequest<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Request failed.");
  }

  return payload.data as T;
}

