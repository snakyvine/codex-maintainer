export function paginate(items, pageNumber, pageSize) {
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    throw new RangeError('pageNumber must be a positive integer');
  }
  const start = (pageNumber - 1) * pageSize;
  return items.slice(start, start + pageSize);
}
