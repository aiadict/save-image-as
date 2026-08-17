// "Enjoying Save Image As?" star-rating prompt, bottom of the popup.
//
// Interaction (per spec):
//   - 5 empty/gray stars.
//   - Hover fills stars up to the hovered one (preview only).
//   - First click on a star LOCKS it as the selected rating (fills up to
//     that star, shows a confirmation hint) — does not navigate yet.
//   - Second click on the SAME already-selected star triggers the redirect:
//       1-3 stars -> feedback form (FEEDBACK_FORM_URL)
//       4-5 stars -> Chrome Web Store reviews page (CWS_REVIEWS_URL)
//   - Clicking a different star after locking re-locks to the new value
//     instead of navigating (only a repeat click on the same star confirms).
//
// See docs/architecture.md "Rating prompt widget" for the full spec.

import { CWS_REVIEWS_URL, FEEDBACK_FORM_URL } from "../lib/config";

const LOW_RATING_HINT = "Tap the star again to tell us what's wrong.";
const HIGH_RATING_HINT = "Tap the star again to leave a review — thank you!";

export function initRatingWidget(): void {
  const container = document.getElementById("stars");
  const hint = document.getElementById("ratingHint");
  if (!container || !hint) return;

  const stars = Array.from(container.querySelectorAll<HTMLButtonElement>(".star"));
  let selected = 0;

  const paint = (count: number, className: string) => {
    stars.forEach((star, i) => star.classList.toggle(className, i < count));
  };

  const showSelected = () => {
    stars.forEach((star) => star.classList.remove("hover"));
    paint(selected, "filled");
  };

  container.addEventListener("mouseover", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>(".star");
    if (!target) return;
    const value = Number(target.dataset.value);
    stars.forEach((star) => star.classList.remove("filled"));
    paint(value, "hover");
  });

  container.addEventListener("mouseleave", () => {
    showSelected();
  });

  container.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>(".star");
    if (!target) return;
    const value = Number(target.dataset.value);

    if (value === selected) {
      const url = value <= 3 ? FEEDBACK_FORM_URL : CWS_REVIEWS_URL;
      void chrome.tabs.create({ url });
      return;
    }

    selected = value;
    showSelected();
    hint.textContent = value <= 3 ? LOW_RATING_HINT : HIGH_RATING_HINT;
  });
}
