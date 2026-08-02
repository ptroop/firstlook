export async function readJsonBody(response: Response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

