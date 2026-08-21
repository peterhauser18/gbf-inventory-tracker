import './popup.ts';

removeCardFor('#response-count');
removeCardFor('#clear-diagnostic');
removeElement('#reset-account');

const footer = document.querySelector<HTMLElement>('.shell > footer');
if (footer) {
  footer.textContent = 'Dashboard access is always available. Manual Start/Stop remains under Developer; account reset and local-storage cleanup are in Dashboard Settings.';
}

function removeCardFor(selector: string): void {
  document.querySelector<HTMLElement>(selector)?.closest<HTMLElement>('.card')?.remove();
}

function removeElement(selector: string): void {
  document.querySelector<HTMLElement>(selector)?.remove();
}
