import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExerciseCreationForm } from "../../../src/features/exercises/ExerciseCreationForm";

type MockResponseData = Record<string, unknown>;

function mockOkResponse(data: MockResponseData): Response {
  return {
    ok: true,
    json: () => Promise.resolve(data),
  } as Response;
}

async function hashTextToHex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

const mockFetch = vi.fn();

vi.stubGlobal("fetch", mockFetch);

describe("ExerciseCreationForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue(
      mockOkResponse({ id: 101 }),
    );
  });

  it("shows default axis values for both 1H and 13C sections", () => {
    render(<ExerciseCreationForm />);

    expect(screen.getAllByDisplayValue("10.1")).toHaveLength(1);
    expect(screen.getAllByDisplayValue("-0.1")).toHaveLength(1);
    expect(screen.getAllByDisplayValue("213.0")).toHaveLength(1);
    expect(screen.getAllByDisplayValue("-2.0")).toHaveLength(1);
  });

  it("submits successfully without uploaded SVG files by using placeholders", async () => {
    const user = userEvent.setup();
    const casInput = "7a05a4f3dc259426ffd8be334301a471197bb1f72b72e81dac2aa0cd62adec71";

    render(<ExerciseCreationForm />);

    await user.type(
      screen.getByPlaceholderText(/1H-NMR \(CDCl3, 300 MHz\)/i),
      "1H-NMR (CDCl3, 300 MHz): 1.00 (3H, s);",
    );
    await user.type(
      screen.getByPlaceholderText(/13C-NMR \(CDCl3, 75 MHz\)/i),
      "13C-NMR (CDCl3, 75 MHz): 24.3;",
    );
    await user.type(
      screen.getAllByPlaceholderText(/Any text will be hashed with SHA-256 before submit/i)[1],
      casInput,
    );

    await user.click(screen.getByRole("button", { name: /Create exercise/i }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/exercises/");
    expect(init.method).toBe("POST");

    const body = JSON.parse(String(init.body)) as Record<string, unknown>;

    expect(body.h1_spectrum_svg).toMatchObject({
      filename: "h1_placeholder.svg",
    });
    expect(body.c13_spectrum_svg).toMatchObject({
      filename: "c13_placeholder.svg",
    });

    expect((body.h1_spectrum_svg as { svg_text: string }).svg_text).toContain(
      "<svg",
    );
    expect((body.c13_spectrum_svg as { svg_text: string }).svg_text).toContain(
      "<svg",
    );

    expect(body.h1_axis_scale).toEqual({ begin: 10.1, end: -0.1 });
    expect(body.c13_axis_scale).toEqual({ begin: 213.0, end: -2.0 });
    expect(body.solution_cas_number).toBe(await hashTextToHex(casInput));

    expect(
      await screen.findByText(/Exercise 101 created\./i),
    ).toBeInTheDocument();
  });

  it("does not render CSV bulk import controls", () => {
    render(<ExerciseCreationForm />);

    expect(
      document.querySelector('input[type="file"][accept=".csv,text/csv"]'),
    ).toBeNull();
    expect(screen.queryByText(/Bulk import from CSV/i)).not.toBeInTheDocument();
  });
});
