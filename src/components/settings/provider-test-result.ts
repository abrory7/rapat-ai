type ProviderTestResultElement = {
  scrollIntoView(options?: ScrollIntoViewOptions): void;
  focus(options?: FocusOptions): void;
};

export function revealProviderTestResult(
  element: ProviderTestResultElement | null
): void {
  if (!element) return;

  element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  element.focus({ preventScroll: true });
}
