let headers;
let timeout;
const notified = [];

const studiesURL = 'https://www.prolific.co/api/v1/studies/?current=1';

const toMoney = (n) => (n / 100).toFixed(2);

/**
 * @param {string} key
 * @returns {Promise<object>}
 */
const getStorage = (key) =>
  new Promise((resolve) =>
    chrome.storage.local.get(key, (item) => resolve(item[key])),
  );

/**
 * @returns {Promise<number>}
 */
const getIntervalFromStorage = () =>
  new Promise(async (resolve) => {
    const { interval } = (await getStorage('options')) || { interval: 60 };
    const ms = interval >= 60 ? interval * 1000 : 60 * 1000;
    resolve(ms);
  });

/**
 * @param {array} studies
 */
const setStudiesToStorage = (studies) => {
  chrome.storage.local.set({
    studies,
    checked: new Date().toTimeString(),
  });
};

/**
 * @returns {Promise<array>}
 */
const fetchStudies = () =>
  new Promise(async (resolve, reject) => {
    if (!headers) {
      reject(new Error('No Headers'));
      return;
    }

    const response = await fetch(studiesURL, { credentials: 'include' });

    if (response.ok) {
      const json = await response.json();
      resolve(json.results);
    } else {
      reject(new Error(`${response.status} - ${response.statusText}`));
    }
  });

/**
 * Change the badge text to the number of studies.
 * @param {array} studies
 * @param {number} studies.length
 */
const setBadgeStudies = ({ length }) => {
  const text = length > 0 ? length.toString() : '';
  chrome.browserAction.setBadgeText({ text });
  chrome.browserAction.setBadgeBackgroundColor({ color: 'red' });
};

/**
 * Show the user an error has occured through the badge text.
 */
const setBadgeError = () => {
  chrome.browserAction.setBadgeText({ text: 'ERR' });
  chrome.browserAction.setBadgeBackgroundColor({ color: 'red' });
};

function notification(study) {
  chrome.notifications.create(study.id, {
    type: 'basic',
    title: study.name,
    message: 'Hosted by ' + study.researcher.name + 
    '\nReward ' + toMoney(study.reward) + " | Avg. " + toMoney(study.average_reward_per_hour) + 
    '\nPlaces ' + (study.total_available_places - study.places_taken),
    iconUrl: '/prolific.png',
  });
}


async function announceStudies(studies) {
  const needAnnouncing = studies.filter((o) => !notified.includes(o.id));

  if (needAnnouncing.length) {
    needAnnouncing.forEach((o) => {
      notified.push(o.id);
      notification(o);
    });

    const options = await getStorage('options');

    switch (options.alert) {
      case 'none':
        // no sound for you
        break;
      case 'sweet-alert-1':
      case 'sweet-alert-2':
      case 'sweet-alert-3':
      case 'sweet-alert-4':
      case 'sweet-alert-5':
        const audio = new Audio(`/audio/${option.alert}.wav`);
        audio.play();
        break;
      case 'voice':
        var synth = window.speechSynthesis;
        var voices = synth.getVoices();
        var utterThis = new SpeechSynthesisUtterance('New studies available on Prolific.');
        utterThis.voice = voices[0];
        synth.speak(utterThis);
        break;
    }
  }
}

async function prolific() {
  clearTimeout(timeout);

  try {
    const studies = await fetchStudies();
    setBadgeStudies(studies);
    setStudiesToStorage(studies);
    announceStudies(studies);
  } catch (error) {
    setBadgeError();
    window.console.error(error);
  }

  timeout = setTimeout(prolific, await getIntervalFromStorage());
}

chrome.storage.local.get(null, (items) => {
  const { options } = items;

  if (
    !options ||
    !Object.prototype.hasOwnProperty.call(options, 'alert') ||
    !Object.prototype.hasOwnProperty.call(options, 'interval')
  ) {
    chrome.storage.local.set({ options: { alert: 'voice', interval: 60 } });
  }

  chrome.storage.local.set({ studies: {} });
});

chrome.runtime.onMessage.addListener((request) => {
  if (request.prolific) prolific();
});

chrome.notifications.onButtonClicked.addListener((notificationId) => {
  window.open(`https://app.prolific.co/studies/${notificationId}`);
  chrome.notifications.clear(notificationId);
});

chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    const { method, requestHeaders } = details;
    const authorizationHeaderExists = requestHeaders.some(
      (header) => header.name === 'Authorization',
    );

    if (authorizationHeaderExists) {
      headers = requestHeaders;
    } else if (
      headers &&
      method === 'GET' &&
      details.url.includes('https://www.prolific.co/api/v1/studies/')
    ) {
      return { requestHeaders: headers };
    }

    return {};
  },
  {
    urls: ['https://*.prolific.co/*'],
  },
  ['blocking', 'requestHeaders'],
);

prolific();
