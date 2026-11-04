import {getDocument, GlobalWorkerOptions, TextLayer} from './vendor/pdf.min.mjs';
GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href;
const ru = document.documentElement.lang === 'ru';
const $ = id => document.getElementById(id);
const stage = $('stage'), host = $('pdf-page'), status = $('status');
const number = $('page-number'), previous = $('prev'), next = $('next');
const zoomIn = $('zoom-in'), zoomOut = $('zoom-out'), fit = $('fit');
let pdf, pageNumber = 5, zoom = 1, sequence = 0, rendering, textLayer;

function setTab(read, focus = false) {
  $('read-tab').setAttribute('aria-selected', String(read));
  $('sample-tab').setAttribute('aria-selected', String(!read));
  $('read-tab').tabIndex = read ? 0 : -1;
  $('sample-tab').tabIndex = read ? -1 : 0;
  $('reader-panel').hidden = !read; $('sample-panel').hidden = read;
  if (focus) $(read ? 'read-tab' : 'sample-tab').focus();
  if (read && pdf) render();
}
$('read-tab').addEventListener('click', () => setTab(true));
$('sample-tab').addEventListener('click', () => setTab(false));
for (const tab of [$('read-tab'), $('sample-tab')]) tab.addEventListener('keydown', event => {
  if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
    event.preventDefault();
    setTab(event.key === 'Home' || (event.key !== 'End' && $('reader-panel').hidden), true);
  }
});

async function render() {
  if (!pdf || $('reader-panel').hidden) return;
  const id = ++sequence;
  rendering?.cancel(); textLayer?.cancel();
  stage.setAttribute('aria-busy', 'true'); number.value = pageNumber;
  previous.disabled = pageNumber <= 1; next.disabled = pageNumber >= pdf.numPages;
  zoomIn.disabled = zoom >= 3; zoomOut.disabled = zoom <= .5;
  try {
    const page = await pdf.getPage(pageNumber);
    if (id !== sequence) return;
    const natural = page.getViewport({scale:1});
    const baseScale = Math.min((stage.clientWidth - 36) / natural.width, (stage.clientHeight - 36) / natural.height);
    const viewport = page.getViewport({scale:baseScale * zoom});
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width * ratio); canvas.height = Math.ceil(viewport.height * ratio);
    canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
    canvas.setAttribute('aria-hidden','true');
    host.style.width = `${viewport.width}px`; host.style.height = `${viewport.height}px`;
    host.style.setProperty('--total-scale-factor', viewport.scale);
    const layer = document.createElement('div'); layer.className = 'textLayer';
    host.replaceChildren(canvas, layer);
    rendering = page.render({canvasContext:canvas.getContext('2d'),viewport,transform:ratio === 1 ? null : [ratio,0,0,ratio,0,0]});
    await rendering.promise;
    if (id !== sequence) return;
    textLayer = new TextLayer({textContentSource:page.streamTextContent(),container:layer,viewport});
    await textLayer.render();
    if (id !== sequence) return;
    status.textContent = ''; host.dataset.renderedPage = pageNumber;
    host.setAttribute('aria-label', `${ru ? 'Страница' : 'Page'} ${pageNumber}`);
    $('zoom-level').value = `${Math.round(zoom * 100)}%`;
    stage.scrollTop = 0; stage.scrollLeft = Math.max(0,(stage.scrollWidth-stage.clientWidth)/2);
    stage.setAttribute('aria-busy','false');
  } catch (error) {
    if (id !== sequence || ['RenderingCancelledException','AbortException'].includes(error?.name)) return;
    console.error(error);
    status.textContent = ru ? 'Не удалось открыть просмотр. PDF можно скачать по ссылке выше.' : 'Could not open the viewer. You can download the PDF above.';
    stage.setAttribute('aria-busy','false');
  }
}
function go(value) {
  const requested = Number(value);
  if (!Number.isInteger(requested)) {number.value = pageNumber; return;}
  pageNumber = Math.min(pdf.numPages,Math.max(1,requested));
  history.replaceState(null,'',`#page=${pageNumber}`); render();
}
previous.addEventListener('click',()=>go(pageNumber-1)); next.addEventListener('click',()=>go(pageNumber+1));
number.addEventListener('change',()=>go(number.value));
number.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();go(number.value);}});
zoomIn.addEventListener('click',()=>{zoom=Math.min(3,zoom+.25);render();});
zoomOut.addEventListener('click',()=>{zoom=Math.max(.5,zoom-.25);render();});
fit.addEventListener('click',()=>{zoom=1;render();});
stage.addEventListener('keydown',event=>{
  if(!pdf || window.getSelection()?.toString())return;
  if(['ArrowRight','PageDown'].includes(event.key)){event.preventDefault();go(pageNumber+1);}
  if(['ArrowLeft','PageUp'].includes(event.key)){event.preventDefault();go(pageNumber-1);}
});
let resizeTimer;
window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(render,150);});
try {
  pdf = await getDocument({url:new URL('./demidovich.pdf',import.meta.url).href,enableXfa:false,isEvalSupported:false}).promise;
  const requested = Number(new URLSearchParams(location.hash.slice(1)).get('page'));
  if(Number.isInteger(requested)&&requested>=1&&requested<=pdf.numPages)pageNumber=requested;
  $('page-count').textContent=pdf.numPages; number.max=pdf.numPages;
  for(const control of [number,previous,next,zoomIn,zoomOut,fit])control.disabled=false;
  await render();
} catch(error) {
  console.error(error);
  status.textContent=ru?'Не удалось открыть просмотр. PDF можно скачать по ссылке выше.':'Could not open the viewer. You can download the PDF above.';
  stage.setAttribute('aria-busy','false');
}
