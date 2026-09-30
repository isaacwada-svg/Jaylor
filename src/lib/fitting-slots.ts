export function groupFittingSlotsByDay(slots: string[]): { day: string; times: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const slot of slots) {
    const date = new Date(slot);
    const day = date.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const list = groups.get(day) ?? [];
    list.push(slot);
    groups.set(day, list);
  }
  return [...groups.entries()].map(([day, times]) => ({ day, times }));
}

export function formatFittingSlotTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
