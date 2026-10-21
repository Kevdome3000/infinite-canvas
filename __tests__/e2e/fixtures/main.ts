import * as demos from './demos';
import { initExample } from './utils';

const select = document.createElement('select');
select.id = 'example-select';
select.style.margin = '1em';
select.onchange = onChange;
select.style.display = 'block';
document.body.append(select);

const options = Object.keys(demos).map((d) => {
  const option = document.createElement('option');
  option.textContent = d;
  option.value = d;
  return option;
});
options.forEach((d) => select.append(d));

const requestedName = new URL(location.href).searchParams.get('name');
// Preserve the historical URL/snapshot name while selecting the actual export.
const initialValue = requestedName === 'drop-shadow' ? 'drop_shadow' : requestedName;
if (initialValue && !Object.hasOwn(demos, initialValue)) {
  throw new Error(`Unknown visual fixture: ${initialValue}`);
}
const renderer =
  (new URL(location as any).searchParams.get('renderer') as
    | 'webgl'
    | 'webgpu'
    | undefined) || 'webgl';
if (initialValue) select.value = initialValue;

const $container = document.getElementById('container')!;

let callback: (() => Promise<void>) | undefined;
let rendering = Promise.resolve();
queueRender(select.value);

async function render(name: string) {
  const dispose = callback;
  callback = undefined;
  await dispose?.();
  $container.innerHTML = '';
  delete $container.dataset.nodeCount;
  delete $container.dataset.scene;

  const demo = demos[name];
  callback = await initExample($container, demo, renderer);
  $container.dataset.scene = name;

  // @ts-ignore
  if (window.screenshot) {
    // @ts-ignore
    await window.screenshot();
  }
}

function queueRender(name: string) {
  // Becsy initialization and asynchronous disposal must never overlap worlds.
  // Capture the requested demo rather than reading a later select value.
  rendering = rendering.then(() => render(name));
}

function onChange() {
  const { value } = select;
  history.pushState({ value }, '', `?name=${value}&renderer=${renderer}`);
  queueRender(value);
}
