export function fromRow(row) {
  if (Array.isArray(row)) return row.map(fromRow);
  if (!row || typeof row !== "object") return row;

  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      return [camelKey === "id" ? "_id" : camelKey, fromRow(value)];
    })
  );
}

export function toRow(record) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
      value
    ])
  );
}

export function throwIfError(result) {
  if (result.error) throw result.error;
  return result.data;
}
