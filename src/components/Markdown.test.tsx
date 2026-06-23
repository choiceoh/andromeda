import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Markdown } from "./Markdown";

describe("Markdown", () => {
  it("renders bold, italic, and inline code as semantic tags", () => {
    render(<Markdown text={"**굵게** _기울임_ `코드`"} />);
    expect(screen.getByText("굵게").tagName).toBe("STRONG");
    expect(screen.getByText("기울임").tagName).toBe("EM");
    expect(screen.getByText("코드").tagName).toBe("CODE");
  });

  it("renders an http link but drops a javascript: scheme to plain text", () => {
    render(<Markdown text={"[안전](https://example.com) [위험](javascript:alert(1))"} />);
    const link = screen.getByRole("link", { name: "안전" });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(screen.queryByRole("link", { name: /위험/ })).toBeNull();
    expect(screen.getByText(/위험/)).toBeInTheDocument();
  });

  it("renders an unordered list", () => {
    render(<Markdown text={"- 하나\n- 둘"} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("하나");
  });

  it("renders a fenced code block verbatim with a copy affordance", () => {
    render(<Markdown text={"```js\nconst a = 1;\n```"} />);
    expect(screen.getByText("const a = 1;").tagName).toBe("CODE");
    expect(screen.getByRole("button", { name: "코드 복사" })).toBeInTheDocument();
  });

  it("renders a GFM table", () => {
    render(<Markdown text={"| 이름 | 값 |\n| --- | --- |\n| A | 1 |"} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "이름" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "A" })).toBeInTheDocument();
  });

  it("renders plain text as a single paragraph", () => {
    render(<Markdown text="그냥 텍스트" />);
    expect(screen.getByText("그냥 텍스트").tagName).toBe("P");
  });
});
