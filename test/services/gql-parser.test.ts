import { describe, it, expect } from "vitest";
import { containsMutation } from "../../src/services/gql-parser";

describe("containsMutation", () => {
  it("returns false for shorthand query", () => {
    expect(containsMutation("{ boards { id name } }")).toBe(false);
  });

  it("returns false for named query", () => {
    expect(containsMutation("query GetBoards { boards { id name } }")).toBe(false);
  });

  it("returns true for shorthand mutation", () => {
    expect(containsMutation('mutation { create_board(board_name: "test") { id } }')).toBe(true);
  });

  it("returns true for named mutation", () => {
    expect(containsMutation("mutation CreateBoard { create_board { id } }")).toBe(true);
  });

  it("returns false when mutation appears only in a string literal", () => {
    expect(containsMutation('query { items(name: "mutation test") { id } }')).toBe(false);
  });

  it("returns false when mutation appears only in a comment", () => {
    expect(containsMutation("# mutation\nquery { boards { id } }")).toBe(false);
  });

  it("returns false when mutation is a substring of another word", () => {
    expect(containsMutation('query { items(ids: ["mutation_log"]) { id } }')).toBe(false);
  });

  it("returns true for mutation with leading whitespace", () => {
    expect(containsMutation("  \n  mutation { create_board { id } }")).toBe(true);
  });

  it("returns true for mutation after a comment", () => {
    expect(containsMutation("# get stuff\nmutation { create_board { id } }")).toBe(true);
  });

  it("returns false for block string containing mutation", () => {
    expect(containsMutation('query { items { column_values(value: """mutation foo""") { id } } }')).toBe(false);
  });

  it("handles empty string", () => {
    expect(containsMutation("")).toBe(false);
  });
});
