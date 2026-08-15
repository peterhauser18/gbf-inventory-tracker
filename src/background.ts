type StatusRequest = { type: 'gbfit:get-status' };

type StatusResponse = {
  version: 1;
  captureReady: boolean;
  message: string;
};

chrome.runtime.onMessage.addListener(
  (message: StatusRequest, _sender, sendResponse: (response: StatusResponse) => void) => {
    if (message?.type !== 'gbfit:get-status') return false;

    sendResponse({
      version: 1,
      captureReady: false,
      message: 'Scaffold ready. Passive capture is the next milestone.',
    });

    return false;
  },
);
