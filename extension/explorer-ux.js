/* Focus ownership and a native top-layer Folder Access popover. No file semantics. */
(() => {
  'use strict';
  const host=document.querySelector('#chutey-explorer-view');if(!host)return;
  const details=host.querySelector('.ex-more-settings'),summary=details?.querySelector('summary'),panel=details?.querySelector('.ex-advanced-actions');
  const preview=host.querySelector('.ex-preview');if(preview)preview.tabIndex=-1;
  const interactive='button,a,input,select,textarea,video,audio,[role=separator],[role=menu],[contenteditable=true],[popover]';
  host.addEventListener('click',event=>{
    if(!preview||preview.hidden||event.button!==0||event.target.closest(interactive))return;
    if(event.target.closest('.ex-preview-body')||event.target===preview||event.target.matches('.ex-workspace,.ex-list,.ex-tree'))preview.focus({preventScroll:true});
  });
  if(!details||!summary||!panel)return;
  panel.setAttribute('aria-label','Folder access and transfers');
  panel.setAttribute('role','group');panel.setAttribute('popover','manual');
  let showing=false;
  const position=()=>{
    if(!showing)return;
    const rect=summary.getBoundingClientRect(),width=Math.min(270,innerWidth-16);
    const top=Math.max(8,Math.min(rect.bottom+5,innerHeight-130));
    panel.style.cssText=`position:fixed;inset:auto;left:${Math.max(8,Math.min(innerWidth-width-8,rect.right-width))}px;top:${top}px;width:${width}px;max-height:${Math.max(90,innerHeight-top-8)}px;margin:0;overflow-y:auto;`;
  };
  function hide(focus=false){
    if(!showing)return;showing=false;
    if(panel.matches(':popover-open'))panel.hidePopover();
    details.open=false;summary.setAttribute('aria-expanded','false');
    if(focus)summary.focus({preventScroll:true});
  }
  details.addEventListener('toggle',()=>{
    if(!details.open){hide();return;}
    if(typeof panel.showPopover!=='function'){
      // Matching builds require Chrome116+; keep a visible in-flow fallback on
      // browser variants without Popover instead of putting controls behind video.
      panel.setAttribute('data-overlay-fallback','true');return;
    }
    showing=true;panel.showPopover();position();summary.setAttribute('aria-expanded','true');
    panel.querySelector('input:not(:disabled),button:not(:disabled)')?.focus({preventScroll:true});
  });
  document.addEventListener('pointerdown',event=>{if(showing&&!panel.contains(event.target)&&!summary.contains(event.target))hide();},true);
  document.addEventListener('keydown',event=>{
    if(showing&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();hide(true);}
  },true);
  // Folder controls retain their own keyboard behavior; Explorer gallery and
  // clipboard shortcuts must not act on files from inside this menu.
  panel.addEventListener('keydown',event=>event.stopPropagation());
  panel.addEventListener('click',event=>{if(event.target.closest('button'))hide();});
  window.addEventListener('resize',position);
  window.addEventListener('pagehide',()=>hide());
})();
