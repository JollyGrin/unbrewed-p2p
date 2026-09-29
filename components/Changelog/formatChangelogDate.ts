/**
 * "yyyy-mm-dd" -> "27 September 2026". Parsed and formatted in UTC so the
 * date never shifts a day depending on the visitor's timezone offset.
 */
export const formatChangelogDate = (dateStr: string): string => {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
};
