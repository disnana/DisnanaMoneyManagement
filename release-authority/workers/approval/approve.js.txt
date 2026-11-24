const main = document.querySelector('main');
const arm = document.querySelector('#arm');
const hold = document.querySelector('#hold');
const reject = document.querySelector('#reject');
const progress = document.querySelector('#progress');
const status = document.querySelector('#status');
let nonce;
let armedAt;
let timeout;
let frame;
let busy = false;

async function send(operation, data) {
  const response = await fetch(`${location.pathname}/${operation}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hash: main.dataset.hash, ...data }),
  });
  if (!response.ok) throw new Error('承認の状態を確認できません。ページを開き直してください。');
  return response;
}

function cancel() {
  clearTimeout(timeout);
  cancelAnimationFrame(frame);
  timeout = undefined;
  progress.value = 0;
}

function begin() {
  if (busy || !nonce || performance.now() < armedAt + 5000 || timeout !== undefined || document.hidden) return;
  const start = performance.now();
  const repaint = () => {
    progress.value = Math.min(3000, performance.now() - start);
    frame = requestAnimationFrame(repaint);
  };
  repaint();
  timeout = setTimeout(async () => {
    cancel();
    busy = true;
    hold.disabled = true;
    reject.disabled = true;
    try {
      await send('confirm', { nonce });
      status.textContent = '承認済みです。署名の状態はリリース実行画面で確認してください。';
    } catch (error) {
      status.textContent = error.message;
    }
  }, 3000);
}

arm.addEventListener('click', async () => {
  arm.disabled = true;
  try {
    nonce = (await (await send('arm')).json()).nonce;
    armedAt = performance.now();
    hold.hidden = false;
    progress.hidden = false;
    hold.disabled = true;
    status.textContent = '5秒後に、3秒間の長押しで承認できます。キーボードではスペースキーを長押しします。';
    setTimeout(() => { if (!busy) hold.disabled = false; }, 5000);
  } catch (error) {
    status.textContent = error.message;
  }
});

hold.addEventListener('pointerdown', (event) => { if (event.isPrimary && event.button === 0) begin(); });
for (const name of ['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture', 'blur']) hold.addEventListener(name, cancel);
hold.addEventListener('contextmenu', (event) => event.preventDefault());
hold.addEventListener('keydown', (event) => {
  if (event.code !== 'Space') return;
  event.preventDefault();
  if (!event.repeat) begin();
});
hold.addEventListener('keyup', (event) => { if (event.code === 'Space') cancel(); });
for (const name of ['blur', 'pagehide']) window.addEventListener(name, cancel);
document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });

reject.addEventListener('click', async () => {
  cancel();
  busy = true;
  arm.disabled = true;
  hold.disabled = true;
  reject.disabled = true;
  try {
    await send('reject');
    status.textContent = 'このリリースを拒否しました。';
  } catch (error) {
    status.textContent = error.message;
  }
});
