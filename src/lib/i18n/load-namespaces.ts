import { DEFAULT_LANGUAGE, type LanguageCode, type Namespace } from "./languages";

export type ResourceBundle = Record<string, string>;

// One dynamic import() per (language, namespace) file -- Vite code-splits each
// of these separately, so a route only pulls in the languages/sections it
// actually needs (the /t bundle-size requirement this PR must hold to).
const modules = import.meta.glob<{ default: Record<string, unknown> }>("./resources/*/*.json");

async function loadRawNamespace(lang: LanguageCode, ns: Namespace): Promise<ResourceBundle> {
  const key = `./resources/${lang}/${ns}.json`;
  const importer = modules[key];
  if (!importer) return {};
  const mod = await importer();
  const { _meta_status: _ignored, ...strings } = mod.default;
  return strings as ResourceBundle;
}

/** Loads only the requested namespaces, merging English underneath the
 *  target language so any key missing from a machine-drafted translation
 *  falls back to English silently instead of surfacing a raw key. */
export async function loadNamespaces(
  lang: LanguageCode,
  namespaces: readonly Namespace[],
): Promise<Record<string, ResourceBundle>> {
  const result: Record<string, ResourceBundle> = {};
  await Promise.all(
    namespaces.map(async (ns) => {
      if (lang === DEFAULT_LANGUAGE) {
        result[ns] = await loadRawNamespace(DEFAULT_LANGUAGE, ns);
        return;
      }
      const [en, target] = await Promise.all([
        loadRawNamespace(DEFAULT_LANGUAGE, ns),
        loadRawNamespace(lang, ns),
      ]);
      result[ns] = { ...en, ...target };
    }),
  );
  return result;
}
