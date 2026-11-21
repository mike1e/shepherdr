// The inbox's list as plain data: [{ id, text, done }]. Pure, so a test can check it.
export const clean = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x.text === "string" && x.text) : []);
export const add = (list, text, id = Date.now()) => {
  const t = String(text ?? "").trim();
  return t ? [...clean(list), { id, text: t.slice(0, 200), done: false }] : clean(list);
};
export const toggle = (list, id) => clean(list).map((x) => (x.id === id ? { ...x, done: !x.done } : x));
export const remove = (list, id) => clean(list).filter((x) => x.id !== id);
// Open items first (in the order added), done ones after.
export const ordered = (list) => [...clean(list).filter((x) => !x.done), ...clean(list).filter((x) => x.done)];
export const clearDone = (list) => clean(list).filter((x) => !x.done);
export const count = (list) => { const l = clean(list); return `${l.filter((x) => !x.done).length} open${l.some((x) => x.done) ? ` · ${l.filter((x) => x.done).length} done` : ""}`; };
