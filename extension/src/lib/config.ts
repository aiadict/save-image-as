// External links the extension needs but that depend on infrastructure we
// haven't stood up yet. Centralized here so there's exactly one place to
// update once each is real.

/**
 * Feedback form for low ratings (1-3 stars) from the popup rating widget.
 * Same pattern as the "AI Checker" feedback flow at https://werida.io/feedback
 * — hosting/implementation for *this* product's form is still to be decided.
 * TODO: replace with the real feedback site URL once it's built and hosted.
 */
export const FEEDBACK_FORM_URL = "https://werida.io/feedback"; // TODO: point at Save Image As's own feedback form once it exists

/**
 * Chrome Web Store reviews page for high ratings (4-5 stars) from the popup
 * rating widget. The real extension ID only exists once first published.
 * TODO: replace PLACEHOLDER_EXTENSION_ID once the listing is live/approved.
 */
export const CWS_REVIEWS_URL = "https://chromewebstore.google.com/detail/PLACEHOLDER_EXTENSION_ID/reviews";
