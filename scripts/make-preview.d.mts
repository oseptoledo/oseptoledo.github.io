/**
 * Hand-written declarations for scripts/make-preview.mjs, so the site's tests
 * can import it. The .mjs file itself is not type-checked;
 * src/__tests__/make-preview.test.ts exercises every export at runtime.
 */

export declare const PREVIEW_ROBOTS_META: string;
export declare const PREVIEW_ROBOTS_TXT: string;

/** The page with its one robots meta tag set to noindex, nofollow. Throws unless there is exactly one. */
export declare function toPreviewHtml(html: string, label?: string): string;

/** Apply the preview changes to every top-level .html file in `distDir`, and robots.txt. Returns the page file names. */
export declare function makePreview(distDir: string): string[];
