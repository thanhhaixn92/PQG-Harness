import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { product } from '../config/product.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))

function requireReplace(source, find, replacement, label) {
  if (!source.includes(find)) throw new Error(`PQG product patch point missing: ${label}`)
  return source.replace(find, replacement)
}

export function applyHtmlProductLayer(source) {
  let next = source.replace(/<title>[^<]*<\/title>/, `<title>${product.name}</title>`)
  if (next === source) throw new Error('PQG product patch point missing: HTML title')

  const attribution = [
    `<meta name="pqg-source" content="${product.repositoryUrl}" />`,
    `<meta name="pqg-upstream-adapter" content="${product.upstreamAdapterUrl}" />`,
    `<meta name="pqg-upstream-core" content="${product.upstreamCoreUrl}" />`,
  ].join('')
  if (!next.includes('name="pqg-source"')) {
    next = requireReplace(next, '<meta charset="utf-8" />', `<meta charset="utf-8" />${attribution}`, 'source attribution')
  }

  next = requireReplace(
    next,
    'document.documentElement.lang = intl ? "en" : "zh-CN";',
    'const browserTags = [...(navigator.languages ?? []), navigator.language]; document.documentElement.lang = browserTags.some((tag) => String(tag || "").toLowerCase().split("-")[0] === "zh") ? "zh-CN" : "en";',
    'initial document locale',
  )
  next = requireReplace(next, 'return intl ? "en" : "zh";', 'return "en";', 'chrome locale fallback')
  next = requireReplace(
    next,
    `github.href = "${product.upstreamAdapterUrl}";`,
    `github.href = "${product.repositoryUrl}";`,
    'local source link',
  )

  const oldDialogBehavior = `    const close = () => {
      dialog.hidden = true;
      more.focus();
    };
    const open = () => {
      dialog.hidden = false;
      dialog.querySelector(".dsh-makers-contact-later")?.focus();
    };
    more.addEventListener("click", open);
    dialog.addEventListener("click", (event) => {
      if (event.target.closest("[data-close]")) close();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !dialog.hidden) close();
    });`

  const newDialogBehavior = `    const appRoot = document.getElementById("root");
    const focusable = () => [...dialog.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')]
      .filter((node) => node instanceof HTMLElement && !node.hidden && node.getAttribute("aria-hidden") !== "true");
    let activeOpener = null;
    let lastDialogFocus = null;
    const setBackgroundInert = (value) => {
      if (!appRoot) return;
      if ("inert" in appRoot) appRoot.inert = value;
      else if (value) appRoot.setAttribute("aria-hidden", "true");
      else appRoot.removeAttribute("aria-hidden");
    };
    const close = () => {
      if (dialog.hidden) return;
      dialog.hidden = true;
      setBackgroundInert(false);
      const opener = activeOpener;
      activeOpener = null;
      lastDialogFocus = null;
      if (opener?.isConnected) opener.focus();
    };
    const open = () => {
      const opener = document.activeElement;
      activeOpener = opener instanceof HTMLElement ? opener : more;
      dialog.hidden = false;
      setBackgroundInert(true);
      const first = focusable()[0];
      first?.focus();
    };
    more.addEventListener("click", open);
    dialog.addEventListener("click", (event) => {
      if (event.target.closest("[data-close]")) close();
    });
    document.addEventListener("keydown", (event) => {
      if (dialog.hidden) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key === "Tab") {
        const items = focusable();
        if (items.length === 0) {
          event.preventDefault();
          return;
        }
        const current = document.activeElement;
        const index = items.indexOf(current);
        const nextIndex = event.shiftKey
          ? index <= 0 ? items.length - 1 : index - 1
          : index < 0 || index === items.length - 1 ? 0 : index + 1;
        event.preventDefault();
        items[nextIndex]?.focus();
      }
    });
    document.addEventListener('focusin', (event) => {
      if (dialog.hidden) return;
      if (dialog.contains(event.target)) {
        lastDialogFocus = event.target instanceof HTMLElement ? event.target : lastDialogFocus;
        return;
      }
      const target = lastDialogFocus?.isConnected ? lastDialogFocus : focusable()[0];
      target?.focus();
    });
    document.addEventListener('focusout', () => {
      if (dialog.hidden) return;
      queueMicrotask(() => {
        if (dialog.hidden || dialog.contains(document.activeElement)) return;
        const target = lastDialogFocus?.isConnected ? lastDialogFocus : focusable()[0];
        target?.focus();
      });
    });`

  next = requireReplace(next, oldDialogBehavior, newDialogBehavior, 'contact dialog keyboard ownership')
  return next
}

export function applyManifestProductLayer(manifest) {
  return {
    ...manifest,
    name: product.name,
    short_name: product.shortName,
  }
}

export function applyLocaleProductLayer(source) {
  const oldResolver = 'function resolveInitialLocale() {\n\t\t\tif (typeof window !== "undefined" && location.hostname.endsWith(".edgeone.dev")) return "en";\n\t\t\treturn "zh";\n\t\t}'
  const newResolver = 'function resolveInitialLocale() {\n\t\t\tif (typeof window === "undefined") return "en";\n\t\t\tconst tags = [...(navigator.languages ?? []), navigator.language];\n\t\t\treturn tags.some((tag) => String(tag || "").toLowerCase().split("-")[0] === "zh") ? "zh" : "en";\n\t\t}'
  return requireReplace(source, oldResolver, newResolver, 'browser locale resolver')
}

export async function applyProductLayer(targetRoot = root) {
  const htmlPaths = [join(targetRoot, 'index.html'), join(targetRoot, 'public', 'index.html')]
  for (const path of htmlPaths) {
    const source = await readFile(path, 'utf8')
    await writeFile(path, applyHtmlProductLayer(source))
  }

  const manifestPath = join(targetRoot, 'public', 'manifest.webmanifest')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  await writeFile(manifestPath, `${JSON.stringify(applyManifestProductLayer(manifest), null, 2)}\n`)

  const localePath = join(targetRoot, 'public', 'plugins', '@deepseek-ai', 'dsh-client-locale', 'client.js')
  const locale = await readFile(localePath, 'utf8')
  await writeFile(localePath, applyLocaleProductLayer(locale))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await applyProductLayer()
}
