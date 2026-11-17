/* Actual browser File bodies stream to existing upload intake. No byte IPC/Blob copies. */
(() => {
  const host=document.querySelector('#chutey-history-view')||document.querySelector('#chutey-popup-gallery');if(!host)return;
  const button=document.createElement('button');button.type='button';button.className='secondary-button';button.textContent='Add files…';
  const input=document.createElement('input');input.type='file';input.multiple=true;input.hidden=true;
  const check=document.createElement('button');check.type='button';check.textContent='Check import';check.className='secondary-button';
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel import';cancel.className='secondary-button';cancel.hidden=true;
  const status=document.createElement('p');status.setAttribute('role','status');status.style.cssText='font-size:11px;overflow-wrap:anywhere;margin:6px';
  const dismiss=document.createElement('button');dismiss.type='button';dismiss.className='secondary-button';dismiss.textContent='Dismiss reviewed import warning';dismiss.hidden=true;dismiss.onclick=async()=>{if(busy)return;if(confirm('Have you inspected the saved destination and retained the import ID? This dismisses the warning only and never retries or deletes files.')){await chrome.storage.session.remove('chuteyPendingImport');status.textContent='Import warning dismissed. Files unchanged.';}};
  const controls=document.createElement('div');controls.className='chutey-intake';controls.append(button,input,check,cancel,dismiss,status);host.prepend(controls);
  button.onclick=()=>input.click();let active=null,busy=false;
  cancel.onclick=()=>active?.abort();
  check.onclick=async()=>{
    try{
      const pending=(await chrome.storage.session.get({chuteyPendingImport:null})).chuteyPendingImport;
      if(!pending){status.textContent='No pending import.';return;}
      await window.ChuteyExplorerAPI.nativeSession(false);
      const receipt=await window.ChuteyExplorerAPI.command('upload_receipt',{id:pending.id});
      dismiss.hidden=['COMMITTED','RECEIVING','VERIFYING'].includes(receipt.state);
      status.textContent=['RECEIVING','VERIFYING'].includes(receipt.state)?receipt.state+' · '+receipt.bytes.toLocaleString()+' / '+receipt.size.toLocaleString()+' bytes':receipt.state==='COMMITTED'?'Verified import complete · '+receipt.size.toLocaleString()+' bytes · '+receipt.sha256:receipt.error||'Import uncertain. Inspect the saved file before retrying.';
      if(receipt.state==='COMMITTED'){await chrome.storage.session.remove('chuteyPendingImport');await resetHistory();}
    }catch(error){dismiss.hidden=false;status.textContent=error.message;}
  };
  async function intake(files){
    if(busy)return;busy=true;button.disabled=true;cancel.hidden=false;
    try{
      if((await chrome.storage.session.get({chuteyPendingImport:null})).chuteyPendingImport)throw Error('Check the previous import receipt before starting another. No automatic retry.');
      for(const file of files){
        const id=crypto.randomUUID().replaceAll('-','');active=new AbortController();
        await chrome.storage.session.set({chuteyPendingImport:{id,name:file.name,size:file.size}});
        status.textContent='Saving '+file.name+' · '+file.size.toLocaleString()+' bytes. Check import if the connection is interrupted.';
        const response=await fetch('http://127.0.0.1:17891/api/upload',{method:'POST',cache:'no-store',signal:active.signal,headers:{'Content-Type':'application/octet-stream','X-Chute-Filename':encodeURIComponent(file.name),'X-Chute-Mime':file.type||'application/octet-stream','X-Chute-Operation':id},body:file});
        const result=await response.json();
        if(!response.ok||result.file?.id!==id||result.file?.size!==file.size||result.receipt?.state!=='COMMITTED'||! /^[a-f0-9]{64}$/.test(result.receipt.sha256))throw Error(result.error||'Import not verified. Check its retained ID before retrying.');
        await chrome.storage.session.remove('chuteyPendingImport');
        status.textContent='Verified '+file.name+' · '+file.size.toLocaleString()+' bytes';
        void chrome.runtime.sendMessage({type:'chute-count-changed'}).catch(()=>{});await resetHistory();
      }
    }catch(error){dismiss.hidden=false;status.textContent=error.name==='AbortError'?'Import cancelled; check its receipt before retrying.':error.message;}
    finally{busy=false;button.disabled=false;cancel.hidden=true;active=null;input.value='';}
  }
  input.onchange=()=>void intake([...input.files]);
  host.addEventListener('dragover',event=>{if([...event.dataTransfer.types].includes('Files')){event.preventDefault();event.dataTransfer.dropEffect='copy';}});
  host.addEventListener('drop',event=>{if(event.dataTransfer.files.length){event.preventDefault();event.stopPropagation();void intake([...event.dataTransfer.files]);}});
})();
