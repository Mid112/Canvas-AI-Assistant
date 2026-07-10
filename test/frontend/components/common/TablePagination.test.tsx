import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TablePagination } from "@/components/common/TablePagination";

describe("TablePagination", () => {
  // Verifies: Renders nothing when there are no items.
  it("renders nothing when there are no items", () => {
    const { container } = render(
      <TablePagination
        page={1}
        totalPages={1}
        totalItems={0}
        pageSize={10}
        onPageChange={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  // Verifies: Changes page size when the rows selector is used.
  it("changes page size when the rows selector is used", async () => {
    const user = userEvent.setup();
    const onPageSizeChange = vi.fn();

    render(
      <TablePagination
        page={1}
        totalPages={2}
        totalItems={30}
        pageSize={10}
        onPageChange={vi.fn()}
        onPageSizeChange={onPageSizeChange}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Rows per page"), "25");

    expect(onPageSizeChange).toHaveBeenCalledWith(25);
  });

  // Verifies: Renders pagination controls without a page-size selector.
  it("renders pagination controls without a page-size selector", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();

    render(
      <TablePagination
        page={2}
        totalPages={3}
        totalItems={30}
        pageSize={10}
        onPageChange={onPageChange}
      />,
    );

    expect(screen.queryByLabelText("Rows per page")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Previous page" }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });
});
