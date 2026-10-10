import asyncio,json,time,os,re,statistics
from pathlib import Path
from playwright.async_api import async_playwright
import argparse
from urllib.parse import urlparse
ROOT=Path(__file__).resolve().parent
cli=argparse.ArgumentParser(description='Benchmark at most 20 EU5 saves in a separate Chromium instance')
cli.add_argument('--census',type=Path,required=True)
cli.add_argument('--out',type=Path,required=True)
cli.add_argument('--cdp',default='http://127.0.0.1:9237')
cli.add_argument('--app',default='http://localhost:3001')
cli.add_argument('--algorithm',choices=['sha256','blake3'],default='sha256')
cli.add_argument('--hashes',type=Path,help='File-name to raw-content hash mapping; required for BLAKE3')
cli.add_argument('--repeats',type=int,default=2)
args=cli.parse_args()
if args.repeats<1:cli.error('--repeats must be positive')
if args.algorithm=='blake3' and not args.hashes:cli.error('BLAKE3 needs independently computed --hashes')
OUT=args.out;OUT.mkdir(parents=True,exist_ok=True)
ARTIFACTS=ROOT/('pkg-sha' if args.algorithm=='sha256' else 'pkg-blake3')
APP=args.app.rstrip('/')
PORT=urlparse(args.cdp).port

CLK=os.sysconf('SC_CLK_TCK')
def resources():
 rows={};root=None
 for p in Path('/proc').iterdir():
  if not p.name.isdigit():continue
  try:
   args=(p/'cmdline').read_bytes().replace(b'\0',b' ').decode();r=(p/'stat').read_text().rsplit(')',1)[1].split();pid=int(p.name)
   rows[pid]=(int(r[1]),(int(r[11])+int(r[12]))/CLK)
   if f'--remote-debugging-port={PORT}' in args and '--type=' not in args and 'chromium' in args:root=pid
  except:pass
 if root is None:raise RuntimeError('Cannot identify the local benchmark Chromium process')
 family={root}
 while True:
  ch={pid for pid,(parent,_) in rows.items() if parent in family}
  if ch<=family:break
  family|=ch
 pss=0;cpu=0
 for pid in family:
  if pid not in rows:continue
  cpu+=rows[pid][1]
  try:
   for line in Path(f'/proc/{pid}/smaps_rollup').read_text().splitlines():
    if line.startswith('Pss:'):pss+=int(line.split()[1])/1024
  except:pass
 return {'pssMiB':pss,'cpuSeconds':cpu}
