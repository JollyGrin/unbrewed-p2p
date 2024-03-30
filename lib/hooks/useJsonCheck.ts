import { useQuery } from "@tanstack/react-query";

export const useJsonCheck = (json?: string) => {
  const jsonString = json ?? "";
  return useQuery(
    ["json-check", jsonString.length, jsonString.substring(0, 5)],
    async () => await jsonCheck(jsonString),
    { enabled: !!json && json !== "" },
  );
};
async function jsonCheck(value: string) {
  try {
    JSON.parse(value);
    return true;
  } catch (err) {
    return false;
  }
}
