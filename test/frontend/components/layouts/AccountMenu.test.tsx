import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AccountMenu } from "@/components/layouts/AccountMenu";
import { paths } from "@/routes/paths";
import { renderWithRouter } from "@test/utils/renderWithRouter";

const mockNavigate = vi.fn();
const mockLogout = vi.fn();
const mockSetSelectedInstitution = vi.fn();
const mockUseInstitution = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    logout: mockLogout,
    user: {
      id: 1,
      email: "professor@university.edu",
      name: "Dr. Jane Doe",
      role: "instructor",
      is_active: true,
      has_canvas_token: false,
      canvas_connections: [],
    },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

vi.mock("@/contexts/useInstitution", () => ({
  useInstitution: () => mockUseInstitution(),
}));

describe("AccountMenu", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockLogout.mockClear();
    mockSetSelectedInstitution.mockClear();
    mockUseInstitution.mockReturnValue({
      institutions: [],
      selectedInstitution: {
        id: "ubc",
        name: "University of British Columbia",
        shortName: "UBC",
      },
      setSelectedInstitution: mockSetSelectedInstitution,
      courses: [],
      analytics: {},
      dashboard: {},
    });
  });

  it("shows the role under the name", () => {
    renderWithRouter(
      <AccountMenu role="instructor" roleLabel="Instructor" trigger="profile" />,
    );

    expect(screen.getByText("Dr. Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Instructor")).toBeInTheDocument();
  });

  it("keeps institution switching in the account menu", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockUseInstitution.mockReturnValue({
      institutions: [
        {
          id: "connection-1",
          name: "http://localhost:3000",
          shortName: "localhost",
          canvasUrl: "http://localhost:3000",
        },
      ],
      selectedInstitution: {
        id: "connection-1",
        name: "http://localhost:3000",
        shortName: "localhost",
        canvasUrl: "http://localhost:3000",
      },
      setSelectedInstitution: mockSetSelectedInstitution,
      courses: [],
      analytics: {},
      dashboard: {},
    });

    renderWithRouter(
      <AccountMenu role="instructor" roleLabel="Instructor" trigger="profile" />,
    );

    expect(screen.getByText("Instructor")).toBeInTheDocument();
    expect(screen.queryByText("localhost")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Account menu" }));
    expect(await screen.findByText("Institution")).toBeInTheDocument();
    expect(screen.getByText("localhost")).toBeInTheDocument();
  });

  it("lets the instructor switch institutions from the account menu", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockUseInstitution.mockReturnValue({
      institutions: [
        {
          id: "ubc",
          name: "University of British Columbia",
          shortName: "UBC",
          canvasUrl: "https://canvas.ubc.ca",
        },
        {
          id: "ubco",
          name: "UBC Okanagan",
          shortName: "UBCO",
          canvasUrl: "https://canvas.ok.ubc.ca",
        },
      ],
      selectedInstitution: {
        id: "ubc",
        name: "University of British Columbia",
        shortName: "UBC",
        canvasUrl: "https://canvas.ubc.ca",
      },
      setSelectedInstitution: mockSetSelectedInstitution,
      courses: [],
      analytics: {},
      dashboard: {},
    });

    renderWithRouter(
      <AccountMenu role="instructor" roleLabel="Instructor" trigger="profile" />,
    );

    await user.click(screen.getByRole("button", { name: "Account menu" }));
    await user.click(await screen.findByText("UBCO"));

    expect(mockSetSelectedInstitution).toHaveBeenCalledWith("ubco");
  });

  it("renders the icon trigger without profile details", () => {
    renderWithRouter(<AccountMenu role="instructor" trigger="icon" />);

    expect(screen.getByRole("button", { name: "Account menu" })).toBeInTheDocument();
    expect(screen.queryByText("Dr. Jane Doe")).not.toBeInTheDocument();
  });

  it("navigates to profile from the account menu", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    renderWithRouter(<AccountMenu role="instructor" trigger="icon" />);

    await user.click(screen.getByRole("button", { name: "Account menu" }));
    await user.click(await screen.findByText("Profile"));

    expect(mockNavigate).toHaveBeenCalledWith(paths.instructor.profile);
  });

  it("navigates to home from the account menu", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    renderWithRouter(<AccountMenu role="instructor" trigger="icon" />);

    await user.click(screen.getByRole("button", { name: "Account menu" }));
    await user.click(await screen.findByText("Home"));

    expect(mockNavigate).toHaveBeenCalledWith(paths.home);
  });

  it("logs out and navigates to login", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onNavigate = vi.fn();

    renderWithRouter(
      <AccountMenu role="instructor" trigger="icon" onNavigate={onNavigate} />,
    );

    await user.click(screen.getByRole("button", { name: "Account menu" }));
    await user.click(await screen.findByText("Log out"));

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(paths.login);
  });
});