JS='''async ({concurrency,cold,writeBatch,discard,pipeline,recycle,stream,chunk,hashSource,manifest,selective,nativeHash,b3Manifest,bridge})=>{
 const {wrap,transfer}=await import('/node_modules/.vite/deps/comlink.js?v=17133221');
 const cache=await import('/app/features/eu5/history/cache.ts');
 const {useHistory}=await import('/app/features/eu5/history/store.ts');
 const files=[...document.querySelector('input').files];
 const workers=Array.from({length:concurrency},()=>new Worker('/app/features/eu5/history/snapshot-worker.ts?worker_file&type=module',{type:'module'}));
 const proxies=workers.map(w=>wrap(w));let next=0,completed=0;const results=[],errors=[],costs=[],pending=[];let writeMs=0,storeMs=0;
 async function write(items){const t=performance.now();if(items.length===1)await cache.cacheSnapshot(items[0]);else{await new Promise((resolve,reject)=>{const open=indexedDB.open('pdx-eu5-snapshots',4);open.onsuccess=()=>{const db=open.result;const tx=db.transaction('snapshots','readwrite');for(const s of items)tx.objectStore('snapshots').put(s);tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error)};open.onerror=()=>reject(open.error)});}writeMs+=performance.now()-t;}
 const started=performance.now();window.progress={completed,total:files.length};
 const readers=[];
 let hashPromises=[];
 if(nativeHash){
   const hashUrl=URL.createObjectURL(new Blob([`self.onmessage=async({data:file})=>{try{const bytes=new Uint8Array(await file.arrayBuffer());const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');bytes.buffer.transfer(0);self.postMessage({hash});}catch(e){self.postMessage({error:String(e)})}self.close();};`],{type:'text/javascript'}));
   function hashFile(file){return new Promise((resolve,reject)=>{const w=new Worker(hashUrl);readers.push(w);w.onmessage=({data})=>{w.terminate();data.error?reject(Error(data.error)):resolve(data)};w.onerror=e=>{w.terminate();reject(Error(e.message))};w.postMessage(file);});}
   let chain=Promise.resolve();
   hashPromises=files.map(file=>{const result=chain.then(()=>hashFile(file));chain=result.catch(()=>{});return result;});

 }

 async function accept(r,file,t){costs.push({...r.timings,wasmBytes:r.wasmBytes,streamReadCalls:r.streamReadCalls,rpcMs:performance.now()-t,cacheHit:r.cacheHit});results.push(r.snapshot);const s=performance.now();useHistory.getState().add([r.snapshot],{[r.snapshot.hash]:file});storeMs+=performance.now()-s;if(cold){if(writeBatch===1)await write([r.snapshot]);else pending.push(r.snapshot);}}
 try{
 if(pipeline){
  const reader=new Worker('/app/features/eu5/history/snapshot-worker.ts?worker_file&type=module',{type:'module'});readers.push(reader);const read=wrap(reader);let ahead=read.prepare(files[0]);
  for(let i=0;i<files.length;i++){const file=files[i],t=performance.now();try{const prepared=await ahead;if(i+1<files.length)ahead=read.prepare(files[i+1]);const r=await proxies[0].parseSnapshot(file,transfer({cold,discard,prepared},[prepared.bytes.buffer]));if(!stream&&r.snapshot.hash!==manifest[file.name])throw Error("Normal parser source SHA-256 mismatch");await accept(r,file,t);}catch(e){errors.push({file:file.name,error:String(e)})}completed++;window.progress={completed,total:files.length};}
 }else{
 await Promise.all(proxies.map(async (initial,slot)=>{let proxy=initial,jobs=0;while(next<files.length){const index=next++,file=files[index],t=performance.now();try{const verifiedHash=nativeHash?(await hashPromises[index]).hash:undefined;if(verifiedHash&&verifiedHash!==manifest[file.name])throw Error("Native source SHA-256 mismatch");const r=await proxy.parseSnapshot(file,{cold,discard,stream,chunk,hashSource,expectedHash:stream?b3Manifest[file.name]:manifest[file.name],selective,verifiedHash,bridge});if(!stream&&r.snapshot.hash!==manifest[file.name])throw Error("Normal parser source SHA-256 mismatch");await accept(r,file,t);}catch(e){errors.push({file:file.name,error:String(e)})}completed++;window.progress={completed,total:files.length};jobs++;if(recycle&&jobs%recycle===0&&next<files.length){workers[slot].terminate();const w=new Worker('/app/features/eu5/history/snapshot-worker.ts?worker_file&type=module',{type:'module'});workers[slot]=w;proxy=wrap(w);}}}));}
 if(pending.length)await write(pending);
 }finally{[...workers,...readers].forEach(w=>w.terminate());}
 const elapsedMs=performance.now()-started;
 results.sort((a,b)=>a.dateSort-b.dateSort);
 const canonical=results.map(r=>({...r,hash:manifest[r.fileName]}));
 const bytes=new TextEncoder().encode(JSON.stringify(canonical,(_key,value)=>value instanceof Map?{__map:[...value]}:value));const fingerprint=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
 return {elapsedMs,success:results.length,errors,writeMs,storeMs,fingerprint,resultBytes:bytes.length,first:results[0]?.date,last:results.at(-1)?.date,costs};
}'''
async def main():
 files=json.loads(args.census.read_text());manifest={Path(f).name:Path(f).resolve().stem for _,f,_ in files};b3Manifest=json.loads(args.hashes.read_text()) if args.hashes else manifest
 if args.algorithm=='sha256' and args.hashes:manifest=b3Manifest
 if not 1<=len(files)<=20:raise ValueError('Use 1 to 20 saves per iteration')
 print('CENSUS',len(files),flush=True)
 async with async_playwright() as p:
  browser=await p.chromium.connect_over_cdp(args.cdp);context=browser.contexts[0]
  source=await (await context.request.get(APP+'/app/features/eu5/history/snapshot-worker.ts?worker_file&type=module')).text();source=source.split('//# sourceMappingURL')[0]
  source=source.replace('parseSnapshot(file) {','parseSnapshot(file, options = {}) {\n const timings={}; let mark=performance.now(); const lap=k=>{const now=performance.now();timings[k]=now-mark;mark=now;};')
  source=source.replace('const hash =','lap("readMs");\n const hash =').replace('const cached = await cachedSnapshot(hash).catch(() => undefined);','lap("hashMs");\n const cached = options.cold ? undefined : await cachedSnapshot(hash).catch(() => undefined);\n lap("lookupMs");')
  source=source.replace('cacheHit: true','timings, cacheHit: true').replace('cacheHit: false','timings, cacheHit: false')
  source=source.replace('const parser =','lap("initMs");\n const parser =').replace('const snapshot = parser.parse_snapshot();','lap("openMs");\n const snapshot = parser.parse_snapshot();\n lap("parseMs");')
  source=source.replace('import { expose }','import { expose, transfer }')
  source=source.replace('let ready;', 'let ready; let wasmExports;')
  source=source.replace('await init({ module_or_path: wasmUrl });','wasmExports = await init({ module_or_path: wasmUrl });')
  source=source.replace('const bytes = new Uint8Array(await file.arrayBuffer());','const bytes = options.prepared?.bytes ?? new Uint8Array(await file.arrayBuffer());')
  source=source.replace('const hash = [','const hash = options.prepared?.hash ?? [')
  source=source.replace('const cached = options.cold', 'const cached = options.cold')
  source=source.replace('if (cached) return {', 'if (cached && options.discard) bytes.buffer.transfer(0);\n if (cached) return {')
  source=source.replace('const metadata = parser.meta();', 'if (options.discard && bytes.byteLength) bytes.buffer.transfer(0);\n const metadata = parser.meta();')
  source=source.replace('cacheHit: false','wasmBytes:wasmExports?.memory.buffer.byteLength, cacheHit: false')
  source=source.replace('expose({ parseSnapshot });', 'async function prepare(file){const bytes=new Uint8Array(await file.arrayBuffer());const hash=[...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))].map(v=>v.toString(16).padStart(2,"0")).join("");return transfer({bytes,hash},[bytes.buffer]);}\n expose({parseSnapshot,prepare});')
  source=source.replace('expose({parseSnapshot,prepare});', '''async function hashFile(file){const bytes=new Uint8Array(await file.arrayBuffer());const hash=[...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))].map(v=>v.toString(16).padStart(2,"0")).join("");bytes.buffer.transfer(0);return {hash};} expose({parseSnapshot,prepare,hashFile});''')
  source='import {createBridge} from "/__bounded/bridge.js";'+source
  source='import streamInit,{stream_snapshot} from "/__stream-prototype/eu5_streaming.js";let streamReady;\n'+source
  source=source.replace('export async function parseSnapshot(file, options = {}) {', """export async function parseSnapshot(file, options = {}) {
    if(options.stream){
      const start=performance.now();const exports=await(streamReady??=streamInit());
      const reader=new FileReaderSync();let previous=null,calls=0;const bridge=options.bridge?await createBridge(file,options.chunk):null;
      const callback=(offset,length)=>{calls++;if(bridge)return bridge.read(offset,length);previous?.buffer.transfer(0);previous=new Uint8Array(reader.readAsArrayBuffer(file.slice(offset,offset+length)));return previous;};
      let r;try{r=stream_snapshot(callback,options.chunk,options.hashSource,options.selective);}finally{bridge?.close();previous?.buffer.transfer(0);previous=null;}
      if(r.bytesRead!==file.size)throw Error(`Stream read ${r.bytesRead}/${file.size} bytes`);
      if(r.hash&&r.hash!==options.expectedHash)throw Error('Raw SHA-256 mismatch');
      const marketLabels={};for(const m of r.snapshot.markets)if(m.centerName)marketLabels[m.center]=m.centerName.replaceAll('_',' ');
      return {snapshot:{...r.snapshot,hash:r.hash??options.verifiedHash??options.expectedHash,fileName:file.name,marketLabels},cacheHit:false,timings:{streamMs:performance.now()-start},wasmBytes:exports.memory.buffer.byteLength,streamReadCalls:calls};
    }
""")
  if args.algorithm=='blake3':source=source.replace('hash:r.hash??options.verifiedHash??options.expectedHash',"hash:r.hash?('blake3:'+r.hash):(options.verifiedHash??options.expectedHash)")
  async def artifact(r):
   f=ARTIFACTS/r.request.url.rsplit('/',1)[1];await r.fulfill(status=200,headers={'Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Opener-Policy':'same-origin'},content_type='application/wasm' if f.suffix=='.wasm' else 'text/javascript',body=f.read_bytes())
  await context.route('**/__stream-prototype/*',artifact)
  async def bridgeArtifact(r):
   await r.fulfill(status=200,headers={'Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Opener-Policy':'same-origin'},content_type='text/javascript',body=(ROOT/r.request.url.rsplit('/',1)[1]).read_bytes())
  await context.route('**/__bounded/*',bridgeArtifact)
  async def route(r):await r.fulfill(status=200,headers={'Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Opener-Policy':'same-origin'},content_type='text/javascript',body=source)
  await context.route('**/snapshot-worker.ts?worker_file&type=module',route)
  await context.route('**/eu5-import-bench',lambda r:r.fulfill(status=200,headers={'Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Opener-Policy':'same-origin'},content_type='text/html',body='<title>Isolated EU5 import benchmark</title><input type="file" multiple>'))
  results=[]
  cases=[('full-1',1,False,0,True,False,False,False),('full-2',2,False,0,True,False,False,False),('bounded-2',2,True,8*1024*1024,True,True,False,True),('bounded-4',4,True,8*1024*1024,True,True,False,True),('bounded-8',8,True,8*1024*1024,True,True,False,True),('bounded-16',16,True,8*1024*1024,True,True,False,True)]
  for repeat in range(args.repeats):
   for label,n,stream,chunk,hashSource,selective,nativeHash,bridge in (cases if repeat==0 else list(reversed(cases))):
    page=await context.new_page();await page.goto(APP+'/eu5-import-bench');cdp=await context.new_cdp_session(page)
    doc=(await cdp.send('DOM.getDocument'))['root']['nodeId'];node=(await cdp.send('DOM.querySelector',{'nodeId':doc,'selector':'input'}))['nodeId'];await cdp.send('DOM.setFileInputFiles',{'nodeId':node,'files':[f[1] for f in files]})
    r0=resources();t=time.monotonic();samples=[];task=asyncio.create_task(page.evaluate(JS,{'concurrency':n,'cold':True,'writeBatch':20,'discard':False,'pipeline':False,'recycle':0,'stream':stream,'chunk':chunk,'hashSource':hashSource,'manifest':manifest,'selective':selective,'nativeHash':nativeHash,'b3Manifest':b3Manifest,'bridge':bridge}));last=t
    while not task.done():
     await asyncio.sleep(1);samples.append(resources())
     if time.monotonic()-last>25:
      print('PROGRESS',repeat,label,await page.evaluate('window.progress'),flush=True);last=time.monotonic()
    data=await task;r1=resources();wall=time.monotonic()-t
    data.update(label=label,repeat=repeat,pssStartMiB=r0['pssMiB'],pssPeakMiB=max(s['pssMiB'] for s in samples),cpuSeconds=r1['cpuSeconds']-r0['cpuSeconds'],sampleWallSeconds=wall)
    results.append(data);(OUT/'results.json').write_text(json.dumps(results,indent=2))
    if data['success']!=len(files) or data['errors']:raise RuntimeError(data['errors'])
    if len({r['fingerprint'] for r in results})!=1:raise RuntimeError('Snapshot digest differs from baseline')
    print('RESULT',json.dumps({k:v for k,v in data.items() if k not in ['costs','errors']}),'ERRORS',data['errors'],flush=True)
    await page.close();await asyncio.sleep(2)
asyncio.run(main())
