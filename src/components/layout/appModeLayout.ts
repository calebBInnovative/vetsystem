/**
 * For full-height screens (POS, consultation form) inside the phone app: fill
 * the space between the top bar and the bottom tab bar, cancelling the padding
 * AppLayout gives <main> in app mode, so their own footers stay visible.
 * Higher-specificity selector so it beats the page's own responsive margins.
 */
export const APP_MODE_FILL =
  '[[data-app-mode]_&]:m-0 [[data-app-mode]_&]:-mx-4 [[data-app-mode]_&]:-mt-4 ' +
  '[[data-app-mode]_&]:-mb-[calc(5.5rem+env(safe-area-inset-bottom))] ' +
  '[[data-app-mode]_&]:h-[calc(100dvh-7rem-1px-env(safe-area-inset-bottom))]';
