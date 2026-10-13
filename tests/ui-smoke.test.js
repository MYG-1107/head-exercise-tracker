const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../tracker-core.js');

function createElement(id = '') {
  const listeners = new Map();
  const classes = new Set();
  const element = {
    id, textContent: '', value: id === 'target-per-direction' ? '3' : '',
    disabled: false, hidden: false, title: '', href: '', download: '',
    srcObject: null, dataset: {}, style: {}, attributes: {}, children: [],
    classList: {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name),
      toggle: (name, force) => {
        const shouldAdd = force === undefined ? !classes.has(name) : Boolean(force);
        if (shouldAdd) classes.add(name); else classes.delete(name);
        return shouldAdd;
      }
    },
    addEventListener: (name, fn) => {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(fn);
    },
    dispatch: name => (listeners.get(name) || []).forEach(fn => fn({target: element})),
    setAttribute: (name, value) => { element.attributes[name] = String(value); },
    getAttribute: name => element.attributes[name],
    querySelector: selector => {
      if (selector === 'span') {
        if (!element._span) element._span = createElement(`${id}-span`);
        return element._span;
      }
      return null;
    },
    appendChild: child => { element.children.push(child); return child; },
    remove: () => { element.removed = true; },
    click: () => element.dispatch('click')
  };
  return element;
}

function bootApp() {
  const elements = new Map();
  const ids = [
    'tracking-status','start-session-btn','session-state-text','session-state','pause-resume-btn','end-session-btn',
    'mode-toggle-btn','target-per-direction','calibrate-btn','flip-camera-btn','voice-btn','camera-column','manual-panel',
    'export-session-btn','webcam','camera-overlay','camera-overlay-title','camera-overlay-copy','camera-live-pill','pose-status',
    'calibration-progress-wrap','calibration-progress-fill','calibration-progress-text','calibration-mark','calibration-title',
    'calibration-description','live-direction-symbol','live-direction','live-guidance','total-progress','total-target',
    'timer-display','overall-progress-fill','overall-progress','reset-btn','offline-note'
  ];
  for (const direction of Core.DIRECTIONS) ids.push(`count-${direction}`, `stat-${direction}`);
  ids.forEach(id => elements.set(id, createElement(id)));
  const manualButtons = Core.DIRECTIONS.map(direction => {
    const button = createElement(`manual-${direction}`);
    button.dataset.manualDirection = direction;
    return button;
  });
  const targetSpans = Array.from({length: 4}, (_, i) => createElement(`target-${i}`));
  const documentListeners = {};
  const document = {
    addEventListener: (name, fn) => { documentListeners[name] = fn; },
    getElementById: id => {
      if (!elements.has(id)) elements.set(id, createElement(id));
      return elements.get(id);
    },
    querySelectorAll: selector => selector === '[data-manual-direction]' ? manualButtons : selector === '.per-direction-target' ? targetSpans : [],
    createElement: name => createElement(name),
    head: createElement('head'), body: createElement('body')
  };
  const intervalCallbacks = new Map(); let nextInterval = 1;
  const capturedBlobs = [];
  class FakeBlob { constructor(parts, options) { this.parts = parts; this.options = options; capturedBlobs.push(this); } }
  const FakeURL = { createObjectURL: () => 'blob:qa-session', revokeObjectURL: () => {} };
  const window = {
    HeadTrackerCore: Core, addEventListener: () => {},
    setInterval: fn => { const id = nextInterval++; intervalCallbacks.set(id, fn); return id; },
    clearInterval: id => intervalCallbacks.delete(id),
    setTimeout: fn => { fn(); return 1; }
  };
  const sandbox = {
    window, document, navigator: {onLine: true}, location: {protocol: 'http:'},
    URL: FakeURL, Blob: FakeBlob, Date, Math, Number, String, Set, Map, Promise,
    console, requestAnimationFrame: () => 1, cancelAnimationFrame: () => {},
    setTimeout: window.setTimeout, clearTimeout: () => {},
    SpeechSynthesisUtterance: function(text) { this.text = text; }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8'), sandbox, {filename:'script.js'});
  assert.equal(typeof documentListeners.DOMContentLoaded, 'function', 'DOMContentLoaded handler was not registered');
  documentListeners.DOMContentLoaded();
  return {elements, manualButtons, document, window, capturedBlobs};
}

test('UI boots and manual mode counts a completed cycle without touching the camera', () => {
  const app = bootApp();
  assert.equal(app.elements.get('session-state-text').textContent, 'Ready');
  assert.equal(app.elements.get('webcam').srcObject, null);
  app.elements.get('mode-toggle-btn').click();
  assert.equal(app.elements.get('manual-panel').hidden, false);
  assert.equal(app.elements.get('camera-column').hidden, true);
  app.elements.get('start-session-btn').click();
  assert.equal(app.elements.get('session-state-text').textContent, 'Manual');
  app.manualButtons[0].click();
  assert.equal(app.elements.get('count-UP').textContent, '1');
  assert.equal(app.elements.get('total-progress').textContent, '1');
  assert.equal(app.elements.get('export-session-btn').disabled, false);
  assert.equal(app.elements.get('webcam').srcObject, null);
});

test('CSV summary is created only after explicit export click and has no upload step', () => {
  const app = bootApp();
  app.elements.get('mode-toggle-btn').click();
  app.elements.get('start-session-btn').click();
  app.manualButtons[2].click();
  app.elements.get('export-session-btn').click();
  assert.equal(app.capturedBlobs.length, 1);
  const csv = app.capturedBlobs[0].parts.join('');
  assert.match(csv, /Total repetitions/);
  assert.match(csv, /LEFT/);
  assert.match(csv, /does not upload the summary/);
  assert.match(app.elements.get('tracking-status').textContent, /downloaded/i);
});
