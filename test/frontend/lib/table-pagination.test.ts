import { describe, expect, it } from "vitest";

import {
  DEFAULT_PAGE_SIZE,
  filterBySearch,
  paginateItems,
} from "@/lib/table-pagination";

describe("table-pagination", () => {
  const items = Array.from({ length: 25 }, (_, index) => ({
    id: index + 1,
    name: `Item ${index + 1}`,
  }));

  it("paginates items", () => {
    const result = paginateItems(items, 2, 10);

    expect(result.page).toBe(2);
    expect(result.totalPages).toBe(3);
    expect(result.totalItems).toBe(25);
    expect(result.items).toHaveLength(10);
    expect(result.items[0]?.id).toBe(11);
  });

  it("filters items by search text", () => {
    const filtered = filterBySearch(items, "item 2", (item) => item.name);

    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((item) => item.name.toLowerCase().includes("item 2"))).toBe(
      true,
    );
  });

  it("uses default page size constant", () => {
    expect(DEFAULT_PAGE_SIZE).toBe(10);
  });
});
