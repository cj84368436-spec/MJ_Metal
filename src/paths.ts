/**
 * Deployment base handling.
 *
 * The apps-in-toss bundle is served from the root ("/"), while the GitHub
 * Pages preview lives under a sub path ("/MJ_Metal/"). Vite fills
 * `import.meta.env.BASE_URL` with the base used for the current build, so the
 * same source works for both without changing the routes.
 */
const raw = import.meta.env.BASE_URL || "/";
/** Base with no trailing slash: "" at the root, "/MJ_Metal" on Pages. */
export const basePath = raw.endsWith("/") ? raw.slice(0, -1) : raw;

/** A file in `public/` (e.g. "art/pack1.webp") under the current base. */
export function asset(file: string) {
  const root = raw.endsWith("/") ? raw : raw + "/";
  return root + file.replace(/^\//, "");
}

/** In-app route ("/library") to the address the browser should show. */
export function browserPath(route: string) {
  return basePath + (route.startsWith("/") ? route : "/" + route);
}

/** Address bar path and query back to an in-app route. */
export function appRoute(pathname: string, search = "") {
  let path = pathname;
  if (basePath && (path === basePath || path.startsWith(basePath + "/")))
    path = path.slice(basePath.length) || "/";
  return path + search;
}

export const currentRoute = () => appRoute(location.pathname, location.search);
