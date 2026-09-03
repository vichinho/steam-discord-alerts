const formatters = new Map<string, Intl.DateTimeFormat>();
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
export function localTime(at: number, timezone: string): { day: string; time: string } {
  let f = formatters.get(timezone);
  if (!f) { f = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); formatters.set(timezone, f); }
  const p = Object.fromEntries(f.formatToParts(at).map(v => [v.type, v.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
export function dayAge(date: string, localDay: string): number { return (Date.parse(localDay) - Date.parse(date)) / DAY; }
