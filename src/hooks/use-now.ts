import { useEffect, useState } from 'react';

/** Current time in ms, refreshed every minute (so "50 min so far" stays true while the page is open). */
export function useNow(everyMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}
