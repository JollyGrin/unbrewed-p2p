import { describe, expect, test } from "vitest";
import { corsHeaders, parseAllowedOrigins, withCors } from "./cors";

describe("parseAllowedOrigins", () => {
  test("splits and trims a comma-separated list", () => {
    expect(parseAllowedOrigins("https://a.example, http://localhost:3000 ")).toEqual([
      "https://a.example",
      "http://localhost:3000",
    ]);
  });

  test("returns an empty list for undefined", () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
  });
});

describe("corsHeaders", () => {
  const allowed = ["https://a.example", "http://localhost:3000"];

  test("echoes an allowed origin", () => {
    expect(corsHeaders("https://a.example", allowed)).toMatchObject({ "Access-Control-Allow-Origin": "https://a.example" });
  });

  test("returns no headers for a disallowed origin", () => {
    expect(corsHeaders("https://evil.example", allowed)).toEqual({});
  });

  test("returns no headers when there is no origin", () => {
    expect(corsHeaders(null, allowed)).toEqual({});
  });
});

describe("withCors", () => {
  test("adds CORS headers to a response from an allowed origin", () => {
    const response = withCors(new Response("ok", { status: 200 }), "http://localhost:3000", ["http://localhost:3000"]);

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");
  });

  test("leaves the response untouched for a disallowed origin", () => {
    const response = withCors(new Response("ok", { status: 200 }), "https://evil.example", ["http://localhost:3000"]);

    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
