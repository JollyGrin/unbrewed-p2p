import { useQuery } from "@tanstack/react-query";
import axios from "axios";

export const useGenericImport = (url?: string) => {
  return useQuery(["urlData", url], async () => await axios.get(url ?? ""), {
    enabled: !!url,
  });
};
