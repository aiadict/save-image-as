// External links the extension needs but that depend on infrastructure we
// haven't stood up yet. Centralized here so there's exactly one place to
// update once each is real.

/**
 * Feedback form for low ratings (1-3 stars) from the popup rating widget.
 * Live at docs/feedback/index.html, deployed via GitHub Pages from this repo
 * (same pattern as the "AI Checker" flow at https://werida.io/feedback).
 * The `?rating=` param is appended by rating-widget.ts so the page can show
 * "you rated us N/5" context.
 */
export const FEEDBACK_FORM_URL = "https://aiadict.github.io/save-image-as/feedback/";

/**
 * Chrome Web Store reviews page for high ratings (4-5 stars) from the popup
 * rating widget. Real listing, live as of 2026-08-19.
 */
export const CWS_REVIEWS_URL = "https://chromewebstore.google.com/detail/save-image-as/hcopnelbknilmhdehpdpegngempljkdk/reviews";
