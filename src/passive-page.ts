import { installPassivePageObserver } from './passive/page-observer.ts';

const SOURCE = 'gbfit-passive-account-v1';

installPassivePageObserver(window, (response) => {
  window.postMessage({ source: SOURCE, response }, window.location.origin);
});
