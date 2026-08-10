/**
 * Shared page-container class strings so top-level pages share consistent
 * padding, spacing, and max-widths. `pageShell` is the default full-width
 * layout; the width variants constrain content for forms and wide tables.
 * `pageEmbedded` is used when a page renders inside another layout (e.g. a
 * course tab) and should not add its own outer page padding.
 */

const PAGE_PADDING = "gap-6 p-4 md:p-6 lg:p-8";

/** Default full-width page container. */
export const pageShell = `flex flex-1 flex-col ${PAGE_PADDING}`;

/** Narrow container for forms and focused single-column pages. */
export const pageShellNarrow = `mx-auto flex w-full max-w-3xl flex-col ${PAGE_PADDING}`;

/** Medium-width container for settings and detail pages. */
export const pageShellMedium = `mx-auto flex w-full max-w-4xl flex-col ${PAGE_PADDING}`;

/** Wide container for data-heavy tables (management, audit logs). */
export const pageShellXWide = `mx-auto flex w-full max-w-6xl flex-col ${PAGE_PADDING}`;

/** Content wrapper for pages embedded inside another layout (no page padding). */
export const pageEmbedded = "flex flex-col gap-6";
