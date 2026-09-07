window.__ModuleLoader__.load({ id: "@pqg/reference-module", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
const React = require("react");
const inject = ["slots", "pqgShell"];
async function referenceModuleEnabled() {
  try {
    const response = await fetch("/api/pqg.modules", { headers: { accept: "application/json" } });
    if (!response.ok) return false;
    const body = await response.json();
    return Array.isArray(body.modules) && body.modules.some((module2) => module2.id === "reference" && module2.enabled === true);
  } catch {
    return false;
  }
}
function ReferenceNavigation({ activeId, navigate }) {
  return React.createElement(
    "button",
    {
      type: "button",
      "data-pqg-reference-nav": true,
      "aria-current": activeId === "reference" ? "page" : void 0,
      onClick: () => navigate("reference"),
      style: {
        width: "100%",
        padding: "9px 12px",
        border: 0,
        borderRadius: 8,
        background: activeId === "reference" ? "var(--mantine-color-blue-light, #eef4ff)" : "transparent",
        color: "inherit",
        textAlign: "left",
        cursor: "pointer",
        font: "inherit"
      }
    },
    "Mô-đun mẫu"
  );
}
function ReferenceWorkspace(_props) {
  return React.createElement(
    "section",
    { "data-pqg-reference-workspace": true, style: { padding: 8 } },
    React.createElement("h1", { style: { margin: "0 0 8px", fontSize: 24 } }, "Mô-đun mẫu"),
    React.createElement("p", { style: { margin: 0, color: "var(--mantine-color-dimmed, #667085)" } }, "Mô-đun mẫu đã kết nối qua PQG Shell.")
  );
}
function ReferenceHomeWidget(_props) {
  return React.createElement("div", { "data-pqg-reference-home-widget": true }, "Mô-đun mẫu đã sẵn sàng.");
}
function ReferenceSupportContext({ activeId }) {
  if (activeId !== "reference") return null;
  return React.createElement("p", { "data-pqg-reference-support-context": true, style: { margin: 0, fontSize: 13 } }, "Bạn đang ở Mô-đun mẫu.");
}
function ReferenceSupportSuggestion({ activeId }) {
  if (activeId !== "reference") return null;
  return React.createElement("p", { "data-pqg-reference-support-suggestion": true, style: { margin: 0, fontSize: 13 } }, "Gợi ý theo ngữ cảnh sẽ xuất hiện tại đây.");
}
async function apply(ctx) {
  if (!await referenceModuleEnabled()) return;
  const services = ctx.pqgShell;
  ctx.effect(() => services.registerSearchProvider({
    id: "reference",
    label: "Mô-đun mẫu",
    async search(query) {
      const normalized = query.toLocaleLowerCase("vi");
      if (!"mô-đun mẫu reference module".includes(normalized)) return [];
      return [{
        id: "open-reference",
        label: "Mô-đun mẫu",
        description: "Mở không gian của mô-đun mẫu",
        keywords: ["reference", "module"],
        targetId: "reference"
      }];
    }
  }));
  ctx.effect(() => services.registerSupportProvider({
    id: "reference",
    supportFor(activeId) {
      if (activeId !== "reference") return void 0;
      return {
        title: "Mô-đun mẫu",
        summary: "Bạn đang làm việc trong Mô-đun mẫu.",
        suggestions: [
          { id: "explain", label: "Giải thích khu vực này" },
          { id: "next-step", label: "Gợi ý bước tiếp theo" }
        ]
      };
    }
  }));
  ctx.slots.inject("pqg.shell.navigation", () => ctx.slots.register({
    name: "pqg.shell.navigation",
    id: "reference",
    order: 0,
    label: "Mô-đun mẫu"
  }, ReferenceNavigation));
  ctx.slots.inject("pqg.shell.workspace", () => ctx.slots.register({
    name: "pqg.shell.workspace",
    select: ({ activeId }) => activeId === "reference" ? { moduleId: "reference" } : null
  }, ReferenceWorkspace));
  ctx.slots.inject("pqg.shell.home.widget", () => ctx.slots.register({
    name: "pqg.shell.home.widget",
    id: "reference",
    order: 0,
    label: "Mô-đun mẫu"
  }, ReferenceHomeWidget));
  ctx.slots.inject("pqg.shell.support.context", () => ctx.slots.register({
    name: "pqg.shell.support.context",
    id: "reference",
    order: 0,
    label: "Mô-đun mẫu"
  }, ReferenceSupportContext));
  ctx.slots.inject("pqg.shell.support.suggestion", () => ctx.slots.register({
    name: "pqg.shell.support.suggestion",
    id: "reference",
    order: 0,
    label: "Mô-đun mẫu"
  }, ReferenceSupportSuggestion));
}
module.exports = { inject, apply };
return module.exports; } });
