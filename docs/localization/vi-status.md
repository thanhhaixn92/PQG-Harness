# Vietnamese Locale Status — Foundation Core

Review date: 2026-09-04
Pinned DSH wave: `0.1.0-rc.6`

## Decision

Full compiled Vietnamese localization is **DEFERRED** for Foundation Core.

For browser locale selection:

- `zh` / `zh-*` selects the shipped Chinese locale;
- every other browser language, including `vi` / `vi-VN`, selects the shipped English locale;
- deployment hostname no longer decides the initial UI language.

This keeps Vietnamese browsers on a complete shipped dictionary instead of exposing a partial locale.

## Pinned rc.6 locale extension review

The generated `@deepseek-ai/dsh-client-locale` client exposes a runtime dictionary-registration method:

```text
LocaleRuntime.register(namespace, localeOrDicts, dict)
```

This method can register dictionary entries for a namespace and locale id. It is useful for extending translations inside an already known locale.

However, the selectable locale registry itself is not externally extensible in the reviewed rc.6 client:

```text
const LOCALES = Object.freeze([
  { id: "zh", label: "中文" },
  { id: "en", label: "English" }
])
```

`LocaleRuntime` snapshots this fixed `LOCALES` array, and `setLocale(id)` rejects ids that are not present in `snapshot.locales`.

The Settings language row does read `snapshot.locales` when it synchronizes its selector, but that snapshot is backed by the fixed two-entry array. Dictionary registration does not add a new locale descriptor and there is no reviewed external `registerLocale` / `addLocale` contract that extends the selector safely.

## Foundation Core interpretation

An external PQG product plugin could add Vietnamese dictionaries for individual namespaces, but it cannot make `vi` a complete first-class selectable locale without patching the pinned locale runtime/registry itself and supplying dictionaries for every participating namespace.

That would create a broad compiled-frontend fork and a large drift surface, which is outside the Personal v1 Foundation Core cutoff.

Therefore:

```text
locale registration symbol/path: LocaleRuntime.register(ns, localeOrDicts, dict)
namespace dictionary mechanism: per-namespace runtime Map registration
external complete vi registration: NO clean reviewed path in rc.6
Settings selector dynamic: reads snapshot.locales, but the underlying LOCALES registry is fixed to zh/en
final decision: full Vietnamese deferred; vi-VN falls back to English
```

## Revisit condition

Revisit full Vietnamese only when one of these is true:

1. a later pinned DSH version exposes a stable external locale-descriptor registration API; or
2. Vietnamese product localization becomes important enough to justify maintaining a deliberate frontend locale fork with complete namespace coverage and dedicated regression tests.
