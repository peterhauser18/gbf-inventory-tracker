import './popup.ts';

removeCardFor('#response-count');
removeCardFor('#clear-diagnostic');

const footer = document.querySelector<HTMLElement>('.shell > footer');
if (footer) {
  footer.textContent = 'Dashboard access is always available. Manual Start/Stop and account reset remain under Developer; local-storage cleanup is in Dashboard Settings.';
}

function removeCardFor(selector: string): void {
  document.querySelector<HTMLElement>(selector)?.closest<HTMLElement>('.card')?.remove();
}
