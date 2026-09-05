window.__ModuleLoader__.load({ id: "@pqg/module-settings", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var pqg_module_settings_client_exports = {};
module.exports = __toCommonJS(pqg_module_settings_client_exports);
const React = require("react");
const { createElement, useEffect, useRef, useState } = React;
const sectionStyle = {
  display: "grid",
  gap: "16px",
  maxWidth: "720px"
};
const listStyle = {
  display: "grid",
  gap: "10px",
  margin: 0,
  padding: 0,
  listStyle: "none"
};
const rowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "16px",
  padding: "14px 16px",
  border: "1px solid var(--dsw-alias-border-secondary, #e5e7eb)",
  borderRadius: "10px",
  background: "var(--dsw-alias-bg-layer-1, #fff)"
};
const buttonBaseStyle = {
  minWidth: "64px",
  height: "32px",
  padding: "0 14px",
  borderRadius: "8px",
  font: "inherit",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer"
};
async function loadModules() {
  const response = await fetch("/api/pqg.modules", { headers: { accept: "application/json" } });
  const body = await response.json();
  if (!response.ok || !Array.isArray(body.modules)) {
    throw new Error(body.error?.message || `HTTP ${String(response.status)}`);
  }
  return body.modules;
}
async function setEnabled(id, enabled) {
  const response = await fetch("/api/pqg.modules", {
    method: "PUT",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ id, enabled })
  });
  const body = await response.json();
  if (!response.ok || !body.module) {
    throw new Error(body.error?.message || `HTTP ${String(response.status)}`);
  }
  return body.module;
}
function ModuleSettingsSection() {
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState(null);
  const savingRef = useRef(false);
  const reload = () => {
    setLoading(true);
    setError(null);
    void loadModules().then(
      (value) => {
        setModules(value);
        setLoading(false);
      },
      () => {
        setError("Không thể tải danh sách tiện ích.");
        setLoading(false);
      }
    );
  };
  useEffect(() => {
    let active = true;
    void loadModules().then(
      (value) => {
        if (!active) return;
        setModules(value);
        setLoading(false);
      },
      () => {
        if (!active) return;
        setError("Không thể tải danh sách tiện ích.");
        setLoading(false);
      }
    );
    return () => {
      active = false;
    };
  }, []);
  const toggle = (module2) => {
    if (savingRef.current || savingId !== null) return;
    savingRef.current = true;
    setSavingId(module2.id);
    setError(null);
    void setEnabled(module2.id, !module2.enabled).then(
      (updated) => {
        setModules(modules.map((row) => row.id === updated.id ? updated : row));
        savingRef.current = false;
        setSavingId(null);
      },
      () => {
        setError("Không thể cập nhật tiện ích. Vui lòng thử lại.");
        savingRef.current = false;
        setSavingId(null);
      }
    );
  };
  return createElement(
    "section",
    { style: sectionStyle, "aria-busy": loading },
    createElement(
      "div",
      null,
      createElement("h2", { style: { margin: 0, fontSize: "20px" } }, "Tiện ích"),
      createElement("p", {
        style: { margin: "6px 0 0", color: "var(--dsw-alias-label-secondary, #667085)" }
      }, "Bật hoặc tắt các tiện ích đã được cài đặt.")
    ),
    loading ? createElement("p", null, "Đang tải…") : null,
    !loading && error ? createElement(
      "div",
      { role: "alert" },
      createElement("p", { style: { margin: "0 0 8px" } }, error),
      createElement("button", { type: "button", onClick: reload }, "Thử lại")
    ) : null,
    !loading && !error && modules.length === 0 ? createElement("p", { style: { margin: 0 } }, "Chưa có tiện ích nào được cài đặt.") : null,
    !loading && modules.length > 0 ? createElement("ul", { style: listStyle }, ...modules.map((module2) => {
      const enabled = module2.enabled;
      const saving = savingId !== null;
      const savingThis = savingId === module2.id;
      return createElement(
        "li",
        { key: module2.id, style: rowStyle },
        createElement("strong", null, module2.label),
        createElement("button", {
          type: "button",
          "aria-pressed": enabled,
          disabled: saving,
          onClick: () => toggle(module2),
          style: {
            ...buttonBaseStyle,
            border: enabled ? "1px solid var(--dsw-alias-brand-primary, #3964fe)" : "1px solid var(--dsw-alias-border-primary, #d0d5dd)",
            background: enabled ? "var(--dsw-alias-brand-primary, #3964fe)" : "var(--dsw-alias-bg-layer-1, #fff)",
            color: enabled ? "#fff" : "var(--dsw-alias-label-primary, #1f2328)",
            opacity: saving ? 0.6 : 1
          }
        }, savingThis ? "Đang lưu…" : enabled ? "Tắt" : "Bật")
      );
    })) : null
  );
}
const inject = ["slots"];
function apply(ctx) {
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "pqg-modules",
    order: 18,
    label: () => "Tiện ích"
  }, ModuleSettingsSection));
}
module.exports = { inject, apply };
return module.exports; } });
